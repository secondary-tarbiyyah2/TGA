"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { EmptyState } from "@/components/learn/ui";
import { useStudentChildId } from "@/lib/learn/classes";
import { QuranPupilView } from "@/components/learn/quran/QuranPupilView";

function Content() {
  const childId = useStudentChildId();
  return (
    <>
      <PageHeader crumbs={[{ label: "Home", href: "/student/dashboard" }, { label: "Qur'an" }]} title="Qur'an and Qaidah" subtitle="Your marks out of 10, the surahs you have covered, what to revise, homework and your one-to-one sessions." />
      {childId === undefined ? <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" /> : childId === null ? <EmptyState title="Your account isn't linked to a pupil record yet." /> : <QuranPupilView childId={childId} />}
    </>
  );
}

export default function StudentQuranPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["student"]}>
        <LearnShell role="student">
          <Content />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
