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
            crumbs={[{ label: "Dashboard", href: "/teach/dashboard" }, { label: "Qur'an" }]}
            title="Qur'an and Qaidah"
            subtitle="Set homework for a level group, mark it out of 10, schedule one-to-one recitation and keep revision on track."
          />
          <QuranTeacher />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
