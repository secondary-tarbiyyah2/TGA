"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { FamiliesContacts } from "@/components/learn/pupil/FamiliesContacts";

export default function AdminFamiliesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <FamiliesContacts />
      </LearnGate>
    </section>
  );
}
