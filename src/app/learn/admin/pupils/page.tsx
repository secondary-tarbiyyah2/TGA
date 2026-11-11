"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminPupilDetail } from "@/components/learn/pupil/AdminPupilDetail";
import { AdminPupils } from "@/components/learn/pupil/AdminPupils";

function PupilsContent() {
  const params = useSearchParams();
  const id = params.get("id");
  return id ? <AdminPupilDetail id={id} /> : <AdminPupils />;
}

export default function AdminPupilsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <Suspense fallback={null}>
          <PupilsContent />
        </Suspense>
      </LearnGate>
    </section>
  );
}
