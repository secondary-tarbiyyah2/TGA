"use client";

import { useMemo, useState } from "react";
import { formatDay, type Absence } from "./data";

type Tally = { total: number; authorised: number; unauthorised: number; unexplained: number };
const zero = (): Tally => ({ total: 0, authorised: 0, unauthorised: 0, unexplained: 0 });
const th = "whitespace-nowrap border-b border-gold-light/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink/55";
const td = "border-b border-gold-light/20 px-3 py-2 tabular-nums";

const KIND_CHIP: Record<Absence["kind"], string> = {
  authorised: "bg-green-50 text-green-800",
  unauthorised: "bg-red-50 text-red-800",
  unexplained: "bg-amber-50 text-amber-900",
};
const KIND_LABEL: Record<Absence["kind"], string> = {
  authorised: "Authorised",
  unauthorised: "Not authorised",
  unexplained: "Unexplained",
};

function add(t: Tally, a: Absence) {
  t.total += 1;
  t[a.kind] += 1;
}

export function SummaryCard({ title, absences, periodLabel }: { title: string; absences: Absence[] | null; periodLabel: string }) {
  const [openClass, setOpenClass] = useState<string | null>(null);

  const classes = useMemo(() => {
    const m = new Map<string, { name: string; tally: Tally }>();
    (absences || []).forEach((a) => {
      const key = a.classId || a.className;
      const e = m.get(key) || { name: a.className, tally: zero() };
      add(e.tally, a);
      m.set(key, e);
    });
    return [...m.entries()].map(([id, e]) => ({ id, name: e.name, tally: e.tally })).sort((x, y) => y.tally.unexplained - x.tally.unexplained || x.name.localeCompare(y.name));
  }, [absences]);

  const students = useMemo(() => {
    if (!openClass) return [];
    const m = new Map<string, { name: string; dates: Absence[]; tally: Tally }>();
    (absences || [])
      .filter((a) => (a.classId || a.className) === openClass)
      .forEach((a) => {
        const e = m.get(a.childId) || { name: a.childName, dates: [], tally: zero() };
        e.dates.push(a);
        add(e.tally, a);
        m.set(a.childId, e);
      });
    return [...m.entries()].map(([id, e]) => ({ id, ...e })).sort((x, y) => y.tally.unexplained - x.tally.unexplained || x.name.localeCompare(y.name));
  }, [absences, openClass]);

  const totals = useMemo(() => {
    const t = zero();
    classes.forEach((c) => {
      t.total += c.tally.total;
      t.authorised += c.tally.authorised;
      t.unauthorised += c.tally.unauthorised;
      t.unexplained += c.tally.unexplained;
    });
    return t;
  }, [classes]);

  const openName = classes.find((c) => c.id === openClass)?.name;

  return (
    <section className="rounded-2xl border border-gold-light bg-white">
      <div className="border-b border-gold-light/60 px-4 py-3">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="text-xs text-ink/65">{periodLabel}. Select a class to see who was away.</p>
      </div>
      {absences === null ? (
        <p className="px-4 py-6 text-sm text-ink/60">Loading…</p>
      ) : classes.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="font-medium text-ink">No absences in this period</p>
          <p className="mt-1 text-sm text-ink/60">Nothing has been marked absent. That is good news.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left">
                <th className={th}>Class</th>
                <th className={`${th} text-right`}>Absences</th>
                <th className={`${th} text-right`}>Authorised</th>
                <th className={`${th} text-right`}>Not authorised</th>
                <th className={`${th} text-right`}>Unexplained</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.id} className={openClass === c.id ? "bg-cream/60" : "hover:bg-cream/40"}>
                  <td className="border-b border-gold-light/20 px-3 py-2">
                    <button type="button" aria-expanded={openClass === c.id} onClick={() => setOpenClass(openClass === c.id ? null : c.id)} className="text-left font-medium text-teal-800 hover:underline">
                      {c.name}
                    </button>
                  </td>
                  <td className={`${td} text-right`}>{c.tally.total}</td>
                  <td className={`${td} text-right`}>{c.tally.authorised}</td>
                  <td className={`${td} text-right`}>{c.tally.unauthorised}</td>
                  <td className={`${td} text-right`}>
                    <span className={c.tally.unexplained > 0 ? "rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-900" : "text-ink/65"}>{c.tally.unexplained}</span>
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="px-3 py-2">All classes</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.total}</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.authorised}</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.unauthorised}</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.unexplained}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-gold-light/40 px-4 py-3 text-xs text-ink/55">
        Unexplained is its own column on purpose: an absence nobody has told us about is a question still open, not one that was decided against.
      </p>

      {openClass && (
        <div className="border-t border-gold-light px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">{openName}: who was away</h3>
            <button type="button" onClick={() => setOpenClass(null)} className="rounded-lg px-2 py-1 text-xs font-medium text-ink/60 hover:bg-cream">
              Close
            </button>
          </div>
          <ul className="space-y-3">
            {students.map((s) => (
              <li key={s.id} className="rounded-xl border border-gold-light/60 p-3">
                <p className="text-sm font-medium text-ink">
                  {s.name} <span className="font-normal text-ink/65">· {s.tally.total} absence{s.tally.total === 1 ? "" : "s"}</span>
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {s.dates.map((d) => (
                    <li key={d.id} className={`rounded-full px-2.5 py-1 text-xs font-medium ${KIND_CHIP[d.kind]}`}>
                      {formatDay(d.date)} · {KIND_LABEL[d.kind]}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
