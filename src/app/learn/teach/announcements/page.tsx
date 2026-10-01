"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { AnnouncementsPage } from "@/components/learn/announcements/AnnouncementsPage";

export default function TeachAnnouncementsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <AnnouncementsPage mode="teach" />
      </LearnGate>
    </section>
  );
}
