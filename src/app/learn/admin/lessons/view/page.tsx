"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { LessonDetail } from "@/components/learn/LessonDetail";

function AdminLessonContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  if (!id) return <p className="text-sm text-ink/65">No lesson selected.</p>;
  return <LessonDetail lessonInstanceId={id} variant="admin" />;
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
