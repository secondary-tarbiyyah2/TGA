"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { localDateKey } from "@/lib/learn/calendar";
import type { TimetableSlot } from "@/lib/learn/timetable";
import { ackState, usePupils } from "@/components/learn/pupil/usePupils";
import { Icon, type IconName } from "@/components/learn/Icon";

type Lesson = { id: string; classId: string; className: string; start: string; end: string; live: boolean; registerTaken: boolean };
type Counts = { toMark: number; oldestDays: number; unread: number; toSign: number; dueSoon: number };

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
      const [slotLessons, ownLessons, unreadRes, signRes, queueRes, dueRes] = await Promise.all([
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
        supabase.from("my_outstanding_signatures").select("document_id", { count: "exact", head: true }),
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
        toSign: signRes.count || 0,
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
    { label: "Homework due soon", n: counts?.dueSoon ?? null, note: "Set by you, due in the next 7 days", href: "/teach/homework", urgent: false, icon: "listChecks", tile: "tile-blue" },
    { label: "Pupil records to read", n: toRead, note: toRead ? "Medical and emergency details" : "All read", href: "/teach/pupils", urgent: !!toRead, icon: "idCard", tile: "tile-rose" },
  ];
  const actions = [
    { label: "Take a register", href: "/teach/today" },
    { label: "Set homework", href: "/teach/homework" },
    { label: "Mark work", href: "/teach/review" },
    { label: "Enter results", href: "/teach/assessment" },
    { label: "Send a message", href: "/teach/messages" },
  ];

  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="What needs doing">
        {stats.map((st) => (
          <li key={st.label}>
            <Link href={st.href} className={`group flex h-full items-start gap-3 rounded-2xl border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md ${st.urgent ? "border-amber-300 bg-amber-50/40" : "border-gold-light"}`}>
              <span className={`portal-tile ${st.tile} mt-0.5`} aria-hidden="true"><Icon name={st.icon} /></span>
              <span className="min-w-0">
                <span className={`block text-3xl font-semibold leading-none tabular-nums ${st.urgent ? "text-amber-800" : "text-ink"}`}>{st.n === null ? "…" : st.n}</span>
                <span className="mt-1.5 block text-sm font-semibold text-ink">{st.label}</span>
                <span className="block text-xs text-ink/65">{st.note}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <section className="rounded-2xl border border-gold-light bg-white" aria-labelledby="today-heading">
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 id="today-heading" className="font-serif text-h3 font-semibold text-ink">
              Today&apos;s lessons
            </h2>
            <Link href="/teach/today" className="text-sm font-medium text-teal-700 hover:underline">
              Registers
            </Link>
          </div>
          <div className="px-5 py-3">
            {lessons === null ? (
              <div className="h-16 animate-pulse rounded-lg bg-cream" />
            ) : lessons.length === 0 ? (
              <p className="text-sm text-ink/65">No lessons today.</p>
            ) : (
              <ul className="divide-y divide-gold-light">
                {lessons.map((l) => {
                  const done = now > hhmm(l.end);
                  const due = !l.registerTaken && now >= hhmm(l.start);
                  return (
                    <li key={l.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <span className="w-24 shrink-0 text-sm tabular-nums text-ink/65">
                        {hhmm(l.start)}–{hhmm(l.end)}
                      </span>
                      <Link href={`/teach/lessons/view?id=${l.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold text-ink hover:text-teal-700">
                        {l.className}
                      </Link>
                      {l.live && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Live</span>}
                      {l.registerTaken ? (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">Register taken</span>
                      ) : due ? (
                        <Link href="/teach/today" className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 hover:bg-amber-100">
                          Take register
                        </Link>
                      ) : null}
                      {!done && (
                        <button type="button" onClick={() => join(l.id)} disabled={busy === l.id} className="rounded-lg bg-gold-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-60">
                          {busy === l.id ? "Starting…" : "Join"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {message && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{message}</p>}
          </div>
          {counts && (counts.unread > 0 || counts.toSign > 0) && (
            <div className="flex flex-wrap gap-2 border-t border-gold-light px-5 py-3">
              {counts.unread > 0 && (
                <Link href="/teach/messages" className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900 hover:bg-amber-100">
                  {counts.unread} unread message{counts.unread === 1 ? "" : "s"}
                </Link>
              )}
              {counts.toSign > 0 && (
                <Link href="/documents" className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900 hover:bg-amber-100">
                  {counts.toSign} document{counts.toSign === 1 ? "" : "s"} to sign
                </Link>
              )}
            </div>
          )}
        </section>

        <nav aria-label="Quick actions" className="rounded-2xl border border-gold-light bg-white p-4">
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
