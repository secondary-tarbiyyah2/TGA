"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { MessagesHub } from "@/components/learn/MessagesHub";

export default function TeachMessagesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <MessagesHub />
      </LearnGate>
    </section>
  );
}
