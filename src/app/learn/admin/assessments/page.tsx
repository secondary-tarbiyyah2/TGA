"use client";

import { SectionLayout, SectionNav } from "@/components/learn/SectionNav";
import { useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
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
        <SectionLayout
          nav={
            <SectionNav
              items={[
            { key: "tga", label: "TGA entry assessment" },
            { key: "gl", label: "GL Assessment results (optional)" },
          ]}
              value={tab}
              onChange={setTab}
              label="Assessment type"
              guide="assessments-type"
            />
          }
        >
          <div>{tab === "tga" ? <EntryAssessmentsAdmin /> : <BaselineImport />}</div>
        </SectionLayout>
      </LearnGate>
    </section>
  );
}
