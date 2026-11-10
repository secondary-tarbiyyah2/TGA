"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { ReviewQueue } from "@/components/learn/curriculum/ReviewQueue";

export default function AdminLessonReviewPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader
          crumbs={[{ label: "Today", href: "/admin/dashboard" }, { label: "Curriculum", href: "/admin/curriculum" }, { label: "Lesson review" }]}
          title="Lesson review"
          subtitle="Lessons submitted for review, sent back for changes, or approved and waiting to be published."
        />
        <ReviewQueue area="admin" />
      </LearnGate>
    </section>
  );
}
