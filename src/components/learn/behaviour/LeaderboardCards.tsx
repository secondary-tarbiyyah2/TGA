"use client";

import { useEffect, useMemo, useState } from "react";
import { MeritLeaderboard, type LeaderboardChoice } from "@/components/learn/behaviour/MeritLeaderboard";
import { LeaderboardPrivacy } from "@/components/learn/behaviour/LeaderboardPrivacy";
import { useViewerClasses, type ClassSummary, type ClassViewer } from "@/lib/learn/classes";
import { getSupabaseClient } from "@/lib/supabase/client";

const SCHOOL: LeaderboardChoice = { label: "Whole school", scope: "school" };

function classChoices(classes: ClassSummary[] | null): LeaderboardChoice[] {
  return (classes || []).map((c) => ({ label: c.name, scope: "class" as const, scopeId: c.id }));
}

/** Student dashboard: their classes, then the whole school. */
export function StudentLeaderboard({ childId }: { childId: string }) {
  const viewer = useMemo<ClassViewer>(() => ({ kind: "student", childId }), [childId]);
  const classes = useViewerClasses(viewer);
  const choices = useMemo(() => (classes === null ? [] : [...classChoices(classes), SCHOOL]), [classes]);
  if (choices.length === 0) return null;
  return <MeritLeaderboard choices={choices} mineLabel="You" title="Merit leaderboard" />;
}

/** Family dashboard: each child's year group, then the whole school; own children highlighted. */
export function FamilyLeaderboard({ kids }: { kids: { id: string; name: string; year_group_id: string | null; year_groups?: { name: string } | null }[] }) {
  const choices = useMemo(() => {
    const seen = new Set<string>();
    const out: LeaderboardChoice[] = [];
    for (const k of kids) {
      if (k.year_group_id && !seen.has(k.year_group_id)) {
        seen.add(k.year_group_id);
        out.push({ label: k.year_groups?.name || "Year group", scope: "year", scopeId: k.year_group_id });
      }
    }
    out.push(SCHOOL);
    return out;
  }, [kids]);
  const privacyKids = useMemo(() => kids.map((k) => ({ id: k.id, name: k.name })), [kids]);
  if (kids.length === 0) return null;
  return <MeritLeaderboard choices={choices} mineLabel="Your child" footer={<LeaderboardPrivacy kids={privacyKids} />} />;
}

const TEACHER: ClassViewer = { kind: "teacher" };

/** Teacher dashboard: each of their classes, then the whole school. */
export function TeacherLeaderboard() {
  const classes = useViewerClasses(TEACHER);
  const choices = useMemo(() => (classes === null ? [] : [...classChoices(classes), SCHOOL]), [classes]);
  if (choices.length === 0) return null;
  return <MeritLeaderboard choices={choices} title="Merit leaderboard" />;
}

/** Admin dashboard (head teacher / admin): whole school, then each year group. */
export function AdminLeaderboard() {
  const [years, setYears] = useState<LeaderboardChoice[]>([]);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from("year_groups")
      .select("id, name")
      .order("sort_order")
      .then(({ data }) => {
        if (cancelled) return;
        setYears(((data as { id: string; name: string }[] | null) || []).map((y) => ({ label: y.name, scope: "year" as const, scopeId: y.id })));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const choices = useMemo(() => [SCHOOL, ...years], [years]);
  return <MeritLeaderboard choices={choices} title="Merit leaderboard" />;
}
