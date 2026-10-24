"use client";

import { useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { Tabs, tabPanelProps } from "@/components/learn/Tabs";
import { BaselineImport } from "@/components/learn/pupil/BaselineImport";
import { EntryAssessmentsAdmin } from "@/components/learn/assess/EntryAssessmentsAdmin";

export default function AdminAssessmentsPage() {
  const [tab, setTab] = useState<"tga" | "gl">("tga");
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <PageHeader
          title="Entry assessments"
          subtitle="Our own entry assessment: every child gets a paper made for their year group, marked automatically, with Writing, Qur'an and Arabic marked by a teacher. Results go on the pupil's record."
        />
        <Tabs
          label="Assessment type"
          idBase="assess"
          value={tab}
          onChange={setTab}
          items={[
            { key: "tga", label: "TGA entry assessment" },
            { key: "gl", label: "GL Assessment results (optional)" },
          ]}
          className="mb-5"
        />
        <div {...tabPanelProps("assess", tab)}>{tab === "tga" ? <EntryAssessmentsAdmin /> : <BaselineImport />}</div>
      </LearnGate>
    </section>
  );
}
