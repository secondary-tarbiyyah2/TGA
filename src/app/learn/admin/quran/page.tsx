"use client";

import { useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { SectionLayout, SectionNav } from "@/components/learn/SectionNav";
import { QuranClasses } from "@/components/learn/quran/QuranClasses";
import { MarkingStandard } from "@/components/learn/quran/MarkingStandard";

type Sec = "classes" | "standard";

/** The head teacher's Qur'an page: every Qur'an class's recitations, and the marking standard (strictness bands). */
function AdminQuran() {
  const [sec, setSec] = useState<Sec>("classes");
  return (
    <>
      <PageHeader title="Qur'an" subtitle="Each Qur'an class's recitations and marks, and the standard every teacher marks to." />
      <SectionLayout
        nav={
          <SectionNav
            items={[
              { key: "classes" as Sec, label: "Hear and track" },
              { key: "standard" as Sec, label: "Marking standard" },
            ]}
            value={sec}
            onChange={setSec}
            label="Qur'an sections"
            guide="quran-sections"
            id="quran-section"
          />
        }
      >
        {sec === "classes" ? <QuranClasses scope="admin" /> : <MarkingStandard canEdit />}
      </SectionLayout>
    </>
  );
}

export default function AdminQuranPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminQuran />
      </LearnGate>
    </section>
  );
}
