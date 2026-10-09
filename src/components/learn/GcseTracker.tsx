"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  GCSE_COLUMNS,
  GCSE_HISTORY_COLUMNS,
  GCSE_ROW_TINT,
  GCSE_STATUS_META,
  TREND_META,
  actualTrend,
  downloadCsv,
  explainGap,
  gcseStatus,
  gradeFromLabel,
  isGcseYear,
  parsePastedGrades,
  toCsv,
  trendDirection,
  type GcseHistoryRow,
  type GcseRow,
  type GcseStatus,
} from "@/lib/learn/gcse";
import { BoundaryCalculator, GcseStatusChip, GradeChip, TrendLine, gradeOptions } from "@/components/learn/gcse/GcseParts";
import { GcsePupilDrawer, type PupilSubjectRow } from "@/components/learn/gcse/GcsePupilDrawer";

export { GcseStatusChip };

type Edit = { target: string; predicted: string; actual: string; assessmentId: string | null; comment: string };
type Pupil = { id: string; name: string };
type Field = "target" | "predicted" | "actual";

const toNum = (v: string): number | null => (v === "" ? null : Number(v));
const toStr = (n: number | null | undefined): string => (n === null || n === undefined ? "" : String(n));
const sameEdit = (a: Edit | undefined, b: Edit | undefined) => !!a && !!b && a.target === b.target && a.predicted === b.predicted && a.actual === b.actual && a.comment === b.comment && a.assessmentId === b.assessmentId;

function GradeSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="w-14 rounded-md border border-gold-light/60 bg-white px-1.5 py-1 text-sm">
      <option value="">–</option>
      {gradeOptions()}
    </select>
  );
}

const FIELD_LABEL: Record<Field, string> = { target: "Target", predicted: "Predicted", actual: "Actual" };

/**
 * Teacher/admin editor for one GCSE class (Year 10 or 11, with a subject set
 * on the class): a single table of target, predicted and actual grades (1-9)
 * for every pupil with status, trend and comment, fill-down and paste-from-
 * spreadsheet bulk entry, one Save for all changes, CSV export, a pupil
 * history drawer (with mock exam entry) and a grade boundaries helper.
 * Renders nothing for a class that isn't a GCSE class.
 */
