"use client";

import { Suspense } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { SendPage } from "@/components/learn/send/SendRegister";

export default function AdminSendPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <Suspense fallback={null}>
          <SendPage area="admin" />
        </Suspense>
      </LearnGate>
    </section>
  );
}
