"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { ReviewQueue } from "@/components/learn/curriculum/ReviewQueue";

export default function TeachLessonReviewPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <PageHeader title="Lesson review" subtitle="Lessons in review across the school: what's waiting, what needs changes, and what's approved." />
          <ReviewQueue area="teach" />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
