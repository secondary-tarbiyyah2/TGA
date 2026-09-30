"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnPermission } from "@/lib/learn/session";

type Signal = { id: string; message: string; href: string; createdAt: string };

/**
 * A real notification centre for admin-ish roles, aggregated from the
 * SAME live tables the admin dashboard's "At a glance" tiles already
 * query (absence alerts via audit_log, outstanding_signatures, flagged
 * messages) — never a separate notifications table that could drift from
 * what's actually true. "Unread" is tracked per-user via
 * notification_reads.last_read_at (0024): opening the dropdown marks
 * everything currently shown as read by bumping that timestamp.
 */
export function NotificationBell({ userId }: { userId: string }) {
  const supabase = getSupabaseClient();
  const isSafeguardingLead = useLearnPermission("safeguarding_lead");
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: readRow } = await supabase.from("notification_reads").select("last_read_at").eq("user_id", userId).maybeSingle();
      setLastReadAt(readRow?.last_read_at ?? "1970-01-01T00:00:00Z");

      const [{ data: absences }, { data: outstanding }, flaggedResult] = await Promise.all([
        supabase.from("audit_log").select("id, created_at").eq("action", "ABSENCE_ALERT_SENT").order("created_at", { ascending: false }).limit(10),
        // outstanding_signatures is current STATE (who hasn't signed right
        // now), not an event log — it has no created_at to know "when this
        // became outstanding", so these are always listed for visibility
        // but deliberately excluded from the unread badge count below
        // rather than guessing a timestamp that would either miscount as
        // permanently new or silently never notify.
        supabase.from("outstanding_signatures").select("user_id, title"),
        isSafeguardingLead
          ? supabase.from("message_thread_messages").select("id, created_at").eq("flagged", true).order("created_at", { ascending: false }).limit(10)
          : Promise.resolve({ data: [] as { id: string; created_at: string }[] }),
      ]);

      const timestamped: Signal[] = [
        ...(absences || []).map((a) => ({ id: `absence-${a.id}`, message: "An unexplained absence alert was sent.", href: "/admin/compliance", createdAt: a.created_at })),
        ...((flaggedResult.data || []) as { id: string; created_at: string }[]).map((m) => ({
          id: `flag-${m.id}`,
          message: "A message was flagged for safeguarding review.",
          href: "/admin/compliance",
          createdAt: m.created_at,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const untimestamped: Signal[] = (outstanding || []).map((o, i) => ({
        id: `sig-${o.user_id}-${i}`,
        message: `${o.title || "A document"} is still unsigned.`,
        href: "/admin/compliance",
        createdAt: "",
      }));

      setSignals([...timestamped, ...untimestamped]);
    })();
  }, [supabase, userId, isSafeguardingLead]);

  async function markRead() {
    setOpen((o) => !o);
    if (!supabase) return;
    const now = new Date().toISOString();
    await supabase.from("notification_reads").upsert({ user_id: userId, last_read_at: now });
    setLastReadAt(now);
  }

  const unreadCount = signals && lastReadAt ? signals.filter((s) => s.createdAt > lastReadAt).length : 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={markRead}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-gold-light/60 text-ink/70 hover:bg-cream"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5">
          <path
            d="M10 2a5 5 0 00-5 5v2.586l-1.707 1.707A1 1 0 004 13h12a1 1 0 00.707-1.707L15 9.586V7a5 5 0 00-5-5zm0 16a2.5 2.5 0 002.45-2H7.55A2.5 2.5 0 0010 18z"
            fill="currentColor"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-700 px-1 text-[10px] font-semibold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-gold-light/50 bg-white p-3 shadow-lg">
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Notifications</p>
          {signals === null ? (
            <p className="p-2 text-sm text-ink/60">Loading…</p>
          ) : signals.length === 0 ? (
            <p className="p-2 text-sm text-ink/60">Nothing needs your attention.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {signals.map((s) => (
                <li key={s.id}>
                  <a href={s.href} className="block rounded-lg px-2 py-2 text-sm hover:bg-cream">
                    <span className="text-ink/80">{s.message}</span>
                    {s.createdAt && (
                      <span className="mt-0.5 block text-xs text-ink/40">{new Date(s.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
