"use client";

import { useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { EmptyState, ui } from "@/components/learn/ui";
import { useFamilyChildren } from "@/lib/learn/classes";
import { QuranPupilView } from "@/components/learn/quran/QuranPupilView";

function Content() {
  const children = useFamilyChildren();
  const [childId, setChildId] = useState("");
  const current = childId || children?.[0]?.id || "";
  const name = children?.find((c) => c.id === current)?.name?.split(" ")[0];
  return (
    <>
      <PageHeader crumbs={[{ label: "Home", href: "/family/dashboard" }, { label: "Qur'an" }]} title="Qur'an and Qaidah" subtitle={`How ${name || "your child"} is getting on: marks out of 10, surahs covered, revision, homework and one-to-one sessions.`} />
      {children && children.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Child">
          {children.map((c) => (
            <button key={c.id} type="button" aria-pressed={current === c.id} onClick={() => setChildId(c.id)} className={current === c.id ? ui.chipOn : ui.chip}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      {children === null ? <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" /> : children.length === 0 ? <EmptyState title="No children on your account yet." /> : <QuranPupilView childId={current} name={name} />}
    </>
  );
}

export default function FamilyQuranPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <LearnShell role="family">
          <Content />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
