"use client";

import { Loading } from "@/components/learn/kit";
import { Suspense } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { ClassPage } from "@/components/learn/class/ClassPage";
import type { ClassViewer } from "@/lib/learn/classes";

const VIEWER: ClassViewer = { kind: "staff" };

export default function AdminClassPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <Suspense fallback={<Loading label="Loading…" bare />}>
          <ClassPage viewer={VIEWER} />
        </Suspense>
      </LearnGate>
    </section>
  );
}
