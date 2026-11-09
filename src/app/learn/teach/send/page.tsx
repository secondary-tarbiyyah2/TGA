"use client";

import { Suspense } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { SendPage } from "@/components/learn/send/SendRegister";

export default function TeachSendPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover", "senco", "head_teacher", "admin"]}>
        <Suspense fallback={null}>
          <SendPage area="teach" />
        </Suspense>
      </LearnGate>
    </section>
  );
}
