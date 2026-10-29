"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { ActionCentre } from "@/components/learn/ActionCentre";

export default function TeachActionsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <PageHeader title="Action centre" subtitle="Everything that needs you, most urgent first: missing homework, absence follow-ups and Qur'an revision. Items clear by themselves when the work is done." />
          <ActionCentre role="teach" />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
