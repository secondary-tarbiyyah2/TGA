"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { localDateKey } from "@/lib/learn/calendar";
import type { TimetableSlot } from "@/lib/learn/timetable";
import { ackState, usePupils } from "@/components/learn/pupil/usePupils";
import { type IconName } from "@/components/learn/Icon";
import { StatStrip, StatTile } from "@/components/learn/kit";

type Lesson = { id: string; classId: string; className: string; start: string; end: string; live: boolean; registerTaken: boolean };
type Counts = { toMark: number; oldestDays: number; unread: number; dueSoon: number };

const hhmm = (t: string) => t.slice(0, 5);

/** The top of the teacher dashboard: four counts of what needs doing
 * (registers due, work to mark, homework due soon, pupil records to read),
 * today's lessons with Join and register status, and quick actions. Every
 * count comes from the same records as the page it links to, so the
 * numbers always agree. */
export function TeachNow({ slots }: { slots: (TimetableSlot & { classes?: { name: string } | null })[] | null }) {
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Medical / emergency details the teacher hasn't acknowledged yet (same rule as the Pupils page).
  const { pupils } = usePupils(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || slots === null) return;
    let cancelled = false;
    (async () => {
      const bySlot = new Map(slots.map((s) => [s.id, s]));
      const today = localDateKey(new Date());
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const in7 = new Date(Date.now() + 7 * 86_400_000).toISOString();
      const [slotLessons, ownLessons, unreadRes, queueRes, dueRes] = await Promise.all([
        slots.length
          ? supabase.from("lesson_instances").select("id, bbb_status, timetable_slot_id").eq("date", today).in("timetable_slot_id", [...bySlot.keys()])
          : Promise.resolve({ data: [] }),
        // Lessons given to this teacher directly (cover, or a subject mapping), with their slot.
        user
          ? supabase
              .from("lesson_instances")
              .select("id, bbb_status, timetable_slot_id, timetable_slots(class_id, start_time, end_time, classes(name))")
              .eq("date", today)
              .eq("teacher_user_id", user.id)
          : Promise.resolve({ data: [] }),
        supabase.rpc("thread_unread_counts"),
        // The same list as the To review page, so the two numbers always agree.
        supabase.from("homework_review_queue").select("submitted_at").order("submitted_at", { ascending: true }).limit(1000),
        user
          ? supabase.from("homework").select("id", { count: "exact", head: true }).eq("teacher_id", user.id).is("archived_at", null).gte("due_at", new Date().toISOString()).lte("due_at", in7)
          : Promise.resolve({ count: 0 }),
      ]);
      type SlotEmbed = { class_id: string; start_time: string; end_time: string; classes?: { name: string } | null } | null;
      const merged = new Map<string, { id: string; bbb_status: string; slot: SlotEmbed }>();
      for (const l of (slotLessons.data as { id: string; bbb_status: string; timetable_slot_id: string }[] | null) || []) {
        const sl = bySlot.get(l.timetable_slot_id);
        merged.set(l.id, { id: l.id, bbb_status: l.bbb_status, slot: sl ? { class_id: sl.class_id, start_time: sl.start_time, end_time: sl.end_time, classes: sl.classes } : null });
      }
      for (const l of (ownLessons.data as unknown as { id: string; bbb_status: string; timetable_slots: SlotEmbed }[] | null) || []) {
        if (!merged.has(l.id)) merged.set(l.id, { id: l.id, bbb_status: l.bbb_status, slot: l.timetable_slots });
      }
      const lessonRows = [...merged.values()].filter((l) => l.slot);
      const ids = lessonRows.map((l) => l.id);
      const attRes = ids.length ? await supabase.from("attendance_records").select("lesson_instance_id").in("lesson_instance_id", ids) : { data: [] };
      if (cancelled) return;

      const taken = new Set(((attRes.data as { lesson_instance_id: string }[] | null) || []).map((a) => a.lesson_instance_id));
      setLessons(
        lessonRows
          .map((l) => ({ id: l.id, classId: l.slot!.class_id, className: l.slot!.classes?.name || "Class", start: l.slot!.start_time, end: l.slot!.end_time, live: l.bbb_status === "live", registerTaken: taken.has(l.id) }))
          .sort((a, b) => a.start.localeCompare(b.start)),
      );
      const queue = (queueRes.data as { submitted_at: string }[] | null) || [];
      setCounts({
        toMark: queue.length,
        oldestDays: queue.length ? Math.floor((Date.now() - new Date(queue[0].submitted_at).getTime()) / 86_400_000) : 0,
        unread: ((unreadRes.data as { unread: number }[] | null) || []).reduce((n, r) => n + r.unread, 0),
        dueSoon: (dueRes as { count: number | null }).count || 0,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [slots]);

  const join = async (id: string) => {
    const popup = window.open("", "_blank");
    if (popup) popup.opener = null;
    setBusy(id);
    setMessage(null);
    const result = await callEdgeFunction("lesson-join", { lesson_instance_id: id });
    setBusy(null);
    const url = typeof result.joinUrl === "string" ? result.joinUrl : null;
    if (result.ok && url) {
      if (popup) popup.location.href = url;
      else window.location.assign(url);
    } else {
      popup?.close();
      setMessage(edgeErrorMessage(result));
    }
  };

  const now = new Date().toTimeString().slice(0, 5);
  const missingRegisters = (lessons || []).filter((l) => !l.registerTaken && now >= hhmm(l.start)).length;
  const toRead = pupils === null ? null : pupils.filter((p) => p.classes.length > 0 && ackState(p) !== "current").length;

  const stats: { label: string; n: number | null; note: string; href: string; urgent: boolean; icon: IconName; tile: string }[] = [
    { label: "Registers due", n: counts ? missingRegisters : null, note: missingRegisters ? "Lessons started without a register" : "All taken so far today", href: "/teach/today", urgent: missingRegisters > 0, icon: "clipboardCheck", tile: "tile-teal" },
    {
      label: "To mark",
      n: counts?.toMark ?? null,
      note: counts?.toMark ? (counts.oldestDays >= 1 ? `Oldest waiting ${counts.oldestDays} day${counts.oldestDays === 1 ? "" : "s"}` : "Handed in today") : "All caught up",
      href: "/teach/review",
      urgent: !!counts && counts.oldestDays >= 7,
      icon: "notebookPen",
      tile: "tile-violet",
    },
    { label: "Homework due soon", n: counts?.dueSoon ?? null, note: "Set by you, due in the next 7 days", href: "/teach/calendar", urgent: false, icon: "listChecks", tile: "tile-blue" },
    { label: "Pupil records to read", n: toRead, note: toRead ? "Medical and emergency details" : "All read", href: "/teach/pupils", urgent: !!toRead, icon: "idCard", tile: "tile-rose" },
  ];
  const actions = [
    { label: "Take a register", href: "/teach/today" },
    { label: "Set work in a class", href: "/teach/classes" },
    { label: "Mark work", href: "/teach/review" },
    { label: "Enter results", href: "/teach/assessment" },
    { label: "Send a message", href: "/teach/messages" },
  ];

  return (
    <div className="space-y-4">
      <StatStrip>
        {stats.map((st) => (
          <StatTile key={st.label} value={st.n === null ? "…" : st.n} label={st.label} hint={st.note} href={st.href} tone={st.urgent ? "warn" : "neutral"} />
        ))}
      </StatStrip>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <section className="rounded-2xl border border-gold-light bg-white" aria-labelledby="today-heading">
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 id="today-heading" className="font-serif text-h3 font-semibold text-ink">
              Your day
            </h2>
            <Link href="/teach/today" className="text-sm font-medium text-teal-700 hover:underline">
              Registers
            </Link>
          </div>
          <div className="px-5 py-3">
            {lessons === null ? (
              <div className="h-16 motion-safe:animate-pulse rounded-lg bg-cream" />
            ) : lessons.length === 0 ? (
              <p className="text-sm text-ink/65">No lessons today.</p>
            ) : (
              <ul data-guide="teach-your-day" className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" aria-label="Your day">
                {lessons.map((l) => {
                  const done = now > hhmm(l.end);
                  const due = !l.registerTaken && now >= hhmm(l.start);
                  const isNext = !done && l.id === lessons.find((x) => now <= hhmm(x.end))?.id;
                  return (
                    <li key={l.id} className={`flex min-h-36 flex-col gap-2 rounded-2xl border p-4 ${isNext ? "border-forest-900 bg-forest-900 text-white" : due ? "border-red-200 bg-white" : "border-gold-light bg-white"}`}>
                      <p className={`text-sm font-semibold tabular-nums ${isNext ? "text-gold-300" : "text-gold-700"}`}>
                        {hhmm(l.start)}–{hhmm(l.end)}
                        {isNext && <span className="ml-2 font-medium">{l.live ? "Live now" : now >= hhmm(l.start) ? "On now" : "Next"}</span>}
                      </p>
                      <Link href={`/teach/lessons/view?id=${l.id}`} className={`truncate text-base font-semibold hover:underline ${isNext ? "text-white" : "text-ink"}`} title={l.className}>
                        {l.className}
                      </Link>
                      <div>
                        {l.registerTaken ? (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isNext ? "bg-white/15 text-white" : "bg-forest-100 text-forest-900"}`}>Register taken</span>
                        ) : due ? (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">Register not taken</span>
                        ) : done ? null : (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isNext ? "bg-white/15 text-white" : "bg-cream text-ink/70"}`}>Later</span>
                        )}
                      </div>
                      <div className="mt-auto flex flex-wrap gap-2">
                        {due && (
                          <Link href="/teach/today" className={`${isNext ? "bg-white text-forest-900 hover:bg-cream" : "bg-forest-700 text-white hover:bg-forest-900"} inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold`}>
                            Take register
                          </Link>
                        )}
                        {!done && (
                          <button type="button" onClick={() => join(l.id)} disabled={busy === l.id} className={`${isNext ? "bg-gold-300 text-forest-900 hover:bg-gold-100" : "border border-forest-200 bg-white text-forest-900 hover:bg-forest-50"} inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold disabled:opacity-60`}>
                            {busy === l.id ? "Starting…" : "Start on Teams"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {message && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{message}</p>}
          </div>
          {/* Documents to sign already have the banner above and their own list below, so only unread messages are flagged here. */}
          {counts && counts.unread > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-gold-light px-5 py-3">
              <Link href="/teach/messages" className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900 hover:bg-amber-100">
                {counts.unread} unread message{counts.unread === 1 ? "" : "s"}
              </Link>
            </div>
          )}
        </section>

        <nav data-guide="teach-quick-actions" aria-label="Quick actions" className="rounded-2xl border border-gold-light bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Quick actions</h2>
          <ul className="space-y-1.5">
            {actions.map((a) => (
              <li key={a.href + a.label}>
                <Link href={a.href} className="flex items-center justify-between rounded-lg border border-gold-light/70 px-3 py-2 text-sm font-medium text-ink hover:border-teal-700 hover:bg-teal-100/50">
                  {a.label}
                  <span aria-hidden="true" className="text-teal-700">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
