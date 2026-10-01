"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { AnnouncementsPage } from "@/components/learn/announcements/AnnouncementsPage";

export default function StudentAnnouncementsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["student"]}>
        <AnnouncementsPage mode="student" />
      </LearnGate>
    </section>
  );
}
