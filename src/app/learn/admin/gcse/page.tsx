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

type Tab = "overview" | "mocks" | "interventions" | "enter";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "mocks", label: "Mock exams" },
  { id: "interventions", label: "Interventions" },
  { id: "enter", label: "Enter grades" },
];

type ClassOpt = { id: string; name: string; year_group: string | null; subject_id: string | null };

function AdminGcseContent() {
  const supabase = getSupabaseClient();
  const [classes, setClasses] = useState<ClassOpt[]>([]);
  const [classId, setClassId] = useState("");
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("classes")
      .select("id, name, year_group, subject_id")
      .order("name")
      .then(({ data }) => setClasses(((data as ClassOpt[]) || []).filter((k) => isGcseYear(k.year_group) && !!k.subject_id)));
  }, [supabase]);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "GCSE progress" }]}
        title="GCSE progress"
        subtitle="Target, predicted and actual grades (1–9) for Years 10 and 11. See who needs help first, compare classes and subjects, and open a pupil for their grade history and mock exams, and track interventions with an owner and next step. Pupils and parents see their own."
      />

      <Tabs items={TABS.map((t) => ({ key: t.id, label: t.label }))} value={tab} onChange={setTab} label="GCSE progress sections" idBase="gcse" className="mb-5" />

      <div {...tabPanelProps("gcse", tab)}>
        {tab === "overview" && <GcseOverview key={version} />}
        {tab === "mocks" && <GcseMocks key={version} />}
        {tab === "interventions" && <GcseInterventions />}
        {tab === "enter" && (
          <>
            <div className="mb-6 rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6">
              <h2 className="font-serif text-h3 font-semibold text-ink">Enter or edit grades for a class</h2>
              <p className="mt-1 text-sm text-ink/65">Fill down, paste from a spreadsheet, or take actuals from assessments, then save once.</p>
              <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="GCSE class" className="mt-3 rounded-md border border-gold-light/60 px-3 py-2 text-sm">
                <option value="">Choose a Year 10 / 11 class…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
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
