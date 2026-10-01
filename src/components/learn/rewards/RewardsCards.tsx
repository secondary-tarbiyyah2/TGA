"use client";

import { HouseTable } from "@/components/learn/rewards/HouseTable";
import { MyCertificates, StarShoutOuts } from "@/components/learn/rewards/StarsOfTheWeek";
import { StreakChips } from "@/components/learn/rewards/StreakChips";

// One drop-in block per dashboard so each page needs a single line. Every
// piece hides itself when it has nothing to show (no houses yet, no star this
// week, no running streak).

export function StudentRewards({ childId }: { childId: string }) {
  return (
    <div className="space-y-4">
      <StreakChips childId={childId} />
      <div className="grid gap-4 md:grid-cols-2">
        <HouseTable />
        <StarShoutOuts />
      </div>
      <MyCertificates childIds={[childId]} />
    </div>
  );
}

export function FamilyRewards({ childIds }: { childIds: string[] }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <HouseTable />
        <StarShoutOuts />
      </div>
      <MyCertificates childIds={childIds} />
    </div>
  );
}

export function TeacherRewards() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <HouseTable />
      <StarShoutOuts />
    </div>
  );
}
