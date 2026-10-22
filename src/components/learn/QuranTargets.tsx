"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  QURAN_TARGET_COLUMNS,
  TARGET_KIND_LABEL,
  TARGET_STATUS_META,
  localDateISO,
  targetProgress,
  type QuranEntry,
  type QuranTarget,
  type TargetKind,
} from "@/lib/learn/quran";

/** A child's Qur'an targets (RLS-scoped), soonest deadline first. */
export function useQuranTargets(childId: string) {
  const supabase = getSupabaseClient();
  const [targets, setTargets] = useState<QuranTarget[] | null>(null);

  const reload = useCallback(async () => {
    if (!supabase || !childId) return;
    const { data } = await supabase.from("quran_targets").select(QURAN_TARGET_COLUMNS).eq("child_id", childId).order("due_date", { ascending: true });
    setTargets((data as QuranTarget[] | null) || []);
  }, [supabase, childId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    reload();
  }, [reload]);

  return { targets, reload };
}

function describeAmount(kind: TargetKind, n: number): string {
  const l = TARGET_KIND_LABEL[kind];
  return `${n} ${n === 1 ? l.singular : l.plural}`;
}

/** Progress bars for a list of targets. */
export function TargetList({ targets, entries, onDelete }: { targets: QuranTarget[]; entries: QuranEntry[]; onDelete?: (t: QuranTarget) => void }) {
  if (targets.length === 0) return <p className="text-sm text-ink/65">No targets set yet.</p>;
  return (
    <ul className="space-y-3">
      {targets.map((t) => {
        const p = targetProgress(t, entries);
        const meta = TARGET_STATUS_META[p.status];
        return (
          <li key={t.id} className="rounded-lg border border-gold-light/40 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-ink">{t.title}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${meta.className}`}>{meta.label}</span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-cream"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={p.pct}
              aria-label={`${t.title}: ${p.pct}% complete`}
            >
              <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${p.pct}%` }} />
            </div>
            <p className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-ink/65">
              <span>
                {p.done} of {describeAmount(t.target_kind, p.total)} · by {new Date(t.due_date).toLocaleDateString("en-GB")}
                {p.status !== "achieved" && p.daysLeft >= 0 ? ` · ${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"} left` : ""}
              </span>
              {onDelete && (
                <button type="button" onClick={() => onDelete(t)} className="text-red-700 underline">
                  Remove
                </button>
              )}
            </p>
            {t.note && <p className="mt-1 text-xs text-ink/65">{t.note}</p>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Teacher view of a child's targets: add one ("N pages / juz / surahs by a
 * date") and see progress. Writing needs the same assessment_lead (or
 * Headteacher/Admin) rights as quran_progress; the database enforces it.
 */
export function QuranTargetsPanel({ childId, classId, entries, canEdit }: { childId: string; classId: string | null; entries: QuranEntry[]; canEdit: boolean }) {
  const supabase = getSupabaseClient();
  const { targets, reload } = useQuranTargets(childId);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TargetKind>("pages");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const max = TARGET_KIND_LABEL[kind].max;

  const add = async () => {
    if (!supabase) return;
    setError(null);
    const n = Number(amount);
    if (!title.trim() || !Number.isInteger(n) || n < 1 || n > max || !dueDate) {
      setError(`Give the target a title, a whole number from 1 to ${max}, and a due date.`);
      return;
    }
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error: insertError } = await supabase.from("quran_targets").insert({
        child_id: childId,
        class_id: classId,
        title: title.trim(),
        target_kind: kind,
        target_amount: n,
        start_date: localDateISO(),
        due_date: dueDate,
        set_by: user.id,
      });
      if (insertError) {
        setError(insertError.message);
        return;
      }
      setTitle("");
      setAmount("");
      setDueDate("");
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: QuranTarget) => {
    if (!supabase) return;
    if (!window.confirm(`Remove the target "${t.title}"?`)) return;
    const { error: delError } = await supabase.from("quran_targets").delete().eq("id", t.id);
    if (delError) setError(delError.message);
    else await reload();
  };

  return (
    <div>
      <h3 className="text-sm font-medium text-ink">Targets</h3>
      {canEdit && (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Target, e.g. Finish Juz Amma" aria-label="Target title" className="rounded-md border border-gold-light/60 px-3 py-2 text-sm sm:col-span-2" />
          <select value={kind} onChange={(e) => setKind(e.target.value as TargetKind)} aria-label="Target type" className="rounded-md border border-gold-light/60 px-3 py-2 text-sm">
            <option value="pages">Pages memorised</option>
            <option value="juz">Juz secure</option>
            <option value="surah">Surahs secure</option>
          </select>
          <input type="text" inputMode="decimal" min={1} max={max} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`How many (1-${max})`} aria-label="Target amount" className="rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-ink/70" htmlFor={`quran-target-due-${childId}`}>
              Due date
            </label>
            <input id={`quran-target-due-${childId}`} type="date" value={dueDate} min={localDateISO()} onChange={(e) => setDueDate(e.target.value)} className="mt-1 rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <button type="button" disabled={busy} onClick={add} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-900 disabled:opacity-50">
              Set target
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-3">
        {targets === null ? <p className="text-sm text-ink/65">Loading targets…</p> : <TargetList targets={targets} entries={entries} onDelete={canEdit ? remove : undefined} />}
      </div>
    </div>
  );
}
