"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { ReviewQueue } from "@/components/learn/classwork/ReviewQueue";

export default function TeachReviewPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <ReviewQueue />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
