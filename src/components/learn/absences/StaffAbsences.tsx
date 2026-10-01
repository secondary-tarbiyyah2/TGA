"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, type Crumb } from "@/components/learn/PageHeader";
import { getSupabaseClient } from "@/lib/supabase/client";
import { localDateKey } from "@/lib/learn/calendar";
import { AbsenceReports } from "./AbsenceReports";
import { FollowUpTab } from "./FollowUpTab";
import { NotesReview } from "./NotesReview";
import { RecentAbsences } from "./RecentAbsences";
import { SummaryCard } from "./SummaryCard";
import { dateKeyDaysAgo, formatDay, useAbsenceData } from "./data";

type Term = { name: string; starts_on: string; ends_on: string };
type Tab = "overview" | "followup" | "notes" | "reports";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "followup", label: "To follow up" },
  { key: "notes", label: "Parent notes" },
  { key: "reports", label: "Reports" },
];
type Period = "30" | "60" | "90" | "term";
const PERIODS: { key: Period; label: string }[] = [
  { key: "30", label: "30 days" },
  { key: "60", label: "60 days" },
  { key: "90", label: "90 days" },
  { key: "term", label: "This term" },
];

export function StaffAbsences({ crumbs, subtitle }: { crumbs: Crumb[]; subtitle?: string }) {
  const [period, setPeriod] = useState<Period>("90");
  const [tab, setTab] = useState<Tab>("overview");
  const [terms, setTerms] = useState<Term[]>([]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    (async () => {
      const { data } = await supabase.from("terms").select("name, starts_on, ends_on").order("starts_on");
      setTerms((data as unknown as Term[]) || []);
    })();
  }, []);

  const today = localDateKey(new Date());
  const term = useMemo(() => {
    const current = terms.find((t) => t.starts_on <= today && today <= t.ends_on);
    if (current) return current;
    const started = terms.filter((t) => t.starts_on <= today);
    return started.length > 0 ? started[started.length - 1] : null;
  }, [terms, today]);

  const days = period === "term" ? 0 : Number(period);
  const from = period === "term" && term ? term.starts_on : dateKeyDaysAgo(period === "term" ? 89 : days - 1);
  const to = today;

  const { notes, absences, error, reload } = useAbsenceData(from, to);
  const followCount = useMemo(() => {
    const seen = new Set<string>();
    (absences || []).forEach((a) => {
      if (a.kind === "unexplained" && (!a.reasonCode || a.reasonCode === "unknown")) seen.add(`${a.childId}|${a.date}`);
    });
    return seen.size;
  }, [absences]);
  const label = period === "term" && term ? `${term.name}, from ${formatDay(from)}` : `Last ${period === "term" ? 90 : period} days`;
  const title = period === "term" ? "Absence this term" : `Absence over the last ${period} days`;

  return (
    <>
      <PageHeader crumbs={crumbs} title="Absences" subtitle={subtitle || "What families have told us, and who has not been heard from."} />
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={period === p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${period === p.key ? "border-teal-600 bg-teal-600 text-white" : "border-gold-light bg-white text-ink/70 hover:bg-cream"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">Some of this couldn&apos;t load: {error}</p>}
        <div className="flex flex-wrap gap-2 border-b border-gold-light/60 pb-2" role="tablist" aria-label="Absences sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === t.key ? "bg-teal-700 text-white" : "text-ink/70 hover:bg-cream"}`}
            >
              {t.label}
              {t.key === "followup" && followCount > 0 ? ` (${followCount})` : ""}
            </button>
          ))}
        </div>
        {tab === "overview" && (
          <>
            <SummaryCard title={title} absences={absences} periodLabel={label} />
            <RecentAbsences absences={absences} onChanged={reload} />
          </>
        )}
        {tab === "followup" && <FollowUpTab absences={absences} onChanged={reload} />}
        {tab === "notes" && <NotesReview notes={notes} onChanged={reload} />}
        {tab === "reports" && <AbsenceReports absences={absences} periodLabel={label} />}
      </div>
    </>
  );
}
