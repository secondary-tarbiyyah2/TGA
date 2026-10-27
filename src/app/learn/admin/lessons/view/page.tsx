"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { LessonDetail } from "@/components/learn/LessonDetail";

function AdminLessonContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const back = (
    <Link href="/admin/lessons/list" className="mb-3 inline-block text-sm font-medium text-teal-700 hover:underline">
      &larr; All lessons
    </Link>
  );
  if (!id)
    return (
      <>
        {back}
        <p className="text-sm text-ink/65">No lesson selected. Choose one from the list of lessons.</p>
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