export function GcseClassPanel({ classId, onSaved }: { classId: string; onSaved?: () => void }) {
  const supabase = getSupabaseClient();
  const [cls, setCls] = useState<{ name: string; year_group: string | null; subject_id: string | null; subjects: { name: string } | null } | null>(null);
  const [pupils, setPupils] = useState<Pupil[]>([]);
  const [gradeRows, setGradeRows] = useState<Record<string, GcseRow>>({});
  const [history, setHistory] = useState<GcseHistoryRow[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [base, setBase] = useState<Record<string, Edit>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [drawerChild, setDrawerChild] = useState<string | null>(null);
  const [fillField, setFillField] = useState<Field>("predicted");
  const [fillValue, setFillValue] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteInfo, setPasteInfo] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!supabase || !classId) return;
    const { data: c } = await supabase.from("classes").select("name, year_group, subject_id, subjects(name)").eq("id", classId).maybeSingle();
    const klass = (c as unknown as { name: string; year_group: string | null; subject_id: string | null; subjects: { name: string } | null } | null) || null;
    setCls(klass);
    if (!klass || !klass.subject_id || !isGcseYear(klass.year_group)) return;
    const [{ data: enr }, { data: grades }, { data: hist }] = await Promise.all([
      supabase.from("enrolments").select("child_id, children(id, name)").eq("class_id", classId),
      supabase.from("gcse_grades").select(GCSE_COLUMNS).eq("class_id", classId).eq("subject_id", klass.subject_id),
      supabase.from("gcse_grade_history").select(GCSE_HISTORY_COLUMNS).eq("class_id", classId).eq("subject_id", klass.subject_id).order("recorded_at", { ascending: true }).limit(3000),
    ]);
    const kids = ((enr as unknown as { children: Pupil | null }[]) || []).map((r) => r.children).filter(Boolean) as Pupil[];
    kids.sort((a, b) => a.name.localeCompare(b.name));
    setPupils(kids);
    setHistory((hist as GcseHistoryRow[] | null) || []);
    const byChild: Record<string, GcseRow> = {};
    for (const g of (grades as GcseRow[] | null) || []) byChild[g.child_id] = g;
    setGradeRows(byChild);
    const next: Record<string, Edit> = {};
    for (const k of kids) {
      const g = byChild[k.id];
      next[k.id] = { target: toStr(g?.target_grade), predicted: toStr(g?.predicted_grade), actual: toStr(g?.actual_grade), assessmentId: g?.actual_assessment_id || null, comment: g?.comment || "" };
    }
    setEdits(next);
    setBase(next);
  }, [supabase, classId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  const dirtyIds = useMemo(() => pupils.filter((p) => !sameEdit(edits[p.id], base[p.id])).map((p) => p.id), [pupils, edits, base]);

  useEffect(() => {
    if (dirtyIds.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyIds.length]);

  const patch = (childId: string, p: Partial<Edit>) => setEdits((prev) => ({ ...prev, [childId]: { ...prev[childId], ...p } }));

  const trendFor = useCallback((childId: string) => actualTrend(history.filter((h) => h.child_id === childId)), [history]);

  const fillDown = (onlyBlank: boolean) => {
    if (!fillValue) return setMsg({ ok: false, text: "Choose the grade to fill with first." });
    setEdits((prev) => {
      const next = { ...prev };
      for (const p of pupils) {
        const e = next[p.id];
        if (!e) continue;
        if (onlyBlank && e[fillField] !== "") continue;
        next[p.id] = { ...e, [fillField]: fillValue, ...(fillField === "actual" ? { assessmentId: null } : {}) };
      }
      return next;
    });
    setMsg({ ok: true, text: `${FIELD_LABEL[fillField]} set to ${fillValue} ${onlyBlank ? "for pupils without one" : "for everyone"}. Press Save to keep it.` });
  };

  const actualsFromAssessments = async () => {
    if (!supabase || pupils.length === 0) return;
    const { data } = await supabase
      .from("assessments")
      .select("id, child_id, grade_label, date")
      .eq("class_id", classId)
      .in("child_id", pupils.map((p) => p.id))
      .not("grade_label", "is", null)
      .order("date", { ascending: false })
      .limit(2000);
    const seen = new Set<string>();
    const found: Record<string, { grade: number; id: string }> = {};
    for (const a of (data as { id: string; child_id: string; grade_label: string | null }[] | null) || []) {
      if (seen.has(a.child_id)) continue;
      const g = gradeFromLabel(a.grade_label);
      if (g !== null) {
        seen.add(a.child_id);
        found[a.child_id] = { grade: g, id: a.id };
      }
    }
    const n = Object.keys(found).length;
    setEdits((prev) => {
      const next = { ...prev };
      for (const [cid, f] of Object.entries(found)) if (next[cid]) next[cid] = { ...next[cid], actual: String(f.grade), assessmentId: f.id };
      return next;
    });
    setMsg(n === 0 ? { ok: false, text: "No assessments with a 1-9 grade label were found for this class." } : { ok: true, text: `Took the latest assessment grade for ${n} ${n === 1 ? "pupil" : "pupils"}. Press Save to keep it.` });
  };

  const applyPaste = () => {
    const { rows, errors } = parsePastedGrades(pasteText);
    const byName = new Map(pupils.map((p) => [p.name.trim().toLowerCase(), p.id] as const));
    setEdits((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        const id = byName.get(r.name.trim().toLowerCase());
        if (!id || !next[id]) continue;
        const e = next[id];
        next[id] = {
          ...e,
          target: r.target !== null ? String(r.target) : e.target,
          predicted: r.predicted !== null ? String(r.predicted) : e.predicted,
          actual: r.actual !== null ? String(r.actual) : e.actual,
          assessmentId: r.actual !== null ? null : e.assessmentId,
        };
      }
      return next;
    });
    const matchedCount = rows.filter((r) => byName.has(r.name.trim().toLowerCase())).length;
    const missing = rows.filter((r) => !byName.has(r.name.trim().toLowerCase())).map((r) => `Not in this class: ${r.name}`);
    setPasteInfo([`${matchedCount} ${matchedCount === 1 ? "pupil" : "pupils"} filled in. Press Save to keep it.`, ...missing, ...errors]);
    if (matchedCount > 0 && errors.length === 0 && missing.length === 0) {
      setPasteText("");
      setPasteOpen(false);
      setMsg({ ok: true, text: `${matchedCount} ${matchedCount === 1 ? "pupil" : "pupils"} filled in from the pasted rows. Press Save to keep it.` });
    }
  };

  const saveAll = async () => {
    if (!supabase || !cls?.subject_id || dirtyIds.length === 0) return;
    setSaving(true);
    setMsg(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const rows = dirtyIds.map((id) => {
        const e = edits[id];
        return {
          child_id: id,
          subject_id: cls.subject_id as string,
          class_id: classId,
          target_grade: toNum(e.target),
          predicted_grade: toNum(e.predicted),
          actual_grade: toNum(e.actual),
          actual_assessment_id: e.actual ? e.assessmentId : null,
          comment: e.comment.trim() || null,
          entered_by: user.id,
        };
      });
      const { error } = await supabase.from("gcse_grades").upsert(rows, { onConflict: "child_id,subject_id" });
      if (error) return setMsg({ ok: false, text: `Couldn't save: ${error.message}` });
      setMsg({ ok: true, text: `Saved ${rows.length} ${rows.length === 1 ? "pupil" : "pupils"}.` });
      await load();
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const rows = pupils.map((p) => {
      const e = edits[p.id];
      const { status, gap } = gcseStatus({ target_grade: toNum(e.target), predicted_grade: toNum(e.predicted), actual_grade: toNum(e.actual) });
      return [p.name, cls?.subjects?.name || cls?.name || "", e.target, e.predicted, e.actual, gap, GCSE_STATUS_META[status].label, e.comment];
    });
    downloadCsv(`gcse-${(cls?.name || "class").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`, toCsv(["Pupil", "Subject", "Target", "Predicted", "Actual", "Gap", "Status", "Comment"], rows));
  };

  const summary = useMemo(() => {
    const counts: Record<GcseStatus, number> = { behind: 0, no_data: 0, on_track: 0, ahead: 0 };
    let sumActual = 0;
    let nActual = 0;
    let sumPred = 0;
    let nPred = 0;
    for (const p of pupils) {
      const e = edits[p.id];
      if (!e) continue;
      counts[gcseStatus({ target_grade: toNum(e.target), predicted_grade: toNum(e.predicted), actual_grade: toNum(e.actual) }).status] += 1;
      if (e.actual) {
        sumActual += Number(e.actual);
        nActual += 1;
      }
      if (e.predicted) {
        sumPred += Number(e.predicted);
        nPred += 1;
      }
    }
    return { counts, avgActual: nActual ? sumActual / nActual : null, avgPred: nPred ? sumPred / nPred : null };
  }, [pupils, edits]);

  if (!cls || !cls.subject_id || !isGcseYear(cls.year_group)) return null;

  const drawerPupil = pupils.find((p) => p.id === drawerChild);
  const drawerRow = drawerChild ? gradeRows[drawerChild] : undefined;
  const drawerRows: PupilSubjectRow[] = drawerRow ? [{ ...drawerRow, subject_name: cls.subjects?.name || cls.name }] : [];

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-h3 font-semibold text-ink">GCSE grades — {cls.subjects?.name || cls.name}</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink/60">
            Target, predicted and actual grade on the 1–9 scale. Behind or on track compares the actual grade with the prediction (the target if there is no prediction). Pupils and parents see these grades and a plain-English explanation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={exportCsv} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-medium text-ink/80 hover:bg-cream">
            Export CSV
          </button>
          <button type="button" disabled={saving || dirtyIds.length === 0} onClick={saveAll} className="rounded-lg bg-gold-700 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-gold-900 disabled:opacity-50">
            {saving ? "Saving…" : dirtyIds.length > 0 ? `Save changes (${dirtyIds.length})` : "Saved"}
          </button>
        </div>
      </div>

      {pupils.length === 0 ? (
        <p className="mt-3 text-sm text-ink/60">No pupils enrolled in this class.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2 text-xs" aria-label="Class summary">
            {(["behind", "on_track", "ahead", "no_data"] as GcseStatus[]).map((s) => (
              <span key={s} className={`rounded-full px-2.5 py-1 ${GCSE_STATUS_META[s].className}`}>
                {GCSE_STATUS_META[s].label}: {summary.counts[s]}
              </span>
            ))}
            {summary.avgActual !== null && (
              <span className="rounded-full bg-cream px-2.5 py-1 text-ink/70">
                Average actual {summary.avgActual.toFixed(1)}
                {summary.avgPred !== null ? ` · predicted ${summary.avgPred.toFixed(1)}` : ""}
              </span>
            )}
          </div>

          <div className="mt-4 space-y-3 rounded-xl border border-gold-light/40 bg-cream/40 p-3 text-xs text-ink/70">
            <div className="flex flex-wrap items-end gap-2">
              <span className="pb-1.5 font-medium text-ink">Fill down</span>
              <label>
                <span className="sr-only">Column</span>
                <select value={fillField} onChange={(e) => setFillField(e.target.value as Field)} className="rounded-md border border-gold-light/60 bg-white px-2 py-1.5 text-sm">
                  {(Object.keys(FIELD_LABEL) as Field[]).map((f) => (
                    <option key={f} value={f}>
                      {FIELD_LABEL[f]}
                    </option>
                  ))}
                </select>
              </label>
              <GradeSelect value={fillValue} onChange={setFillValue} label="Grade to fill with" />
              <button type="button" onClick={() => fillDown(true)} className="rounded-lg border border-gold-light bg-white px-2.5 py-1.5 font-medium text-ink/80 hover:bg-cream">
                Fill blanks
              </button>
              <button type="button" onClick={() => fillDown(false)} className="rounded-lg border border-gold-light bg-white px-2.5 py-1.5 font-medium text-ink/80 hover:bg-cream">
                Set all
              </button>
              <span className="mx-1 hidden h-6 w-px bg-gold-light/60 sm:block" aria-hidden="true" />
              <button type="button" onClick={actualsFromAssessments} className="rounded-lg border border-gold-light bg-white px-2.5 py-1.5 font-medium text-ink/80 hover:bg-cream">
                Actuals from latest assessments
              </button>
              <button type="button" aria-expanded={pasteOpen} onClick={() => setPasteOpen((v) => !v)} className="rounded-lg border border-gold-light bg-white px-2.5 py-1.5 font-medium text-ink/80 hover:bg-cream">
                Paste from spreadsheet
              </button>
            </div>
            {pasteOpen && (
              <div>
                <label className="block font-medium text-ink">
                  Paste rows: pupil name, target, predicted, actual (leave a cell blank to keep what is there)
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={5}
                    placeholder={"Aisha Khan\t7\t7\t6\nOmar Ali\t5\t6\t"}
                    className="mt-1 block w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2 font-mono text-xs"
                  />
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button type="button" disabled={!pasteText.trim()} onClick={applyPaste} className="rounded-lg bg-gold-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
                    Fill the table
                  </button>
                  <span>Names must match the class list. Nothing is saved until you press Save.</span>
                </div>
                {pasteInfo.length > 0 && (
                  <ul role="status" className="mt-2 list-disc space-y-0.5 pl-5">
                    {pasteInfo.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="text-xs text-ink/60">
                  <th className="py-1.5 pr-3 font-medium">Pupil</th>
                  <th className="py-1.5 pr-2 font-medium">Target</th>
                  <th className="py-1.5 pr-2 font-medium">Predicted</th>
                  <th className="py-1.5 pr-3 font-medium">Actual</th>
                  <th className="py-1.5 pr-3 font-medium">Status</th>
                  <th className="py-1.5 pr-3 font-medium">Trend</th>
                  <th className="py-1.5 pr-3 font-medium">Comment</th>
                  <th className="py-1.5 font-medium"><span className="sr-only">History</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold-light/30">
                {pupils.map((p) => {
                  const e = edits[p.id];
                  if (!e) return null;
                  const row = { target_grade: toNum(e.target), predicted_grade: toNum(e.predicted), actual_grade: toNum(e.actual) };
                  const { status } = gcseStatus(row);
                  const tr = trendFor(p.id);
                  const dir = TREND_META[trendDirection(tr)];
                  const dirty = !sameEdit(e, base[p.id]);
                  return (
                    <tr key={p.id} className={GCSE_ROW_TINT[status]}>
                      <td className="py-1.5 pr-3 font-medium text-ink">
                        {p.name}
                        {dirty && <span className="ml-1.5 text-[10px] font-semibold uppercase text-amber-700">edited</span>}
                      </td>
                      <td className="py-1.5 pr-2">
                        <GradeSelect value={e.target} onChange={(v) => patch(p.id, { target: v })} label={`${p.name} target grade`} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <GradeSelect value={e.predicted} onChange={(v) => patch(p.id, { predicted: v })} label={`${p.name} predicted grade`} />
                      </td>
                      <td className="py-1.5 pr-3">
                        <GradeSelect value={e.actual} onChange={(v) => patch(p.id, { actual: v, assessmentId: null })} label={`${p.name} actual grade`} />
                      </td>
                      <td className="py-1.5 pr-3">
                        <GcseStatusChip row={row} />
                      </td>
                      <td className="py-1.5 pr-3">
                        <span className="flex items-center gap-1.5">
                          <TrendLine points={tr} target={row.target_grade} predicted={row.predicted_grade} width={72} height={28} />
                          <span className={`text-xs ${dir.className}`} title={dir.label}>
                            {dir.symbol}
                            <span className="sr-only"> {dir.label}</span>
                          </span>
                        </span>
                      </td>
                      <td className="py-1.5 pr-3">
                        <input
                          type="text"
                          value={e.comment}
                          onChange={(ev) => patch(p.id, { comment: ev.target.value })}
                          maxLength={500}
                          placeholder="Optional"
                          aria-label={`${p.name} comment`}
                          className="w-full min-w-[9rem] rounded-md border border-gold-light/60 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="py-1.5">
                        <button
                          type="button"
                          disabled={!gradeRows[p.id]}
                          onClick={() => setDrawerChild(p.id)}
                          title={gradeRows[p.id] ? "History, mock exams and next steps" : "Save grades first to open the history"}
                          className="whitespace-nowrap rounded-md border border-gold-light bg-white px-2 py-1 text-xs font-medium text-ink/80 hover:bg-cream disabled:opacity-40"
                        >
                          History
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-ink/65">Trend line: solid = actual grade over time (gold dot = mock exam), dashed = target, dotted = predicted.</p>
          <div className="mt-3">
            <BoundaryCalculator />
          </div>
        </>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`mt-3 text-sm ${msg.ok ? "text-teal-700" : "text-red-700"}`}>
          {msg.text}
        </p>
      )}
      {drawerPupil && (
        <GcsePupilDrawer
          childId={drawerPupil.id}
          childName={drawerPupil.name}
          rows={drawerRows}
          canEdit
          onClose={() => setDrawerChild(null)}
          onChanged={() => {
            if (dirtyIds.length === 0) void load();
            else setMsg({ ok: true, text: "Mock result saved. Save your table changes to refresh the grades and trend." });
          }}
        />
      )}
    </div>
  );
}

type ChildRow = GcseRow & { subjects: { name: string } | null };

/**
 * Family/student dashboard card: nothing is rendered unless the child has GCSE grades.
 * One card per subject with the three grades, the trend, what the gap means and
 * what to do next, plus the history of changes.
 */
export function GcseProgressWidget({ childId }: { childId: string }) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<ChildRow[] | null>(null);
  const [history, setHistory] = useState<GcseHistoryRow[]>([]);

  useEffect(() => {
    if (!supabase || !childId) return;
    supabase
      .from("gcse_grades")
      .select(`${GCSE_COLUMNS}, subjects(name)`)
      .eq("child_id", childId)
      .then(({ data }) => setRows((data as unknown as ChildRow[]) || []));
    supabase
      .from("gcse_grade_history")
      .select(GCSE_HISTORY_COLUMNS)
      .eq("child_id", childId)
      .order("recorded_at", { ascending: true })
      .limit(500)
      .then(({ data, error }) => setHistory(error ? [] : ((data as GcseHistoryRow[] | null) || [])));
  }, [supabase, childId]);

  const sorted = useMemo(() => (rows || []).slice().sort((a, b) => (a.subjects?.name || "").localeCompare(b.subjects?.name || "")), [rows]);
  const counts = useMemo(() => {
    const c: Record<GcseStatus, number> = { behind: 0, no_data: 0, on_track: 0, ahead: 0 };
    for (const r of sorted) c[gcseStatus(r).status] += 1;
    return c;
  }, [sorted]);

  if (rows === null || rows.length === 0) return null;

  return (
    <div className="sm:col-span-2">
      <h3 className="text-sm font-medium text-ink">GCSE progress</h3>
      <p className="mt-1 text-xs text-ink/60">
        {counts.behind > 0 ? `${counts.behind} ${counts.behind === 1 ? "subject is" : "subjects are"} below the predicted grade. ` : ""}
        {counts.on_track + counts.ahead > 0 ? `${counts.on_track + counts.ahead} on track or ahead. ` : ""}
        {counts.no_data > 0 ? `${counts.no_data} waiting for a current grade.` : ""}
      </p>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {sorted.map((r) => {
          const trend = actualTrend(history.filter((h) => h.subject_id === r.subject_id));
          const dir = TREND_META[trendDirection(trend)];
          const ex = explainGap(r, trend);
          const hist = history.filter((h) => h.subject_id === r.subject_id).slice().reverse();
          return (
            <li key={r.id} className={`rounded-xl border border-gold-light/50 p-3 ${GCSE_ROW_TINT[gcseStatus(r).status]}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{r.subjects?.name || "Subject"}</span>
                <GcseStatusChip row={r} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink/60">
                <span className="flex items-center gap-1">Target <GradeChip grade={r.target_grade} kind="Target" /></span>
                <span className="flex items-center gap-1">Predicted <GradeChip grade={r.predicted_grade} kind="Predicted" /></span>
                <span className="flex items-center gap-1">Actual <GradeChip grade={r.actual_grade} kind="Actual" /></span>
                {trend.length > 1 && (
                  <span className="flex items-center gap-1.5">
                    <TrendLine points={trend} target={r.target_grade} predicted={r.predicted_grade} width={84} height={30} />
                    <span className={dir.className}>{dir.symbol} {dir.label}</span>
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm font-medium text-ink">{ex.headline}</p>
              <details className="mt-1 text-xs text-ink/70">
                <summary className="cursor-pointer font-medium text-teal-800">What this means and what to do next</summary>
                <p className="mt-1.5 leading-relaxed">{ex.detail}</p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                  {ex.nextSteps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                {hist.length > 1 && (
                  <>
                    <p className="mt-2 font-medium text-ink">Grade history</p>
                    <ul className="mt-1 space-y-0.5">
                      {hist.slice(0, 8).map((h) => (
                        <li key={h.id}>
                          {new Date(h.recorded_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          {h.kind === "mock" ? ` · ${h.label || "Mock exam"}${h.mark !== null && h.out_of !== null ? ` (${h.mark}/${h.out_of})` : ""}` : ""}
                          {` · actual ${h.actual_grade ?? "–"}`}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </details>
              {r.comment && <p className="mt-2 rounded-lg bg-cream/70 px-2.5 py-1.5 text-xs text-ink/75">Teacher comment: {r.comment}</p>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-ink/65">Grades are on the 9–1 scale (9 is highest). Predicted grades are a teacher&apos;s best estimate and change as work comes in.</p>
    </div>
  );
}
