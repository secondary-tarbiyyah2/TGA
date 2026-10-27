"use client";

import { useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { QuizBuilderPanel } from "@/components/learn/quiz/QuizBuilderPanel";
import { SampleWeeksPanel } from "@/components/learn/quiz/SampleWeeksPanel";
import { AnalyticsPanel } from "@/components/learn/quiz/AnalyticsPanel";
import { YourChildsWeekQuiz } from "@/components/eligibility/YourChildsWeekQuiz";
import type { QuizConfig } from "@/lib/quiz/schema";
import { PageHeader } from "@/components/learn/PageHeader";
import { Tabs, tabPanelProps } from "@/components/learn/Tabs";

type Tab = "builder" | "sample-weeks" | "analytics";

function AdminQuizContent() {
  const [tab, setTab] = useState<Tab>("builder");
  const [previewConfig, setPreviewConfig] = useState<QuizConfig | null>(null);

  if (previewConfig) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between rounded-2xl bg-amber-50 p-4 text-amber-900">
          <p className="text-sm font-medium">Previewing as a parent, the draft config, no data is saved from this run.</p>
          <button type="button" onClick={() => setPreviewConfig(null)} className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold hover:bg-amber-100 transition-colors">
            Exit preview
          </button>
        </div>
        <div className="rounded-2xl border border-gold-light/50 bg-cream p-6">
          <YourChildsWeekQuiz configOverride={previewConfig} previewMode />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "Quiz and sample weeks" }]}
        title="Quiz and sample weeks"
        subtitle={"Edit \"Your Child's Week\": questions, the rules editor, result sections, sample weeks for each year group, and quiz analytics."}
      />

      <Tabs
        items={[
          { key: "builder", label: "Questions, rules & copy" },
          { key: "sample-weeks", label: "Sample weeks" },
          { key: "analytics", label: "Analytics" },
        ]}
        value={tab}
        onChange={setTab}
        label="Quiz sections"
        idBase="quiz"
        className="mb-6"
      />

      <div {...tabPanelProps("quiz", tab)}>
        {tab === "builder" && <QuizBuilderPanel onPreview={setPreviewConfig} />}
        {tab === "sample-weeks" && <SampleWeeksPanel />}
        {tab === "analytics" && <AnalyticsPanel />}
      </div>
    </div>
  );
}

export default function AdminQuizPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminShell>
          <AdminQuizContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
