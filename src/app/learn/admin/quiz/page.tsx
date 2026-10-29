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
import { Button } from "@/components/learn/ui";

type Tab = "builder" | "sample-weeks" | "analytics";

function AdminQuizContent() {
  const [tab, setTab] = useState<Tab>("builder");
  const [previewConfig, setPreviewConfig] = useState<QuizConfig | null>(null);

  if (previewConfig) {
    return (
      <div>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="text-sm font-medium">Previewing your draft as a parent would see it. Nothing from this run is saved.</p>
          <Button onClick={() => setPreviewConfig(null)}>Exit preview</Button>
        </div>
        <div className="rounded-2xl border border-gold-light bg-cream p-4 sm:p-6">
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
