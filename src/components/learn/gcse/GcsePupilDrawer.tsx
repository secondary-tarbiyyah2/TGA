"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  GCSE_HISTORY_COLUMNS,
  TREND_META,
  actualTrend,
  boundariesValid,
  explainGap,
  gradeFromPercent,
  marksToNextGrade,
  trendDirection,
  type GcseHistoryRow,
  type GcseRow,
} from "@/lib/learn/gcse";
import { BoundaryEditor, GcseStatusChip, GradeChip, TrendLine, gradeOptions, useBoundaries } from "@/components/learn/gcse/GcseParts";

export type PupilSubjectRow = GcseRow & { subject_name: string };

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * Slide-over with one pupil's GCSE picture: per subject the three grades, the
 * trend, the history of changes, mock exam results, and (for staff) a mock
 * exam entry form that turns a mark into a grade using editable boundaries.
 */
export function GcsePupilDrawer({ childId, childName, rows, canEdit, onClose, onChanged }: { childId: string; childName: string; rows: PupilSubjectRow[]; canEdit: boolean; onClose: () => void; onChanged?: () => void }) {
  const supabase = getSupabaseClient();
  const [history, setHistory] = useState<GcseHistoryRow[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("gcse_grade_history").select(GCSE_HISTORY_COLUMNS).eq("child_id", childId).order("recorded_at", { ascending: true }).limit(500);
    setHistory(error ? [] : ((data as GcseHistoryRow[] | null) || []));
  }, [supabase, childId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── mock entry ──
  const [boundaries, setBoundaries, resetBoundaries] = useBoundaries();
  const [showBounds, setShowBounds] = useState(false);
  const [subjectRowId, setSubjectRowId] = useState(rows[0]?.id || "");
  const [label, setLabel] = useState("Mock exam");
  const [sat, setSat] = useState(() => new Date().toISOString().slice(0, 10));
  const [mark, setMark] = useState("");
  const [outOf, setOutOf] = useState("100");
  const [gradeOverride, setGradeOverride] = useState("");
  const [setActual, setSetActual] = useState(true);
  const [saving, setSaving] = useState(false);

  const m = mark === "" ? NaN : Number(mark);
  const o = Number(outOf);
  const markOk = Number.isFinite(m) && o > 0 && m >= 0 && m <= o;
  const suggested = markOk && boundariesValid(boundaries) ? gradeFromPercent((m / o) * 100, boundaries) : null;
  const chosenGrade = gradeOverride ? Number(gradeOverride) : suggested;
  const toNext = markOk && boundariesValid(boundaries) ? marksToNextGrade(m, o, boundaries) : null;

  async function saveMock() {
    if (!supabase) return;
    const row = rows.find((r) => r.id === subjectRowId);
    if (!row) return setMsg({ ok: false, text: "Choose a subject." });
    if (!markOk) return setMsg({ ok: false, text: "Enter a mark between 0 and the paper total." });
    if (chosenGrade === null || chosenGrade === undefined) return setMsg({ ok: false, text: "That mark is below grade 1: pick a grade yourself or leave it unrecorded." });
    setSaving(true);
    setMsg(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("gcse_grade_history").insert({
        grade_id: row.id,
        child_id: childId,
        subject_id: row.subject_id,
        class_id: row.class_id,
        kind: "mock",
        label: label.trim().slice(0, 80) || "Mock exam",
        actual_grade: chosenGrade,
        mark: m,
        out_of: o,
        recorded_by: user?.id ?? null,
        // The date the paper was sat (noon avoids a timezone flip to the previous day).
        recorded_at: /^\d{4}-\d{2}-\d{2}$/.test(sat) ? new Date(`${sat}T12:00:00`).toISOString() : new Date().toISOString(),
      });
      if (error) return setMsg({ ok: false, text: "Couldn't save the mock result. Migration 0089 may not be applied yet, or you can't edit this class." });
      if (setActual) {
        const { error: e2 } = await supabase.from("gcse_grades").update({ actual_grade: chosenGrade, actual_assessment_id: null }).eq("id", row.id);
        if (e2) setMsg({ ok: false, text: "Mock saved, but the actual grade could not be updated." });
        else setMsg({ ok: true, text: `Mock saved and the actual grade is now ${chosenGrade}.` });
      } else {
        setMsg({ ok: true, text: "Mock result saved." });
      }
      setMark("");
      setGradeOverride("");
      await load();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  async function removeMock(h: GcseHistoryRow) {
    if (!supabase || !window.confirm("Remove this mock exam result from the history?")) return;
    const { error } = await supabase.from("gcse_grade_history").delete().eq("id", h.id);
    if (error) return setMsg({ ok: false, text: "Couldn't remove that result." });
    await load();
  }

  const bySubject = useMemo(() => {
    const m2 = new Map<string, GcseHistoryRow[]>();
    for (const h of history || []) m2.set(h.subject_id, [...(m2.get(h.subject_id) || []), h]);
    return m2;
  }, [history]);

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={`GCSE grades for ${childName}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gold-light bg-white px-5 py-4">
          <div>
            <h2 className="font-serif text-h3 font-semibold text-ink">{childName}</h2>
            <p className="text-xs text-ink/60">GCSE grades and history</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-xl leading-none text-ink/55 hover:bg-cream">
            ×
          </button>
        </div>

        <div className="space-y-5 p-5">
          {rows.length === 0 && <p className="text-sm text-ink/60">No GCSE grades recorded for this pupil yet.</p>}
          {rows.map((r) => {
            const hist = bySubject.get(r.subject_id) || [];
            const trend = actualTrend(hist);
            const dir = TREND_META[trendDirection(trend)];
            const ex = explainGap(r, trend);
            return (
              <section key={r.id} className="rounded-xl border border-gold-light/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">{r.subject_name}</h3>
                  <GcseStatusChip row={r} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-3 text-xs text-ink/60">
                    <span className="flex items-center gap-1">Target <GradeChip grade={r.target_grade} kind="Target" /></span>
                    <span className="flex items-center gap-1">Predicted <GradeChip grade={r.predicted_grade} kind="Predicted" /></span>
                    <span className="flex items-center gap-1">Actual <GradeChip grade={r.actual_grade} kind="Actual" /></span>
                  </div>
                  <TrendLine points={trend} target={r.target_grade} predicted={r.predicted_grade} width={140} />
                  <span className={`text-xs font-medium ${dir.className}`}>
                    {dir.symbol} {dir.label}
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-ink">{ex.headline}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink/70">{ex.detail}</p>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-ink/70">
                  {ex.nextSteps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                {r.comment && <p className="mt-3 rounded-lg bg-cream/60 px-3 py-2 text-xs text-ink/75">Teacher comment: {r.comment}</p>}

                <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink/65">History</h4>
                {history === null ? (
                  <p className="mt-1 text-xs text-ink/65">Loading…</p>
                ) : hist.length === 0 ? (
                  <p className="mt-1 text-xs text-ink/65">No changes recorded yet.</p>
                ) : (
                  <ul className="mt-1 divide-y divide-gold-light/30 text-xs">
                    {hist
                      .slice()
                      .reverse()
                      .map((h) => (
                        <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                          <span className="text-ink/60">
                            {fmtDate(h.recorded_at)}
                            {h.kind === "mock" && <span className="ml-2 rounded bg-gold-light/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gold-900">{h.label || "Mock"}</span>}
                          </span>
                          <span className="flex items-center gap-2 text-ink/80">
                            {h.kind === "mock" ? (
                              <>
                                {h.mark !== null && h.out_of !== null && (
                                  <span>
                                    {h.mark}/{h.out_of}
                                  </span>
                                )}
                                <GradeChip grade={h.actual_grade} kind="Grade" />
                              </>
                            ) : (
                              <>
                                <GradeChip grade={h.target_grade} kind="Target" muted />
                                <GradeChip grade={h.predicted_grade} kind="Predicted" muted />
                                <GradeChip grade={h.actual_grade} kind="Actual" />
                              </>
                            )}
                            {canEdit && h.kind === "mock" && (
                              <button type="button" onClick={() => removeMock(h)} aria-label="Remove mock result" className="text-ink/65 hover:text-red-700">
                                ×
                              </button>
                            )}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </section>
            );
          })}

          {canEdit && rows.length > 0 && (
            <section className="rounded-xl border border-gold-light/50 bg-cream/40 p-4">
              <h3 className="text-sm font-semibold text-ink">Add a mock exam result</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs font-medium text-ink/70">
                <label>
                  Subject
                  <select value={subjectRowId} onChange={(e) => setSubjectRowId(e.target.value)} className="mt-1 block w-full rounded-md border border-gold-light/60 bg-white px-2 py-1.5 text-sm">
                    {rows.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.subject_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Paper
                  <input value={label} maxLength={80} placeholder="e.g. Paper 1, Dec mock" onChange={(e) => setLabel(e.target.value)} className="mt-1 block w-full rounded-md border border-gold-light/60 bg-white px-2 py-1.5 text-sm" />
                </label>
                <label>
                  Date sat
                  <input type="date" value={sat} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setSat(e.target.value)} className="mt-1 block w-full rounded-md border border-gold-light/60 bg-white px-2 py-1.5 text-sm" />
                </label>
                <label>
                  Mark
                  <input type="number" min={0} step="0.5" value={mark} onChange={(e) => setMark(e.target.value)} className="mt-1 block w-full rounded-md border border-gold-light/60 bg-white px-2 py-1.5 text-sm" />
                </label>
                <label>
                  Out of
                  <input type="number" min={1} step="0.5" value={outOf} onChange={(e) => setOutOf(e.target.value)} className="mt-1 block w-full rounded-md border border-gold-light/60 bg-white px-2 py-1.5 text-sm" />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink">
                <span role="status">
                  {markOk ? `${((m / o) * 100).toFixed(1)}% suggests grade ${suggested ?? "below 1"}.` : "Enter the mark to see a suggested grade."}
                  {toNext && toNext.marks > 0 && <span className="ml-1 text-xs text-ink/60">{toNext.marks} more for grade {toNext.grade}.</span>}
                </span>
                <label className="flex items-center gap-1 text-xs text-ink/70">
                  Grade
                  <select value={gradeOverride} onChange={(e) => setGradeOverride(e.target.value)} className="rounded-md border border-gold-light/60 bg-white px-2 py-1 text-sm">
                    <option value="">{suggested ? `Suggested (${suggested})` : "Choose…"}</option>
                    {gradeOptions()}
                  </select>
                </label>
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs text-ink/75">
                <input type="checkbox" checked={setActual} onChange={(e) => setSetActual(e.target.checked)} />
                Also make this the pupil&apos;s actual grade
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" disabled={saving || !markOk} onClick={saveMock} className="rounded-lg bg-gold-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
                  {saving ? "Saving…" : "Save mock result"}
                </button>
                <button type="button" onClick={() => setShowBounds((v) => !v)} aria-expanded={showBounds} className="text-xs font-medium text-ink/70 underline">
                  {showBounds ? "Hide grade boundaries" : "Grade boundaries"}
                </button>
              </div>
              {showBounds && (
                <div className="mt-3">
                  <BoundaryEditor boundaries={boundaries} onChange={setBoundaries} onReset={resetBoundaries} />
                </div>
              )}
            </section>
          )}
          {msg && (
            <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-teal-700" : "text-red-700"}`}>
              {msg.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
