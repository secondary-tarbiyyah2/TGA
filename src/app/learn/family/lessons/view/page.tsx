"use client";

import { Loading } from "@/components/learn/kit";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { LessonDetail } from "@/components/learn/LessonDetail";

function FamilyLessonContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const childId = searchParams.get("child");
  if (!id || !childId)
    return (
      <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/65">
        This link doesn&apos;t say which lesson or child to show.{" "}
        <Link href="/family/classes" className="font-medium text-teal-700 underline">
          Open it from Classes
        </Link>
      </p>
    );
  return <LessonDetail lessonInstanceId={id} variant="parent" childId={childId} />;
}

export default function FamilyLessonPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <LearnShell role="family">
          <Suspense fallback={<Loading label="Loading…" bare />}>
            <FamilyLessonContent />
          </Suspense>
        </LearnShell>
      </LearnGate>
    </section>
  );
}
