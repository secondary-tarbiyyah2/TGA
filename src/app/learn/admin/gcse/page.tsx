"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { GcseClassPanel } from "@/components/learn/GcseTracker";
import { GcseOverview } from "@/components/learn/gcse/GcseOverview";
import { GcseMocks } from "@/components/learn/gcse/GcseMocks";
import { GcseInterventions } from "@/components/learn/gcse/GcseInterventions";
import { isGcseYear } from "@/lib/learn/gcse";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Tabs, tabPanelProps } from "@/components/learn/Tabs";
import { ui } from "@/components/learn/ui";

type Tab = "overview" | "mocks" | "interventions" | "enter";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "mocks", label: "Mock exams" },
  { id: "interventions", label: "Interventions" },
  { id: "enter", label: "Enter grades" },
];

type ClassOpt = { id: string; name: string; year_group: string | null; subject_id: string | null; academic_year_id: string | null };
type YearOpt = { id: string; label: string; starts_on: string; ends_on: string };

function AdminGcseContent() {
  const supabase = getSupabaseClient();
  const [classes, setClasses] = useState<ClassOpt[]>([]);
  const [years, setYears] = useState<YearOpt[]>([]);
  const [classId, setClassId] = useState("");
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("classes")
      .select("id, name, year_group, subject_id, academic_year_id")
      .order("name")
      .then(({ data }) => setClasses(((data as ClassOpt[]) || []).filter((k) => isGcseYear(k.year_group) && !!k.subject_id)));
    supabase
      .from("academic_years")
      .select("id, label, starts_on, ends_on")
      .order("starts_on", { ascending: false })
      .then(({ data }) => setYears((data as YearOpt[]) || []));
  }, [supabase]);

  // Group the class picker by academic year, this year first, so last year's Year 11 classes don't crowd the list.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const currentYearId = years.find((y) => y.starts_on <= today && today <= y.ends_on)?.id || null;
  const yearRank = (id: string | null) => (id === currentYearId ? -1 : id ? years.findIndex((y) => y.id === id) : years.length);
  const classGroups = [...new Set(classes.map((c) => c.academic_year_id))]
    .sort((a, b) => yearRank(a) - yearRank(b))
    .map((yid) => ({ yid, label: years.find((y) => y.id === yid)?.label || "No academic year", list: classes.filter((c) => c.academic_year_id === yid) }));

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "GCSE progress" }]}
        title="GCSE progress"
        subtitle="Target, predicted and actual grades (9 to 1) for Years 10 and 11 (Pearson Edexcel International GCSE). Select a pupil for their history and mock exams. Pupils and parents see their own."
      />

      <Tabs items={TABS.map((t) => ({ key: t.id, label: t.label }))} value={tab} onChange={setTab} label="GCSE progress sections" idBase="gcse" className="mb-5" />

      <div {...tabPanelProps("gcse", tab)}>
        {tab === "overview" && <GcseOverview key={version} />}
        {tab === "mocks" && <GcseMocks key={version} />}
        {tab === "interventions" && <GcseInterventions />}
        {tab === "enter" && (
          <>
            <div className={`mb-6 ${ui.card}`}>
              <h2 className={ui.sectionTitle}>Enter or edit grades for a class</h2>
              <p className="mt-1 text-sm text-ink/65">Fill down, paste from a spreadsheet, or take actuals from assessments, then save once.</p>
              <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="GCSE class" className={`mt-3 ${ui.select} sm:max-w-sm`}>
                <option value="">Choose a Year 10 or 11 class…</option>
                {classGroups.map((g) =>
                  classGroups.length === 1 ? (
                    g.list.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))
                  ) : (
                    <optgroup key={g.yid || "none"} label={`${g.label}${g.yid === currentYearId ? " (this year)" : ""}`}>
                      {g.list.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  ),
                )}
              </select>
              {classes.length === 0 && <p className="mt-2 text-sm text-ink/65">No Year 10 or Year 11 classes with a subject yet.</p>}
            </div>
            {classId && <GcseClassPanel key={classId} classId={classId} onSaved={() => setVersion((v) => v + 1)} />}
          </>
        )}
      </div>
    </>
  );
}

export default function AdminGcsePage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminGcseContent />
      </LearnGate>
    </section>
  );
}
