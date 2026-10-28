"use client";

import { Suspense } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { FamilyTodo } from "@/components/learn/classwork/TodoList";

function Content() {
  return <FamilyTodo />;
}

export default function FamilyTodoPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <LearnShell role="family">
          <Suspense fallback={<p className="text-ink/65">Loading…</p>}>
            <Content />
          </Suspense>
        </LearnShell>
      </LearnGate>
    </section>
  );
}
