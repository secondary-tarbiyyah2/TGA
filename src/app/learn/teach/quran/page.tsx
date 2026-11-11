"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { QuranTeacher } from "@/components/learn/quran/QuranTeacher";

export default function TeachQuranPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher"]}>
        <LearnShell role="teach">
          <PageHeader
            title="Qur'an and Qaidah"
            subtitle="Hear each pupil recite and tap their mistakes; the mark works itself out from the school's standard. Homework, level groups, one to ones and revision are in the sections."
          />
          <QuranTeacher />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
