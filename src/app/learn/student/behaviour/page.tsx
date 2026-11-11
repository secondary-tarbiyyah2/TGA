"use client";

import { Loading } from "@/components/learn/kit";
import { useEffect, useMemo, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { getSupabaseClient } from "@/lib/supabase/client";
import { BadgeShelf } from "@/components/learn/behaviour/BadgeShelf";
import { RecordsTable } from "@/components/learn/behaviour/RecordsTable";
import { StatTile } from "@/components/learn/behaviour/StatTile";
import { StudentLeaderboard } from "@/components/learn/behaviour/LeaderboardCards";
import { StudentRewards } from "@/components/learn/rewards/RewardsCards";
import { loadBadges, loadRecords, type BadgeAward, type BehaviourRecord } from "@/components/learn/behaviour/data";

function StudentBehaviourContent() {
  const [records, setRecords] = useState<BehaviourRecord[] | null>(null);
  const [badges, setBadges] = useState<BadgeAward[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [childId, setChildId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data: account } = await supabase.from("student_accounts").select("child_id").eq("profile_id", user.id).maybeSingle();
        const childId = (account as { child_id: string } | null)?.child_id;
        if (!childId) {
          setRecords([]);
          return;
        }
        setChildId(childId);
        const [recs, bdg] = await Promise.all([loadRecords(supabase, { childIds: [childId] }), loadBadges(supabase, { childIds: [childId] })]);
        // Positive framing: students only see their merits here.
        setRecords(recs.filter((r) => r.kind === "merit" && !r.voided_at));
        setBadges(bdg);
      } catch {
        setError("Couldn't load your merits.");
        setRecords([]);
      }
    })();
  }, []);

  const points = useMemo(() => (records || []).reduce((n, r) => n + r.points, 0), [records]);

  return (
    <>
      <PageHeader crumbs={[{ label: "Today", href: "/student/dashboard" }, { label: "Merits" }]} title="My merits and badges" subtitle="Well done for the good things you do. Every merit counts, and earns points for your house." />
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {records === null ? (
        <Loading label="Loading…" bare />
      ) : (
        <div className="space-y-4">
          <div data-guide="merit-stats" className="grid grid-cols-2 gap-3">
            <StatTile label="Merit points" value={String(points)} sub={points > 0 ? "Masha Allah, keep going!" : "Your first merit is waiting for you"} tone="good" />
            <StatTile label="Badges" value={String(badges.length)} />
          </div>
          <section>
            <h2 className="mb-2 text-base font-semibold text-ink">My badges</h2>
            <BadgeShelf badges={badges} empty="No badges yet. Keep working hard and you will earn one." />
          </section>
          <section data-guide="merit-recent" >
            <h2 className="mb-2 text-base font-semibold text-ink">My recent merits</h2>
            <RecordsTable records={records.slice(0, 30)} showStudent={false} empty="No merits yet. Helping others, great work and good manners all earn them." />
          </section>
          {childId && <StudentRewards childId={childId} />}
          {childId && <StudentLeaderboard childId={childId} />}
        </div>
      )}
    </>
  );
}

export default function StudentBehaviourPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["student"]}>
        <LearnShell role="student">
          <StudentBehaviourContent />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
