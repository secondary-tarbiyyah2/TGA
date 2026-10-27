"use client";

// Live counts for the sidebar: work waiting, shown as small badges so the navigation itself
// says where you're needed. Everything is read through the same RLS-scoped sources the pages
// use, cached for two minutes per tab so moving between pages doesn't re-query.

import { attachHomework } from "@/lib/learn/homeworkStatus";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { PortalArea } from "@/lib/learn/nav";

export type NavBadgeKey = "actions" | "messages" | "todo" | "review";
export type NavBadges = Partial<Record<NavBadgeKey, number>>;

const KEY = (area: string) => `tga-nav-badges:${area}`;
const TTL = 2 * 60 * 1000;
const DAY = 86_400_000;

async function load(area: PortalArea): Promise<NavBadges> {
  const supabase = getSupabaseClient();
  if (!supabase) return {};
  const out: NavBadges = {};

  // Unread messages (same RPC the Messages page uses).
  try {
    const { data } = await supabase.rpc("thread_unread_counts");
    out.messages = ((data as { unread: number }[]) || []).reduce((n, r) => n + (Number(r.unread) || 0), 0);
  } catch {
    /* no badge is better than a wrong one */
  }

  try {
    if (area === "teach" || area === "admin") {
      const since = new Date(Date.now() - 21 * DAY).toISOString();
      const [hw, fu] = await Promise.all([
        supabase.from("homework_attention").select("homework_id", { count: "exact", head: true }).eq("attention", "missing").gte("due_at", since),
        supabase.from("absence_followups").select("id", { count: "exact", head: true }).in("status", ["open", "contacted", "escalated"]),
      ]);
      out.actions = (hw.count || 0) + (fu.count || 0);
      if (area === "teach") {
        // Work handed in and not yet returned (the To review page's own source).
        const { count } = await supabase.from("homework_review_queue").select("submission_id", { count: "exact", head: true });
        out.review = count || 0;
      }
    } else {
      // A pupil's (or family's) own homework: RLS already limits rows to their children.
      const since = new Date(Date.now() - 30 * DAY).toISOString();
      // Archived homework is hidden from families/pupils by RLS, so its embed comes back null: skip it.
      const { data } = await supabase.from("homework_status").select("homework_id, status, due_at").gte("due_at", since).limit(400);
      const rows = ((await attachHomework(supabase, data as unknown as { homework_id: string }[], "title")) as unknown as { status: string; due_at: string; homework: { title: string } | null }[]).filter((r) => r.homework);
      const missing = rows.filter((r) => r.status === "missing").length;
      const dueSoon = rows.filter((r) => r.status === "not_yet_due" && new Date(r.due_at).getTime() - Date.now() < 3 * DAY).length;
      out.actions = missing;
      out.todo = missing + dueSoon;
    }
  } catch {
    /* ignore */
  }
  return out;
}

/** Counts for this area's badges, refreshed at most every two minutes per tab. */
export function useNavBadges(area: PortalArea): NavBadges {
  const [badges, setBadges] = useState<NavBadges>({});
  useEffect(() => {
    let alive = true;
    try {
      const cached = JSON.parse(window.sessionStorage.getItem(KEY(area)) || "null") as { at: number; badges: NavBadges } | null;
      if (cached && Date.now() - cached.at < TTL) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the cached counts once after mount
        setBadges(cached.badges);
        return;
      }
    } catch {
      /* fall through to a fresh load */
    }
    load(area).then((b) => {
      if (!alive) return;
      setBadges(b);
      try {
        window.sessionStorage.setItem(KEY(area), JSON.stringify({ at: Date.now(), badges: b }));
      } catch {
        /* fine uncached */
      }
    });
    return () => {
      alive = false;
    };
  }, [area]);
  return badges;
}

export function NavBadge({ count, alert = true }: { count: number | undefined; alert?: boolean }) {
  if (!count) return null;
  return (
    <span aria-label={`${count} waiting`} className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white ${alert ? "bg-red-700" : "bg-teal-600"}`}>
      {count > 9 ? "9+" : count}
    </span>
  );
}
