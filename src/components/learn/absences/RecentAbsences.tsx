"use client";

import { Loading } from "@/components/learn/kit";
import { useMemo, useState } from "react";
import { ReasonModal } from "./ReasonModal";
import { formatDay, reasonLabel, type Absence } from "./data";

/** Recent absences, one line per child and day, with a way to record why. */
export function RecentAbsences({ absences, onChanged }: { absences: Absence[] | null; onChanged: () => void }) {
  const [target, setTarget] = useState<Absence | null>(null);
  const [limit, setLimit] = useState(40);
  const all = useMemo(() => {
    const seen = new Set<string>();
    return (absences || []).filter((a) => {
      const k = `${a.childId}|${a.date}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [absences]);
  const rows = all.slice(0, limit);

  return (
    <section className="rounded-2xl border border-gold-light bg-white">
      <div className="border-b border-gold-light/60 px-4 py-3">
        <h2 className="text-base font-semibold text-ink">Recent absences</h2>
        <p className="text-xs text-ink/65">Record why a child was away. Reasons are staff-only.</p>
      </div>
      {absences === null ? (
        <Loading label="Loading…" bare />
      ) : rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-ink/65">No absences in this period.</p>
      ) : (
        <ul className="divide-y divide-gold-light/40">
          {rows.map((a) => (
            <li key={`${a.childId}|${a.date}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="min-w-0 text-ink">
                <span className="font-medium">{a.childName}</span> <span className="text-ink/65">· {formatDay(a.date)} · {a.className}</span>
              </span>
              <span className="flex items-center gap-2">
                {a.reasonCode && <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-medium text-ink/70">{reasonLabel(a.reasonCode)}</span>}
                <button type="button" onClick={() => setTarget(a)} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-semibold text-ink/80 hover:bg-cream">
                  {a.reasonCode ? "Change reason" : "Record reason"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {all.length > rows.length && (
        <div className="border-t border-gold-light/40 px-4 py-3 text-sm text-ink/65">
          Showing the {rows.length} most recent of {all.length}.{" "}
          <button type="button" onClick={() => setLimit((n) => n + 40)} className="font-medium text-teal-700 hover:underline">
            Show more
          </button>
        </div>
      )}
      {target && <ReasonModal childId={target.childId} childName={target.childName} date={target.date} dateLabel={formatDay(target.date)} initialCode={target.reasonCode} onClose={() => setTarget(null)} onSaved={onChanged} />}
    </section>
  );
}
