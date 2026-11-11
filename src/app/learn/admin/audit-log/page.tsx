"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { AuditLogViewer } from "@/components/learn/compliance/AuditLogViewer";
import { DigitalReviews } from "@/components/learn/compliance/DigitalReviews";
import { AccessReview, SignInReview } from "@/components/learn/compliance/AccessReview";
import { ui } from "@/components/learn/ui";

// Headteacher, Admin and the Digital Lead (migration 0218). Everything here is
// read only apart from recording a review; the database checks each call.
export default function AuditLogPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "digital_lead"]}>
        <PageHeader
          crumbs={[{ label: "Today", href: "/admin/dashboard" }, { label: "Audit log" }]}
          title="Audit log"
          subtitle="Who changed what, and when, with accounts, sign-ins and the record of reviews. Restricted records show only that a change happened."
        />
        <div className={ui.stack}>
          <DigitalReviews />
          <AuditLogViewer />
          <AccessReview />
          <SignInReview />
        </div>
      </LearnGate>
    </section>
  );
}
