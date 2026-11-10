"use client";

import { Loading } from "@/components/learn/kit";
import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { ClassPage } from "@/components/learn/class/ClassPage";
import type { ClassViewer } from "@/lib/learn/classes";

function FamilyClassContent() {
  const params = useSearchParams();
  const childId = params.get("child");
  const classId = params.get("id");
  const viewer = useMemo<ClassViewer | null>(() => (childId ? { kind: "parent", childId } : null), [childId]);
  // An old or shortened link (no class or no child): send the parent to the list rather than a blank page.
  if (!viewer || !classId)
    return (
      <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/65">
        This link doesn&apos;t say which class to show.{" "}
        <Link href="/family/classes" className="font-medium text-teal-700 underline">
          Go to Classes
        </Link>
      </p>
    );
  return <ClassPage viewer={viewer} />;
}

export default function FamilyClassPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <Suspense fallback={<Loading label="Loading…" bare />}>
          <FamilyClassContent />
        </Suspense>
      </LearnGate>
    </section>
  );
}
