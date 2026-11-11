"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { localDateKey } from "@/lib/learn/calendar";
import type { TimetableSlot } from "@/lib/learn/timetable";
import { Icon } from "@/components/learn/Icon";
import { QuickActions, type QuickAction } from "@/components/learn/dashboard/QuickActions";
import { BehaviourDialog } from "@/components/learn/dashboard/BehaviourDialog";
import { Status, ui } from "@/components/learn/ui";
import { RegisterPanel } from "@/components/learn/attendance/RegisterPanel";
import { SetWorkPanel } from "@/components/learn/class/SetWorkPanel";
import { MarkingPanel } from "@/components/learn/classwork/MarkingPanel";

type Lesson = { id: string; classId: string; className: string; start: string; end: string; live: boolean; registerTaken: boolean };
type Counts = { toMark: number; unread: number };

const hhmm = (t: string) => t.slice(0, 5);

/** The top of the teacher's Today (owner, 11 Nov 2026): a compact row of quick actions, then
 * today's lessons with Join and register status. What is waiting for the teacher (registers
 * not taken, work to mark, pupil records to read, documents to sign) is in Waiting for you,
 * once, below this. */
export function TeachNow({ slots, classIds }: { slots: (TimetableSlot & { classes?: { name: string } | null })[] | null; classIds: string[] }) {
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // What is open in a panel over Today (owner, 11 Nov 2026: actions open in place).
  const [panel, setPanel] = useState<{ kind: "register"; lesson: Lesson } | { kind: "setWork" } | { kind: "mark" } | { kind: "behaviour" } | null>(null);

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
      const [slotLessons, ownLessons, unreadRes, queueRes] = await Promise.all([
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
        supabase.from("homework_review_queue").select("submission_id", { count: "exact", head: true }),
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
      setCounts({
        toMark: queueRes.count || 0,
        unread: ((unreadRes.data as { unread: number }[] | null) || []).reduce((n, r) => n + r.unread, 0),
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
  const firstDue = (lessons || []).find((l) => !l.registerTaken && now >= hhmm(l.start)) || null;
  // Quick actions open over Today; only things that are whole pages of their own go to them.
  const actions: QuickAction[] = [
    firstDue
      ? { label: "Take register", hint: `${firstDue.className}, ${hhmm(firstDue.start)}`, icon: "userCheck", alert: true, onSelect: () => setPanel({ kind: "register", lesson: firstDue }) }
      : { label: "Take register", hint: "Today's registers", icon: "userCheck", href: "/teach/today" },
    { label: "Set work", hint: "For one of your classes", icon: "notebookPen", onSelect: () => setPanel({ kind: "setWork" }) },
    { label: "Mark work", hint: counts ? (counts.toMark ? `${counts.toMark} waiting` : "Nothing waiting") : "…", alert: !!counts?.toMark, icon: "clipboardCheck", onSelect: () => setPanel({ kind: "mark" }) },
    { label: "Log behaviour", hint: "Praise or a concern", icon: "heartHandshake", onSelect: () => setPanel({ kind: "behaviour" }) },
    { label: "Message", hint: counts?.unread ? `${counts.unread} unread` : "A family or colleague", alert: !!counts?.unread, icon: "messageSquare", href: "/teach/messages?compose=1" },
    { label: "Qur'an", hint: "Recitation and mistakes", icon: "bookMarked", href: "/teach/quran" },
    { label: "Enter results", hint: "Gradebook", icon: "award", href: "/teach/assessment" },
    { label: "Pupil absences", hint: "Who is away", icon: "calendarX", href: "/teach/absences" },
  ];

  return (
    <div className="space-y-6">
      <QuickActions actions={actions} guide="teach-quick-actions" />

        <section data-guide="teach-your-day" aria-labelledby="today-heading">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 id="today-heading" className="t-section">
              Your day
            </h2>
            <Link href="/teach/today" className="text-sm font-medium text-forest-700 hover:underline">
              All registers
            </Link>
          </div>
          {lessons === null ? (
            <div className="h-16 motion-safe:animate-pulse rounded-lg bg-cream" />
          ) : lessons.length === 0 ? (
            <p className="rounded-2xl border border-gold-light bg-white px-4 py-5 text-sm text-ink-500">No lessons today.</p>
          ) : (
            <ul className="divide-y divide-gold-light overflow-hidden rounded-2xl border border-gold-light bg-white" aria-label="Your day">
              {lessons.map((l) => {
                const done = now > hhmm(l.end);
                const due = !l.registerTaken && now >= hhmm(l.start);
                const isNext = !done && l.id === lessons.find((x) => now <= hhmm(x.end))?.id;
                return (
                  <li key={l.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${isNext ? "bg-forest-50/60" : ""}`}>
                    <div className="w-[5.5rem] shrink-0 tabular-nums">
                      <p className="text-sm font-semibold text-ink">{hhmm(l.start)}</p>
                      {/* An end time that isn't after the start (bad timetable data) is left out rather than shown as "08:00 to 08:00". */}
                      {hhmm(l.end) > hhmm(l.start) && <p className="t-meta">to {hhmm(l.end)}</p>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/teach/class?id=${l.classId}`} className="block truncate font-semibold text-ink hover:text-forest-700" title={l.className}>
                        {l.className}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem]">
                        {isNext && <span className="font-medium text-forest-700">{l.live ? "Live now" : now >= hhmm(l.start) ? "On now" : "Next"}</span>}
                        {l.registerTaken ? <Status kind="completed">Register taken</Status> : due ? <Status kind="overdue">Register not taken</Status> : done ? null : <Status kind="pending">Later</Status>}
                      </div>
                    </div>
                    <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                      {(due || l.registerTaken) && (
                        <button type="button" onClick={() => setPanel({ kind: "register", lesson: l })} className={btnFor(due ? "primary" : "secondary")} data-guide={due ? "teach-take-register" : undefined}>
                          {l.registerTaken ? "Register" : "Take register"}
                        </button>
                      )}
                      {!done && (
                        <button type="button" onClick={() => join(l.id)} disabled={busy === l.id} className={btnFor(due ? "secondary" : "primary")}>
                          {busy === l.id ? "Starting…" : "Start on Teams"}
                        </button>
                      )}
                      <Link href={`/teach/lessons/view?id=${l.id}`} aria-label={`Lesson page: ${l.className}`} className={btnFor("ghost")}>
                        <Icon name="chevronRight" size="sm" />
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {message && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{message}</p>}
        </section>

      {panel?.kind === "register" && (
        <RegisterPanel
          lessonId={panel.lesson.id}
          classId={panel.lesson.classId}
          className={panel.lesson.className}
          when={hhmm(panel.lesson.end) > hhmm(panel.lesson.start) ? `${hhmm(panel.lesson.start)} to ${hhmm(panel.lesson.end)}` : hhmm(panel.lesson.start)}
          lessonHref={`/teach/lessons/view?id=${panel.lesson.id}`}
          onClose={() => setPanel(null)}
          onProgress={(taken, total) => {
            const id = panel.lesson.id;
            if (total > 0 && taken >= total) setLessons((ls) => (ls ? ls.map((x) => (x.id === id ? { ...x, registerTaken: true } : x)) : ls));
          }}
        />
      )}
      {panel?.kind === "behaviour" && <BehaviourDialog classIds={classIds} onClose={() => setPanel(null)} />}
      {panel?.kind === "setWork" && <SetWorkPanel scope="mine" onClose={() => setPanel(null)} />}
      {panel?.kind === "mark" && (
        <MarkingPanel
          onClose={() => setPanel(null)}
          onCount={(n) => setCounts((c) => (c ? { ...c, toMark: n } : c))}
        />
      )}
    </div>
  );
}

const btnFor = (v: "primary" | "secondary" | "ghost") => (v === "primary" ? ui.btnPrimary : v === "secondary" ? ui.btnSecondary : ui.btnGhost);
