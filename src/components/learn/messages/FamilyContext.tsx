"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { portalAreaFor } from "@/lib/learn/nav";
import { pupilRecordHref } from "@/components/learn/pupil/PupilLink";
import { attendanceLabel } from "@/lib/learn/attendanceCodes";
import { ukDaysAgo } from "@/lib/learn/ukTime";

export type FamilyChild = {
  id: string;
  name: string;
  yearGroup: string | null;
  /** Days away in the last 14 days, newest first, with the register code. */
  recentAbsences: { date: string; status: string }[];
};

const RECENT_DAYS = 14;

/**
 * Staff writing to a parent: the parent's children that this member of staff may see (RLS on
 * children decides: the office sees all, a teacher only the pupils they teach), each with year
 * group and days away in the last two weeks. Anything that fails to load is left out.
 */
export function useFamilyContext(parentId: string | null | undefined, enabled: boolean): FamilyChild[] | null {
  const [kids, setKids] = useState<FamilyChild[] | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !parentId || !enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to load for this conversation
      setKids(null);
      return;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase.from("children").select("id, name, year_groups(name)").eq("parent_user_id", parentId).order("name");
      const rows = ((data as unknown as { id: string; name: string; year_groups: { name: string } | null }[] | null) || []).map((c) => ({ id: c.id, name: c.name, yearGroup: c.year_groups?.name || null, recentAbsences: [] as FamilyChild["recentAbsences"] }));
      if (rows.length) {
        const { data: att } = await supabase
          .from("attendance_records")
          .select("child_id, status, lesson_instances!inner(date)")
          .in("child_id", rows.map((r) => r.id))
          .in("status", ["absent", "excused", "technical"])
          .gte("lesson_instances.date", ukDaysAgo(RECENT_DAYS - 1))
          .limit(500);
        const seen = new Set<string>();
        for (const a of (att as unknown as { child_id: string; status: string; lesson_instances: { date: string } | null }[] | null) || []) {
          const d = a.lesson_instances?.date;
          if (!d || seen.has(`${a.child_id}|${d}`)) continue;
          seen.add(`${a.child_id}|${d}`);
          rows.find((r) => r.id === a.child_id)?.recentAbsences.push({ date: d, status: a.status });
        }
        for (const r of rows) r.recentAbsences.sort((x, y) => y.date.localeCompare(x.date));
      }
      if (alive) setKids(rows);
    })();
    return () => {
      alive = false;
    };
  }, [parentId, enabled]);
  return kids;
}

const day = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** The strip under a conversation's header: who the family's children are, and anything recent to know. */
export function FamilyContextStrip({ kids }: { kids: FamilyChild[] }) {
  const area = portalAreaFor(usePathname() || "");
  if (kids.length === 0) return null;
  return (
    <ul aria-label="About this family" className="flex flex-wrap gap-x-5 gap-y-1.5 border-b border-gold-light bg-[var(--portal-sunken)] px-3 py-2 text-xs sm:px-4">
      {kids.map((k) => {
        const href = pupilRecordHref(area, k.id);
        const away = k.recentAbsences.length;
        return (
          <li key={k.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium text-ink">{k.name}</span>
            {k.yearGroup && <span className="text-ink-500">{k.yearGroup}</span>}
            {away > 0 && (
              <span className="text-amber-900" title={k.recentAbsences.map((a) => `${day(a.date)}: ${attendanceLabel(a.status)}`).join("\n")}>
                {away} day{away === 1 ? "" : "s"} away in the last {RECENT_DAYS} days
              </span>
            )}
            {href && (
              <Link href={href} className="font-medium text-forest-700 underline-offset-2 hover:underline">
                Open record
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Ready-made first lines for a new conversation with a family. They fill the reply box; nothing is sent until you press Send. */
export function familyOpeners(parentName: string, kids: FamilyChild[], aboutId?: string | null): string[] {
  const hello = `Hello ${parentName.split(/\s+/)[0] || ""},`.replace(" ,", ",");
  const child = (aboutId && kids.find((k) => k.id === aboutId)) || kids[0];
  if (!child) return [`${hello} I am getting in touch from the school. Do you have a moment to talk this week?`];
  const first = child.name.split(/\s+/)[0];
  const out: string[] = [];
  const last = child.recentAbsences[0];
  if (last) out.push(`${hello} I noticed ${first} was away on ${day(last.date)}. I hope everything is all right. Is there anything we can do to help?`);
  out.push(`${hello} I wanted to share some good news about ${first}'s work this week.`);
  out.push(`${hello} could we find a time to talk about how ${first} is getting on?`);
  return out;
}
