"use client";

import { Suspense, useMemo } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { ClassPage } from "@/components/learn/class/ClassPage";
import { useStudentChildId, type ClassViewer } from "@/lib/learn/classes";

function StudentClassContent() {
  const childId = useStudentChildId();
  const viewer = useMemo<ClassViewer | null>(() => (childId ? { kind: "student", childId } : null), [childId]);
  if (childId === undefined) return <p className="text-sm text-ink/65">Loading…</p>;
  if (!viewer) return <p className="text-sm text-ink/65">Your account isn&apos;t linked to a student record yet.</p>;
  return <ClassPage viewer={viewer} />;
}

export default function StudentClassPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["student"]}>
        <Suspense fallback={<p className="text-sm text-ink/65">Loading…</p>}>
          <StudentClassContent />
        </Suspense>
      </LearnGate>
    </section>
  );
}
