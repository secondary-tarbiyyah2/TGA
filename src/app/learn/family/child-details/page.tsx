"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { ChildDetailsForm } from "@/components/learn/pupil/ChildDetailsForm";

export default function FamilyChildDetailsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <ChildDetailsForm />
      </LearnGate>
    </section>
  );
}
