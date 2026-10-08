"use client";

import { fmtDate, type BehaviourRecord } from "./data";

function KindPill({ r }: { r: BehaviourRecord }) {
  const style =
    r.kind === "merit" ? "bg-green-100 text-green-800" : r.kind === "demerit" ? "bg-red-50 text-red-700" : "bg-amber-100 text-amber-800";
  const label = r.kind === "merit" ? "Merit" : r.kind === "demerit" ? "Demerit" : "Incident";
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>{label}</span>;
}

function Pts({ r }: { r: BehaviourRecord }) {
  if (r.kind === "incident") return <span className="text-ink/65">–</span>;
  return <span className={r.points > 0 ? "font-semibold text-green-700" : "font-semibold text-red-700"}>{r.points > 0 ? `+${r.points}` : r.points}</span>;
}

/** Records as a table on wide screens and cards on phones. */
export function RecordsTable({
  records,
  showStudent = true,
  onVoid,
  empty = "No records yet.",
}: {
  records: BehaviourRecord[];
  showStudent?: boolean;
  onVoid?: (id: string) => void;
  empty?: string;
}) {
  if (records.length === 0) {
    return <p className="rounded-xl border border-dashed border-gold-light bg-cream/30 px-4 py-8 text-center text-sm text-ink/60">{empty}</p>;
  }
  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gold-light/60 text-left text-xs uppercase tracking-wide text-ink/65">
              <th className="py-2 pr-3 font-medium">Date</th>
              {showStudent && <th className="py-2 pr-3 font-medium">Student</th>}
              <th className="py-2 pr-3 font-medium">Type</th>
              <th className="py-2 pr-3 font-medium">Category</th>
              <th className="py-2 pr-3 font-medium">Pts</th>
              <th className="py-2 pr-3 font-medium">Note</th>
              {onVoid && <th className="py-2 font-medium" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gold-light/30">
            {records.map((r) => (
              <tr key={r.id} className={r.voided_at ? "text-ink/65 line-through" : ""}>
                <td className="whitespace-nowrap py-2 pr-3">{fmtDate(r.occurred_on)}</td>
                {showStudent && (
                  <td className="py-2 pr-3">
                    <span className="font-medium text-ink">{r.children?.name || "Student"}</span>
                    {r.classes?.name && <span className="block text-xs text-ink/65">{r.classes.name}</span>}
                  </td>
                )}
                <td className="py-2 pr-3">
                  <KindPill r={r} />
                </td>
                <td className="py-2 pr-3">{r.category}</td>
                <td className="py-2 pr-3">
                  <Pts r={r} />
                </td>
                <td className="max-w-xs py-2 pr-3 text-ink/70">{r.note || ""}</td>
                {onVoid && (
                  <td className="py-2 text-right">
                    {!r.voided_at && (
                      <button type="button" onClick={() => onVoid(r.id)} className="text-xs font-medium text-red-700 hover:underline">
                        Void
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 sm:hidden">
        {records.map((r) => (
          <li key={r.id} className={`rounded-xl border border-gold-light/50 p-3 text-sm ${r.voided_at ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium text-ink">{showStudent ? r.children?.name || "Student" : r.category}</span>
              <Pts r={r} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink/60">
              <KindPill r={r} />
              {showStudent && <span>{r.category}</span>}
              <span>{fmtDate(r.occurred_on)}</span>
              {r.voided_at && <span>(voided)</span>}
            </div>
            {r.note && <p className="mt-1 text-ink/70">{r.note}</p>}
            {onVoid && !r.voided_at && (
              <button type="button" onClick={() => onVoid(r.id)} className="mt-1 text-xs font-medium text-red-700 hover:underline">
                Void
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
