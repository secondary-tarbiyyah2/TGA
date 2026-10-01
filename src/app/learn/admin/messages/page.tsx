"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { MessagesHub } from "@/components/learn/MessagesHub";

export default function AdminMessagesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <MessagesHub canAddPeople />
      </LearnGate>
    </section>
  );
}
