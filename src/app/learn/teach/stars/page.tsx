"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { StarManager } from "@/components/learn/rewards/StarManager";

export default function TeachStarsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <PageHeader
            crumbs={[{ label: "Dashboard", href: "/teach/dashboard" }, { label: "Star of the week" }]}
            title="Star of the week"
            subtitle="Nominate one pupil from each of your classes. The Headteacher approves, then the family gets a certificate."
          />
          <StarManager isHead={false} />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
