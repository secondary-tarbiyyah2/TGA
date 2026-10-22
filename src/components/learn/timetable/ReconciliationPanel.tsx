"use client";

import type { Conflict } from "./types";

const GROUPS: { kinds: string[]; title: string; help: string }[] = [
  { kinds: ["infeasible"], title: "No solution found", help: "" },
  { kinds: ["teacher_overbooked"], title: "Teachers overbooked", help: "These teachers have more lessons than periods they can be given, across all their classes." },
  { kinds: ["class_overfull", "class_unfillable"], title: "Classes that cannot be filled", help: "Even with a free hand, these classes cannot get all their lessons from their teachers' availability." },
  { kinds: ["unplaced"], title: "Lessons that could not be placed", help: "Which lessons are missing, and which other lessons are in the way." },
  { kinds: ["teacher_clash", "class_clash", "teacher_unavailable", "protected_time", "outside_school_day", "teacher_day_overload", "teacher_consecutive", "subject_repeated_day", "too_many_lessons"], title: "Self-check findings", help: "Re-checked independently after solving. Clashes block publishing." },
];

const kindOf = (c: Conflict): string => c.kind || /^\[(\w+)\]/.exec(c.message)?.[1] || "other";
const clean = (m: string) => m.replace(/^\[\w+\]\s*/, "");

/**
 * Reconciliation report for a draft: what collided, who is overbooked, which
 * classes cannot be filled, and what to change. Reads timetable_conflicts.
 */
export function ReconciliationPanel({ conflicts, canRerun, onRerun, busy, lockedCount }: { conflicts: Conflict[]; canRerun: boolean; onRerun: () => void; busy: boolean; lockedCount: number }) {
  const open = conflicts.filter((c) => !c.resolved);
  if (open.length === 0) return null;
  const summary = open.find((c) => kindOf(c) === "summary");
  const known = new Set(GROUPS.flatMap((g) => g.kinds).concat("summary"));
  const other = open.filter((c) => !known.has(kindOf(c)));
  return (
    <section aria-label="Reconciliation report" className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-h3 font-semibold text-ink">Reconciliation report</h2>
        {canRerun && (
          <button type="button" onClick={onRerun} disabled={busy} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream disabled:opacity-50">
            {busy ? "Starting…" : `Re-run keeping locked lessons (${lockedCount})`}
          </button>
        )}
      </div>
      {summary && <p className="mt-1 text-sm text-ink/80">{clean(summary.message)}</p>}
      <div className="mt-3 space-y-4">
        {GROUPS.map((g) => {
          const items = open.filter((c) => g.kinds.includes(kindOf(c)));
          if (items.length === 0) return null;
          return (
            <div key={g.title}>
              <h3 className="text-sm font-semibold text-ink">{g.title} <span className="font-normal text-ink/65">({items.length})</span></h3>
              {g.help && <p className="text-xs text-ink/65">{g.help}</p>}
              <ul className="mt-1 space-y-1">
                {items.map((c) => <li key={c.id} className={`rounded-lg px-3 py-2 text-xs ${c.severity === "hard" ? "bg-red-50 text-red-900" : "bg-white text-amber-900"}`}>{clean(c.message)}</li>)}
              </ul>
            </div>
          );
        })}
        {other.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-ink">Other</h3>
            <ul className="mt-1 space-y-1">{other.map((c) => <li key={c.id} className="rounded-lg bg-white px-3 py-2 text-xs text-amber-900">{clean(c.message)}</li>)}</ul>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-ink/65">Tip: fix the cause (availability, teacher mapping or lessons per week), place any lesson by hand and it is locked, then re-run to fill the rest around it.</p>
    </section>
  );
}
