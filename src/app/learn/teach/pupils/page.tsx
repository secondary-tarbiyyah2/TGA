"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { TeachPupils } from "@/components/learn/pupil/TeachPupils";
import { TeachPupilProfile } from "@/components/learn/pupil/TeachPupilProfile";

function Content() {
  const id = useSearchParams().get("id");
  return id ? <TeachPupilProfile id={id} /> : <TeachPupils />;
}

export default function TeachPupilsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover", "head_teacher", "admin"]}>
        <Suspense fallback={null}>
          <Content />
        </Suspense>
      </LearnGate>
    </section>
  );
}
