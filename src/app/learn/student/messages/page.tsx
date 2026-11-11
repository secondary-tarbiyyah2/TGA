"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { MessagesHub } from "@/components/learn/MessagesHub";

// Pupils read the groups their teachers put them in (0204), and reply only
// where the group allows it; their replies reach the staff only. They have no
// one-to-one conversations and cannot start one.
export default function StudentMessagesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["student"]}>
        <MessagesHub readOnly />
      </LearnGate>
    </section>
  );
}
