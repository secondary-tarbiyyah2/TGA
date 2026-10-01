"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { AnnouncementsPage } from "@/components/learn/announcements/AnnouncementsPage";

export default function AdminAnnouncementsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AnnouncementsPage mode="admin" />
      </LearnGate>
    </section>
  );
}
