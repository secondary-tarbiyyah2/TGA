"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { AnnouncementsPage } from "@/components/learn/announcements/AnnouncementsPage";

export default function FamilyAnnouncementsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <AnnouncementsPage mode="family" />
      </LearnGate>
    </section>
  );
}
