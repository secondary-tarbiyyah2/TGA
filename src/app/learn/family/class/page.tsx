"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { ClassPage } from "@/components/learn/class/ClassPage";
import type { ClassViewer } from "@/lib/learn/classes";

function FamilyClassContent() {
  const childId = useSearchParams().get("child");
  const viewer = useMemo<ClassViewer | null>(() => (childId ? { kind: "parent", childId } : null), [childId]);
  if (!viewer) return <p className="text-sm text-ink/60">Open a class from Classes to see it here.</p>;
  return <ClassPage viewer={viewer} />;
}

export default function FamilyClassPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <Suspense fallback={<p className="text-sm text-ink/60">Loading…</p>}>
          <FamilyClassContent />
        </Suspense>
      </LearnGate>
    </section>
  );
}
