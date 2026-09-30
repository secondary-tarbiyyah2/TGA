"use client";

import { Suspense } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { ClassPage } from "@/components/learn/class/ClassPage";
import type { ClassViewer } from "@/lib/learn/classes";

const VIEWER: ClassViewer = { kind: "teacher" };

export default function TeachClassPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <Suspense fallback={<p className="text-sm text-ink/60">Loading…</p>}>
          <ClassPage viewer={VIEWER} />
        </Suspense>
      </LearnGate>
    </section>
  );
}
