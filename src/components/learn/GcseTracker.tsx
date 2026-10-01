"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { GCSE_COLUMNS, GCSE_GRADES, GCSE_STATUS_META, gcseStatus, gradeFromLabel, isGcseYear, type GcseRow } from "@/lib/learn/gcse";

export function GcseStatusChip({ row }: { row: Pick<GcseRow, "target_grade" | "predicted_grade" | "actual_grade"> }) {
  const { status, gap } = gcseStatus(row);
  const meta = GCSE_STATUS_META[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${meta.className}`}>
      {meta.label}
      {gap !== null && gap !== 0 ? ` (${gap > 0 ? "+" : ""}${gap})` : ""}
    </span>
  );
}

type Edit = { target: string; predicted: string; actual: string; assessmentId: string | null; comment: string };
type Pupil = { id: string; name: string };

const toNum = (v: string): number | null => (v === "" ? null : Number(v));
const toStr = (n: number | null | undefined): string => (n === null || n === undefined ? "" : String(n));

function GradeSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="w-16 rounded-md border border-gold-light/60 px-2 py-1.5 text-sm">
      <option value="">–</option>
      {GCSE_GRADES.map((g) => (
        <option key={g} value={String(g)}>
          {g}
        </option>
      ))}
    </select>
  );
}

/**
 * Teacher/admin editor for one GCSE class (Year 10 or 11, with a subject set
 * on the class): target, predicted and actual grade (1-9) for every pupil,
 * with the actual grade optionally taken from the pupil's latest assessment
 * grade label. Renders nothing for a class that isn't a GCSE class.
 */
export function GcseClassPanel({ classId }: { classId: string }) {
  const supabase = getSupabaseClient();
  const [cls, setCls] = useState<{ name: string; year_group: string | null; subject_id: string | null; subjects: { name: string } | null } | null>(null);
  const [pupils, setPupils] = useState<Pupil[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!supabase || !classId) return;
    const { data: c } = await supabase.from("classes").select("name, year_group, subject_id, subjects(name)").eq("id", classId).maybeSingle();
    const klass = (c as unknown as { name: string; year_group: string | null; subject_id: string | null; subjects: { name: string } | null } | null) || null;
    setCls(klass);
    if (!klass || !klass.subject_id || !isGcseYear(klass.year_group)) return;
    const [{ data: enr }, { data: grades }] = await Promise.all([
      supabase.from("enrolments").select("child_id, children(id, name)").eq("class_id", classId),
      supabase.from("gcse_grades").select(GCSE_COLUMNS).eq("class_id", classId).eq("subject_id", klass.subject_id),
    ]);
    const kids = ((enr as unknown as { children: Pupil | null }[]) || []).map((r) => r.children).filter(Boolean) as Pupil[];
    kids.sort((a, b) => a.name.localeCompare(b.name));
    setPupils(kids);
    const byChild: Record<string, GcseRow> = {};
    for (const g of (grades as GcseRow[] | null) || []) byChild[g.child_id] = g;
    const next: Record<string, Edit> = {};
    for (const k of kids) {
      const g = byChild[k.id];
      next[k.id] = {
        target: toStr(g?.target_grade),
        predicted: toStr(g?.predicted_grade),
        actual: toStr(g?.actual_grade),
        assessmentId: g?.actual_assessment_id || null,
        comment: g?.comment || "",
      };
    }
    setEdits(next);
  }, [supabase, classId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  const patch = (childId: string, p: Partial<Edit>) => setEdits((prev) => ({ ...prev, [childId]: { ...prev[childId], ...p } }));

  const fromAssessment = async (childId: string) => {
    if (!supabase) return;
    const { data } = await supabase
      .from("assessments")
      .select("id, grade_label, date")
      .eq("class_id", classId)
      .eq("child_id", childId)
      .not("grade_label", "is", null)
      .order("date", { ascending: false })
      .limit(10);
    for (const a of (data as { id: string; grade_label: string | null }[] | null) || []) {
      const g = gradeFromLabel(a.grade_label);
      if (g !== null) {
        patch(childId, { actual: String(g), assessmentId: a.id });
        setMessage((m) => ({ ...m, [childId]: `Took grade ${g} from the latest assessment.` }));
        return;
      }
    }
    setMessage((m) => ({ ...m, [childId]: "No assessment with a 1-9 grade label yet." }));
  };

  const save = async (childId: string) => {
    if (!supabase || !cls?.subject_id) return;
    const e = edits[childId];
    setSavingId(childId);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("gcse_grades").upsert(
        {
          child_id: childId,
          subject_id: cls.subject_id,
          class_id: classId,
          target_grade: toNum(e.target),
          predicted_grade: toNum(e.predicted),
          actual_grade: toNum(e.actual),
          actual_assessment_id: e.actual ? e.assessmentId : null,
          comment: e.comment.trim() || null,
          entered_by: user.id,
        },
        { onConflict: "child_id,subject_id" }
      );
      setMessage((m) => ({ ...m, [childId]: error ? error.message : "Saved." }));
    } finally {
      setSavingId(null);
    }
  };

  if (!cls || !cls.subject_id || !isGcseYear(cls.year_group)) return null;

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">GCSE grades — {cls.subjects?.name || cls.name}</h2>
      <p className="mt-1 text-sm text-ink/60">
        Target, predicted and actual grade on the 1–9 scale. Behind/on track compares the actual grade with the prediction (the target if there is no prediction).
        Visible to the pupil and their parents.
      </p>
      {pupils.length === 0 ? (
        <p className="mt-3 text-sm text-ink/60">No pupils enrolled in this class.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {pupils.map((p) => {
            const e = edits[p.id];
            if (!e) return null;
            return (
              <li key={p.id} className="rounded-lg border border-gold-light/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{p.name}</span>
                  <GcseStatusChip row={{ target_grade: toNum(e.target), predicted_grade: toNum(e.predicted), actual_grade: toNum(e.actual) }} />
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-3 text-xs text-ink/70">
                  <label className="flex flex-col gap-1">
                    Target
                    <GradeSelect value={e.target} onChange={(v) => patch(p.id, { target: v })} label={`${p.name} target grade`} />
                  </label>
                  <label className="flex flex-col gap-1">
                    Predicted
                    <GradeSelect value={e.predicted} onChange={(v) => patch(p.id, { predicted: v })} label={`${p.name} predicted grade`} />
                  </label>
                  <label className="flex flex-col gap-1">
                    Actual
                    <GradeSelect value={e.actual} onChange={(v) => patch(p.id, { actual: v, assessmentId: null })} label={`${p.name} actual grade`} />
                  </label>
                  <button type="button" onClick={() => fromAssessment(p.id)} className="rounded-lg border border-gold-light bg-white px-2 py-1.5 text-xs font-medium text-ink/80 hover:bg-cream">
                    Actual from latest assessment
                  </button>
                </div>
                <input
                  type="text"
                  value={e.comment}
                  onChange={(ev) => patch(p.id, { comment: ev.target.value })}
                  maxLength={500}
                  placeholder="Comment (optional)"
                  aria-label={`${p.name} comment`}
                  className="mt-2 w-full rounded-md border border-gold-light/60 px-3 py-1.5 text-sm"
                />
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={savingId === p.id}
                    onClick={() => save(p.id)}
                    className="rounded-lg bg-gold-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gold-900 disabled:opacity-50"
                  >
                    Save
                  </button>
                  {message[p.id] && <span className="text-xs text-ink/60">{message[p.id]}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type ChildRow = GcseRow & { subjects: { name: string } | null };

/** Family/student dashboard card: nothing is rendered unless the child has GCSE grades. */
export function GcseProgressWidget({ childId }: { childId: string }) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<ChildRow[] | null>(null);

  useEffect(() => {
    if (!supabase || !childId) return;
    supabase
      .from("gcse_grades")
      .select(`${GCSE_COLUMNS}, subjects(name)`)
      .eq("child_id", childId)
      .then(({ data }) => setRows((data as unknown as ChildRow[]) || []));
  }, [supabase, childId]);

  const sorted = useMemo(() => (rows || []).slice().sort((a, b) => (a.subjects?.name || "").localeCompare(b.subjects?.name || "")), [rows]);

  if (rows === null || rows.length === 0) return null;

  return (
    <div className="sm:col-span-2">
      <h3 className="text-sm font-medium text-ink">GCSE progress</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-ink/60">
              <th className="py-1 pr-3 font-medium">Subject</th>
              <th className="py-1 pr-3 font-medium">Target</th>
              <th className="py-1 pr-3 font-medium">Predicted</th>
              <th className="py-1 pr-3 font-medium">Actual</th>
              <th className="py-1 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gold-light/30">
            {sorted.map((r) => (
              <tr key={r.id}>
                <td className="py-1.5 pr-3 text-ink">{r.subjects?.name || "Subject"}</td>
                <td className="py-1.5 pr-3">{r.target_grade ?? "–"}</td>
                <td className="py-1.5 pr-3">{r.predicted_grade ?? "–"}</td>
                <td className="py-1.5 pr-3">{r.actual_grade ?? "–"}</td>
                <td className="py-1.5">
                  <GcseStatusChip row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
