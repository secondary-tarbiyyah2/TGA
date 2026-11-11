"use client";

import { Loading } from "@/components/learn/kit";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnPermission } from "@/lib/learn/session";
import { loadFeatures } from "@/lib/learn/features";
import { Icon } from "@/components/learn/Icon";
import { ScrollArea } from "@/components/learn/ScrollArea";

type Signal = { id: string; message: string; href: string; createdAt: string };

/**
 * A real notification centre for admin-ish roles, aggregated from the
 * SAME live tables the admin dashboard's "At a glance" tiles already
 * query (absence alerts via audit_log, outstanding_signatures, flagged
 * messages) · never a separate notifications table that could drift from
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

      const [{ data: absences }, { data: outstanding }, flaggedResult, { data: feedback }, lessonFeedback] = await Promise.all([
        supabase.from("audit_log").select("id, created_at").eq("action", "ABSENCE_ALERT_SENT").order("created_at", { ascending: false }).limit(10),
        // outstanding_signatures is current STATE (who hasn't signed right
        // now), not an event log, it has no created_at to know "when this
        // became outstanding", so these are always listed for visibility
        // but deliberately excluded from the unread badge count below
        // rather than guessing a timestamp that would either miscount as
        // permanently new or silently never notify.
        supabase.from("outstanding_signatures").select("user_id, title"),
        isSafeguardingLead
          ? supabase.from("message_thread_messages").select("id, created_at").eq("flagged", true).order("created_at", { ascending: false }).limit(10)
          : Promise.resolve({ data: [] as { id: string; created_at: string }[] }),
        // New feedback tickets (0092). RLS returns rows only to head/admin.
        supabase.from("feedback_tickets").select("id, created_at, kind").eq("status", "new").order("created_at", { ascending: false }).limit(10),
        // Lesson feedback from staff (0191, Tafweed T34). RLS returns every note only to head/admin.
        // Not while the Headteacher has Lesson feedback switched off (Settings, School features).
        (async (): Promise<{ data: { id: string; created_at: string }[] | null; error: unknown }> => {
          if (!(await loadFeatures()).lesson_feedback) return { data: [], error: null };
          const r = await supabase.from("curriculum_lesson_feedback").select("id, created_at, author_id").eq("status", "open").neq("author_id", userId).order("created_at", { ascending: false }).limit(10);
          return { data: r.data, error: r.error };
        })(),
      ]);

      const timestamped: Signal[] = [
        ...(absences || []).map((a) => ({ id: `absence-${a.id}`, message: "An unexplained absence alert was sent.", href: "/admin/compliance", createdAt: a.created_at })),
        ...((flaggedResult.data || []) as { id: string; created_at: string }[]).map((m) => ({
          id: `flag-${m.id}`,
          message: "A message was flagged for safeguarding review.",
          href: "/admin/compliance",
          createdAt: m.created_at,
        })),
        ...((feedback || []) as { id: string; created_at: string; kind: string }[]).map((f) => ({
          id: `feedback-${f.id}`,
          message: f.kind === "problem" ? "New problem reported through Feedback." : f.kind === "idea" ? "New improvement idea sent through Feedback." : "New question sent through Feedback.",
          href: "/admin/feedback",
          createdAt: f.created_at,
        })),
        ...(((lessonFeedback.error ? [] : lessonFeedback.data) || []) as { id: string; created_at: string }[]).map((f) => ({
          id: `lesson-feedback-${f.id}`,
          message: "New feedback on a lesson from a member of staff.",
          href: `/admin/curriculum?feedback=${f.id}`,
          createdAt: f.created_at,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const untimestamped: Signal[] = (outstanding || []).map((o, i) => ({
        id: `sig-${o.user_id}-${i}`,
        message: `${o.title || "A document"} is still unsigned.`,
        href: "/admin/documents",
        createdAt: "",
      }));

      setSignals([...timestamped, ...untimestamped]);
    })();
  }, [supabase, userId, isSafeguardingLead]);

  // Close on Escape or a click anywhere outside the bell.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (!(e.target as Element | null)?.closest?.("[data-notification-bell]")) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  async function markRead() {
    const opening = !open;
    setOpen(opening);
    // Only opening the list counts as reading it.
    if (!supabase || !opening) return;
    const now = new Date().toISOString();
    await supabase.from("notification_reads").upsert({ user_id: userId, last_read_at: now });
    setLastReadAt(now);
  }

  const unreadCount = signals && lastReadAt ? signals.filter((s) => s.createdAt > lastReadAt).length : 0;

  return (
    <div className="relative" data-notification-bell>
      <button
        type="button"
        onClick={markRead}
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="portal-icon-btn relative"
      >
        <Icon name="bell" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-700 px-1 text-[10px] font-semibold text-white ring-2 ring-[var(--portal-canvas)]">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-gold-light bg-white p-3 shadow-warm">
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-ink/65">Notifications</p>
          {signals === null ? (
            <Loading label="Loading…" bare />
          ) : signals.length === 0 ? (
            <p className="p-2 text-sm text-ink/65">Nothing needs your attention.</p>
          ) : (
            <ScrollArea label="Notifications" className="max-h-80">
            <ul className="space-y-1">
              {signals.map((s) => (
                <li key={s.id}>
                  <a href={s.href} className="block rounded-lg px-2 py-2 text-sm hover:bg-cream">
                    <span className="text-ink/80">{s.message}</span>
                    {s.createdAt && (
                      <span className="mt-0.5 block text-xs text-ink/65">{new Date(s.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
