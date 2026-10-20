"use client";

import { useMemo } from "react";
import { PageHeader } from "@/components/learn/PageHeader";
import { EmptyState, StatusChip } from "@/components/learn/ui";
import { dateKeyDaysAgo, formatDay, reasonLabel, useAbsenceData, type AbsenceNote } from "./data";
import { localDateKey } from "@/lib/learn/calendar";

/**
 * The teacher's view of pupil absence: who was away from their lessons in
 * the last 30 days and the reason, if the family or office has given one.
 * Read-only: deciding, following up and recording reasons is the office's
 * job (see 0098), so there are no buttons here.
 */
export function TeacherAbsences() {
  const today = localDateKey(new Date());
  const { notes, absences, error } = useAbsenceData(dateKeyDaysAgo(29), today);

  const rows = useMemo(() => {
    const out: { key: string; childName: string; date: string; classes: string[]; why: string | null; decided: AbsenceNote["status"] | null }[] = [];
    for (const a of absences || []) {
      const k = `${a.childId}|${a.date}`;
      const note = (notes || []).find((n) => n.child_id === a.childId && n.from_date <= a.date && a.date <= n.to_date);
      const existing = out.find((r) => r.key === k);
      if (existing) {
        if (!existing.classes.includes(a.className)) existing.classes.push(a.className);
        continue;
      }
      out.push({ key: k, childName: a.childName, date: a.date, classes: [a.className], why: note?.reason || reasonLabel(a.reasonCode) || null, decided: note?.status || null });
    }
    return out;
  }, [absences, notes]);

  // Notes about days still to come (the family told us in advance).
  const upcoming = (notes || []).filter((n) => n.to_date >= today).sort((a, b) => a.from_date.localeCompare(b.from_date));

  return (
    <>
      <PageHeader crumbs={[{ label: "Home", href: "/teach/dashboard" }, { label: "Pupil absences" }]} title="Pupil absences" subtitle="Who has been away from your lessons in the last 30 days, and why. The office follows up anything unexplained." />
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">Some of this couldn&apos;t load: {error}</p>}
      <div className="space-y-5">
        {upcoming.length > 0 && (
          <section className="rounded-2xl border border-gold-light bg-white" aria-labelledby="upcoming-abs">
            <h2 id="upcoming-abs" className="border-b border-gold-light px-4 py-3 text-sm font-semibold text-ink">
              Away today or coming up
            </h2>
            <ul className="divide-y divide-gold-light/50">
              {upcoming.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="font-medium text-ink">{n.childName}</span>
                  <span className="text-ink/65">{n.from_date === n.to_date ? formatDay(n.from_date) : `${formatDay(n.from_date)} to ${formatDay(n.to_date)}`}</span>
                  <span className="min-w-0 flex-1 text-ink/80">{n.reason}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="rounded-2xl border border-gold-light bg-white" aria-labelledby="past-abs">
          <h2 id="past-abs" className="border-b border-gold-light px-4 py-3 text-sm font-semibold text-ink">
            Last 30 days
          </h2>
          {absences === null ? (
            <div className="m-4 h-16 animate-pulse rounded-lg bg-cream" />
          ) : rows.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No absences from your lessons in the last 30 days." />
            </div>
          ) : (
            <ul className="divide-y divide-gold-light/50">
              {rows.map((r) => (
                <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="w-28 shrink-0 text-ink/65">{formatDay(r.date)}</span>
                  <span className="font-medium text-ink">{r.childName}</span>
                  <span className="text-xs text-ink/60">{r.classes.join(", ")}</span>
                  <span className="min-w-0 flex-1 text-ink/80">{r.why || <span className="text-ink/55">No reason given yet</span>}</span>
                  {r.decided === "authorised" && <StatusChip tone="good">Authorised</StatusChip>}
                  {r.decided === "unauthorised" && <StatusChip tone="bad">Not authorised</StatusChip>}
                  {!r.why && <StatusChip tone="warn">Office following up</StatusChip>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
