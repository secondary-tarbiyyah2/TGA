"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PaymentsBoard } from "@/components/learn/payments/PaymentsBoard";

/** Fees > Payments (T71, docs/payments.md). Head teacher and admin only. */
export default function AdminPaymentsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PaymentsBoard />
      </LearnGate>
    </section>
  );
}
