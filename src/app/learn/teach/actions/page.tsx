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
          <PageHeader title="Waiting for you" subtitle="Everything that needs you, by category: classwork, attendance, pupils and Qur'an. Items clear by themselves when the work is done." />
          <ActionCentre role="teach" />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
