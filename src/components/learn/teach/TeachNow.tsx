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
import { Icon } from "@/components/learn/Icon";
import { Status, ui } from "@/components/learn/ui";
import { RegisterPanel } from "@/components/learn/attendance/RegisterPanel";
import { SetWorkPanel } from "@/components/learn/class/SetWorkPanel";
import { MarkingPanel } from "@/components/learn/classwork/MarkingPanel";

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
  // What is open in a panel over Today (owner, 11 Nov 2026: actions open in place).
  const [panel, setPanel] = useState<{ kind: "register"; lesson: Lesson } | { kind: "setWork" } | { kind: "mark" } | null>(null);
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
  const firstDue = (lessons || []).find((l) => !l.registerTaken && now >= hhmm(l.start)) || null;
  // Quick actions open over Today; only things that are whole pages of their own go to them.
  const actions: { label: string; hint: string; icon: IconName; onSelect?: () => void; href?: string }[] = [
    firstDue
      ? { label: "Take a register", hint: `${firstDue.className}, ${hhmm(firstDue.start)}`, icon: "userCheck", onSelect: () => setPanel({ kind: "register", lesson: firstDue }) }
      : { label: "Take a register", hint: "Today's registers", icon: "userCheck", href: "/teach/today" },
    { label: "Set work", hint: "For one of your classes", icon: "notebookPen", onSelect: () => setPanel({ kind: "setWork" }) },
    { label: "Mark work", hint: counts?.toMark ? `${counts.toMark} waiting` : "Nothing waiting", icon: "clipboardCheck", onSelect: () => setPanel({ kind: "mark" }) },
    { label: "Enter results", hint: "Assessments and grades", icon: "chartColumnIncreasing", href: "/teach/assessment" },
    { label: "Send a message", hint: "To a family or colleague", icon: "messageSquare", href: "/teach/messages?compose=1" },
    { label: "My classes", hint: "Classwork, registers and grades", icon: "layoutGrid", href: "/teach/classes" },
  ];

  return (
    <div className="space-y-6">
      <StatStrip>
        {stats.map((st) => (
          <StatTile key={st.label} value={st.n === null ? "…" : st.n} label={st.label} hint={st.note} href={st.href} tone={st.urgent ? "warn" : "neutral"} />
        ))}
      </StatStrip>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_17rem]">
        <section aria-labelledby="today-heading">
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
            <p className="rounded-[10px] border border-gold-light bg-white px-4 py-5 text-sm text-ink-500">No lessons today.</p>
          ) : (
            <ul data-guide="teach-your-day" className="divide-y divide-gold-light overflow-hidden rounded-[10px] border border-gold-light bg-white" aria-label="Your day">
              {lessons.map((l) => {
                const done = now > hhmm(l.end);
                const due = !l.registerTaken && now >= hhmm(l.start);
                const isNext = !done && l.id === lessons.find((x) => now <= hhmm(x.end))?.id;
                return (
                  <li key={l.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${isNext ? "bg-forest-50/60" : ""}`}>
                    <div className="w-[5.5rem] shrink-0 tabular-nums">
                      <p className="text-sm font-semibold text-ink">{hhmm(l.start)}</p>
                      <p className="t-meta">to {hhmm(l.end)}</p>
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
          {/* Documents to sign already have the banner above and their own list below, so only unread messages are flagged here. */}
          {counts && counts.unread > 0 && (
            <p className="mt-3 text-sm">
              <Link href="/teach/messages" className="font-medium text-forest-700 hover:underline">
                {counts.unread} unread message{counts.unread === 1 ? "" : "s"}
              </Link>
            </p>
          )}
        </section>

        <nav data-guide="teach-quick-actions" aria-label="Quick actions">
          <h2 className="t-section mb-2">Quick actions</h2>
          <ul className="grid gap-px overflow-hidden rounded-[10px] border border-gold-light bg-gold-light sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-1 [&>li]:bg-white">
            {actions.map((a) => {
              const inner = (
                <>
                  <span className="portal-nav-icon" aria-hidden="true">
                    <Icon name={a.icon} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{a.label}</span>
                    <span className="block truncate text-xs text-ink-500">{a.hint}</span>
                  </span>
                  <Icon name={a.href ? "chevronRight" : "plus"} className="h-4 w-4 shrink-0 text-ink-500" />
                </>
              );
              const cls = "flex w-full min-h-12 items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-[var(--portal-hover)]";
              return (
                <li key={a.label}>
                  {a.href ? (
                    <Link href={a.href} className={cls}>
                      {inner}
                    </Link>
                  ) : (
                    <button type="button" onClick={a.onSelect} className={cls}>
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {panel?.kind === "register" && (
        <RegisterPanel
          lessonId={panel.lesson.id}
          classId={panel.lesson.classId}
          className={panel.lesson.className}
          when={`${hhmm(panel.lesson.start)} to ${hhmm(panel.lesson.end)}`}
          lessonHref={`/teach/lessons/view?id=${panel.lesson.id}`}
          onClose={() => setPanel(null)}
          onProgress={(taken, total) => {
            const id = panel.lesson.id;
            if (total > 0 && taken >= total) setLessons((ls) => (ls ? ls.map((x) => (x.id === id ? { ...x, registerTaken: true } : x)) : ls));
          }}
        />
      )}
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
