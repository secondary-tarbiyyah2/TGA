"use client";

import { HouseTable } from "@/components/learn/rewards/HouseTable";
import { MyCertificates, StarShoutOuts } from "@/components/learn/rewards/StarsOfTheWeek";
import { StreakChips } from "@/components/learn/rewards/StreakChips";
import { useFeature } from "@/lib/learn/features";

// One drop-in block per dashboard so each page needs a single line. Every
// piece hides itself when it has nothing to show (no houses yet, no star this
// week, no running streak). House points and Star of the Week are hidden while
// the Headteacher has "House points" switched off (Settings, School features).

export function StudentRewards({ childId }: { childId: string }) {
  const houses = useFeature("house_points");
  return (
    <div className="space-y-4">
      <StreakChips childId={childId} />
      {houses && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <HouseTable />
            <StarShoutOuts />
          </div>
          <MyCertificates childIds={[childId]} />
        </>
      )}
    </div>
  );
}

export function FamilyRewards({ childIds }: { childIds: string[] }) {
  const houses = useFeature("house_points");
  if (!houses) return null;
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
  const houses = useFeature("house_points");
  if (!houses) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <HouseTable />
      <StarShoutOuts />
    </div>
  );
}
