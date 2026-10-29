"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { LessonDetail } from "@/components/learn/LessonDetail";
import { ButtonLink, EmptyState } from "@/components/learn/ui";

function AdminLessonContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const back = (
    <ButtonLink href="/admin/lessons/list" variant="ghost" size="sm" icon="chevronLeft" className="-ml-2 mb-3">
      All lessons
    </ButtonLink>
  );
  if (!id)
    return (
      <>
        {back}
        <EmptyState title="No lesson selected" icon="calendarDays" action={<ButtonLink href="/admin/lessons/list" variant="primary">Choose a lesson</ButtonLink>}>
          Open a lesson from the list of upcoming lessons.
        </EmptyState>
      </>
    );
  return (
    <>
      {back}
      <LessonDetail lessonInstanceId={id} variant="admin" />
    </>
  );
}

export default function AdminLessonViewPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminShell>
          <Suspense fallback={<p className="text-sm text-ink/65">Loading…</p>}>
            <AdminLessonContent />
          </Suspense>
        </AdminShell>
      </LearnGate>
    </section>
  );
}
