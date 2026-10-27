"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, type Crumb } from "@/components/learn/PageHeader";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ukToday } from "@/lib/learn/ukTime";
import { AbsenceReports } from "./AbsenceReports";
import { CoverSuggestions } from "./CoverSuggestions";
import { FollowUpTab } from "./FollowUpTab";
import { NotesReview } from "./NotesReview";
import { RecentAbsences } from "./RecentAbsences";
import { SummaryCard } from "./SummaryCard";
import { dateKeyDaysAgo, formatDay, useAbsenceData } from "./data";
import { Tabs } from "@/components/learn/Tabs";

type Term = { name: string; starts_on: string; ends_on: string };
type Tab = "overview" | "followup" | "notes" | "reports" | "cover";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "followup", label: "To follow up" },
  { key: "notes", label: "Parent notes" },
  { key: "reports", label: "Reports" },
  { key: "cover", label: "Suggest cover" },
];
type Period = "30" | "60" | "90" | "term";
const PERIODS: { key: Period; label: string }[] = [
  { key: "30", label: "30 days" },
  { key: "60", label: "60 days" },
  { key: "90", label: "90 days" },
  { key: "term", label: "This term" },
];

export function StaffAbsences({ crumbs, subtitle, showCover = false }: { crumbs: Crumb[]; subtitle?: string; showCover?: boolean }) {
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

  const today = ukToday();
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
  // Before the first term starts there is no "this term": say plainly that
  // the last 90 days are shown instead of titling it "this term".
  const termShown = period === "term" && term;
  const label = termShown ? `${term.name}, from ${formatDay(from)}` : period === "term" ? "No term has started yet, so showing the last 90 days" : `Last ${period} days`;
  const title = termShown ? "Absence this term" : `Absence over the last ${period === "term" ? 90 : period} days`;
  const periodMatters = tab === "overview" || tab === "followup" || tab === "reports";

  return (
    <>
      <PageHeader crumbs={crumbs} title="Absences" subtitle={subtitle || "What families have told us, and who has not been heard from."} />
      <div className="space-y-5">
        <Tabs
          items={TABS.filter((t) => t.key !== "cover" || showCover).map((t) => ({
            ...t,
            count: t.key === "followup" && followCount > 0 ? followCount : undefined,
            countAlert: true,
          }))}
          value={tab}
          onChange={setTab}
          label="Absences sections"
        />
        {periodMatters && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Period">
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
            <span className="text-xs text-ink/65">{label}</span>
          </div>
        )}
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">Some of this couldn&apos;t load: {error}</p>}
        {tab === "overview" && (
          <>
            <SummaryCard title={title} absences={absences} periodLabel={label} />
            <RecentAbsences absences={absences} onChanged={reload} />
          </>
        )}
        {tab === "followup" && <FollowUpTab absences={absences} onChanged={reload} />}
        {tab === "notes" && <NotesReview notes={notes} onChanged={reload} />}
        {tab === "reports" && <AbsenceReports absences={absences} periodLabel={label} />}
        {tab === "cover" && showCover && <CoverSuggestions />}
      </div>
    </>
  );
}
