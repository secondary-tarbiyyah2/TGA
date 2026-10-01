"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { MessagesHub } from "@/components/learn/MessagesHub";

export default function FamilyMessagesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <MessagesHub />
      </LearnGate>
    </section>
  );
}
