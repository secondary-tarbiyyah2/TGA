"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { MessagesHub } from "@/components/learn/MessagesHub";

export default function FamilyMessagesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <MessagesHub subtitle="Message your children's teachers and the school office. Staff review messages for safeguarding as part of normal practice." />
      </LearnGate>
    </section>
  );
}
