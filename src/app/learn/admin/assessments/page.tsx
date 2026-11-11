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
          crumbs={[{ label: "Today", href: "/admin/dashboard" }, { label: "Entry assessments" }]}
          title="Entry assessments"
          subtitle="Each child gets a paper for their year group, marked automatically. Writing is first-marked by AI and checked by a teacher; Qur'an and Arabic are marked by a teacher on the call."
        />
        <Tabs
          label="Assessment type"
          guide="assessments-type"
          idBase="assess"
          value={tab}
          onChange={setTab}
          items={[
            { key: "tga", label: "TGA entry assessment" },
            { key: "gl", label: "GL Assessment results (optional)" },
          ]}
          className="mb-5 print:hidden"
        />
        <div {...tabPanelProps("assess", tab)}>{tab === "tga" ? <EntryAssessmentsAdmin /> : <BaselineImport />}</div>
      </LearnGate>
    </section>
  );
}
