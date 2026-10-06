"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { StudentTodo } from "@/components/learn/classwork/TodoList";

export default function StudentTodoPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["student"]}>
        <LearnShell role="student">
          <StudentTodo />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
