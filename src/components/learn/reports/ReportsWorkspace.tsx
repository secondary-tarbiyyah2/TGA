"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader, type Crumb } from "@/components/learn/PageHeader";
import { Tabs } from "@/components/learn/Tabs";
import { Notice, ui } from "@/components/learn/ui";
import { getSupabaseClient } from "@/lib/supabase/client";
import { localDateKey } from "@/lib/learn/calendar";
import { PrintStyles } from "./ReportDocument";
import { ALL_TIME, defaultTerm, reportsHref, useReportsBase, type Mode, type ReportView } from "./data";
import { ReportsOverview } from "./ReportsOverview";
import { ClassReports } from "./ClassReports";
import { PupilReportEditor } from "./PupilReportEditor";
import { ApprovalQueue } from "./ApprovalQueue";
import { IssuedReports } from "./IssuedReports";
import { ReportSettings } from "./ReportSettings";

const VIEWS: ReportView[] = ["overview", "class", "pupil", "approval", "issued", "settings"];
type Section = "overview" | "approval" | "issued" | "settings";

/**
 * Progress reports, as a workflow rather than one long page:
 *   Overview (each class's progress this term) → a class's pupil list →
 *   one pupil's report → (Headteacher) approval queue → issued reports.
 * The step lives in the URL (?view=…&term=…&class=…&child=…).
 */
export function ReportsWorkspace({ mode }: { mode: Mode }) {
  const params = useSearchParams();
  const router = useRouter();
  const { terms, classes, me } = useReportsBase(mode);
  const [awaiting, setAwaiting] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  const rawView = params.get("view") as ReportView | null;
  const view: ReportView = rawView && VIEWS.includes(rawView) && (mode === "admin" || (rawView !== "approval" && rawView !== "settings")) ? rawView : "overview";
  const rawTerm = params.get("term") || "";
  const classId = params.get("class") || "";
  const childId = params.get("child") || "";

  const today = localDateKey(new Date());
  // Term: from the URL, else the current one. "all" (or no terms at all) = all time.
  const term = useMemo(() => {
    if (!terms) return undefined;
    if (rawTerm === ALL_TIME) return null;
    return terms.find((t) => t.id === rawTerm) || defaultTerm(terms, today);
  }, [terms, rawTerm, today]);
  const termKey = term ? term.id : ALL_TIME;
  const termLabel = term ? term.name : "All time";

  const cls = (classes || []).find((c) => c.id === classId) || null;

  // The approval count, for the tab badge.
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || mode !== "admin") return;
    let alive = true;
    supabase
      .from("term_reports")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending_approval", "approved"])
      .then(({ count }) => alive && setAwaiting(count ?? 0));
    return () => {
      alive = false;
    };
  }, [mode, tick]);

  const go = (p: { view?: ReportView; term?: string; cls?: string; child?: string }, replace = false) => {
    const href = reportsHref(mode, { term: termKey, ...p });
    if (replace) router.replace(href, { scroll: false });
    else router.push(href);
  };
  const changed = () => setTick((t) => t + 1);

  const section: Section = view === "class" || view === "pupil" ? "overview" : (view as Section);
  const sections = [
    { key: "overview" as Section, label: mode === "admin" ? "Overview" : "My classes" },
    ...(mode === "admin" ? [{ key: "approval" as Section, label: "Approval queue", count: awaiting ?? undefined, countAlert: true }] : []),
    { key: "issued" as Section, label: "Issued" },
    ...(mode === "admin" ? [{ key: "settings" as Section, label: "Settings" }] : []),
  ];

  const home = mode === "admin" ? "/admin/dashboard" : "/teach/dashboard";
  const crumbs: Crumb[] = [{ label: "Home", href: home }, { label: "Progress reports", href: reportsHref(mode, { term: termKey }) }];
  if ((view === "class" || view === "pupil") && cls) crumbs.push({ label: cls.name, href: reportsHref(mode, { view: "class", term: termKey, cls: cls.id }) });
  if (view === "pupil") crumbs.push({ label: "Report" });

  const noTerms = terms !== null && terms !== undefined && terms.length === 0;

  return (
    <div className="space-y-5">
      <PrintStyles />
      <div className="print:hidden">
        <PageHeader
          crumbs={view === "class" || view === "pupil" ? crumbs : undefined}
          title={view === "class" && cls ? `${cls.name} reports` : "Progress reports"}
          subtitle={
            view === "pupil"
              ? undefined
              : mode === "admin"
                ? "Write, approve and issue end-of-term reports. Figures come from attendance, homework, merits, Qur'an and assessments already recorded."
                : "Write your classes' end-of-term reports. Figures are filled in for you; add your judgement and a comment, then submit for approval."
          }
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Tabs
          variant="switch"
          label="Reports sections"
          items={sections}
          value={section}
          onChange={(k) => go({ view: k })}
        />
        {view !== "pupil" && view !== "settings" && terms && (
          <label className="flex items-center gap-2 text-sm text-ink/75">
            <span>Term</span>
            <select value={termKey} onChange={(e) => go({ view, cls: classId || undefined, term: e.target.value }, true)} className={`${ui.input} !w-auto !py-1.5`}>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value={ALL_TIME}>All time (no term)</option>
            </select>
          </label>
        )}
      </div>

      {noTerms && view !== "settings" && (
        <Notice tone="warn">
          {mode === "admin" ? (
            <>
              No terms have been set up yet, so reports cover all time.{" "}
              <Link href="/admin/academic/years" className="font-semibold underline">
                Add the term dates
              </Link>{" "}
              so each report covers one term.
            </>
          ) : (
            "No terms have been set up yet, so reports cover all time. The office adds term dates in Academic setup."
          )}
        </Notice>
      )}

      {term === undefined || classes === null ? (
        <div className="h-40 animate-pulse rounded-2xl bg-white" />
      ) : view === "overview" ? (
        <ReportsOverview mode={mode} classes={classes} term={term} termKey={termKey} tick={tick} />
      ) : view === "class" ? (
        cls ? (
          <ClassReports key={`${cls.id}-${termKey}`} mode={mode} cls={cls} term={term} termKey={termKey} me={me} onChanged={changed} />
        ) : (
          <Missing mode={mode} termKey={termKey} what="That class isn't one you can see." />
        )
      ) : view === "pupil" ? (
        cls && childId ? (
          <PupilReportEditor
            key={`${cls.id}-${termKey}`}
            mode={mode}
            cls={cls}
            term={term}
            termKey={termKey}
            termLabel={termLabel}
            childId={childId}
            me={me}
            onChanged={changed}
            onNavigate={(id) => go({ view: "pupil", cls: cls.id, child: id }, true)}
          />
        ) : (
          <Missing mode={mode} termKey={termKey} what="Choose a class and a pupil first." />
        )
      ) : view === "approval" ? (
        <ApprovalQueue me={me} onChanged={changed} />
      ) : view === "issued" ? (
        <IssuedReports term={term} termKey={termKey} />
      ) : (
        <ReportSettings />
      )}
    </div>
  );
}

function Missing({ mode, termKey, what }: { mode: Mode; termKey: string; what: string }) {
  return (
    <div className={ui.card}>
      <p className="text-sm text-ink/75">{what}</p>
      <Link href={reportsHref(mode, { term: termKey })} className={`mt-3 ${ui.btnSecondary}`}>
        Back to the overview
      </Link>
    </div>
  );
}
