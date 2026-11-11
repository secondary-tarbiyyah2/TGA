"use client";

import { SectionLayout, SectionNav } from "@/components/learn/SectionNav";
import { useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { useLearnSession } from "@/lib/learn/session";
import { MAIN_SITE_ORIGIN } from "@/lib/learn/origin";
import { btn } from "@/components/learn/ui";
import { ApplicationsPanel } from "@/components/learn/recruitment/ApplicationsPanel";
import { VacanciesPanel } from "@/components/learn/recruitment/VacanciesPanel";
import { RecruitmentSettingsPanel } from "@/components/learn/recruitment/RecruitmentSettingsPanel";

type Tab = "applications" | "vacancies" | "settings";

function RecruitmentContent() {
  const { session } = useLearnSession();
  const userId = session && session !== "loading" ? session.user.id : null;
  const [tab, setTab] = useState<Tab>("applications");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Recruitment"
        subtitle="Job applications from the Careers page, the roles you advertise, and where new applications are emailed."
        actions={
          <a href={`${MAIN_SITE_ORIGIN}/careers/`} target="_blank" rel="noopener noreferrer" className={btn("secondary")}>
            View Careers page<span className="sr-only"> (opens in a new tab)</span>
          </a>
        }
      />
      <SectionLayout
        nav={
          <SectionNav
            items={[
          { key: "applications", label: "Applications" },
          { key: "vacancies", label: "Vacancies" },
          { key: "settings", label: "Email settings" },
        ]}
            value={tab}
            onChange={setTab}
            label="Recruitment sections"
            guide="recruitment-tabs"
          />
        }
      >
        <div>
        {tab === "applications" ? <ApplicationsPanel userId={userId} /> : tab === "vacancies" ? <VacanciesPanel userId={userId} /> : <RecruitmentSettingsPanel />}
      </div>
      </SectionLayout>
    </div>
  );
}

export default function AdminRecruitmentPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <RecruitmentContent />
      </LearnGate>
    </section>
  );
}
