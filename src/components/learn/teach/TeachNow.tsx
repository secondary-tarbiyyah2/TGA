"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { localDateKey } from "@/lib/learn/calendar";
import type { TimetableSlot } from "@/lib/learn/timetable";

type Lesson = { id: string; classId: string; className: string; start: string; end: string; live: boolean; registerTaken: boolean };
type Counts = { toMark: number; unread: number; toSign: number };

const hhmm = (t: string) => t.slice(0, 5);

/** "What needs doing now": today's lessons with Join, plus one row of
 * counts (registers, homework to mark, unread messages, documents to
 * sign). Every query is small and scoped; the slots come from the
 * dashboard so they aren't fetched twice. */
export function TeachNow({ slots }: { slots: (TimetableSlot & { classes?: { name: string } | null })[] | null }) {
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || slots === null) return;
    let cancelled = false;
    (async () => {
      const bySlot = new Map(slots.map((s) => [s.id, s]));
      const today = localDateKey(new Date());
      const [lessonRes, unreadRes, signRes, hwRes] = await Promise.all([
        slots.length
          ? supabase.from("lesson_instances").select("id, bbb_status, timetable_slot_id").eq("date", today).in("timetable_slot_id", [...bySlot.keys()])
          : Promise.resolve({ data: [] }),
        supabase.rpc("thread_unread_counts"),
        supabase.from("my_outstanding_signatures").select("document_id", { count: "exact", head: true }),
        supabase
          .from("homework")
          .select("id")
          .gte("due_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
          .lte("due_at", new Date().toISOString())
          .order("due_at", { ascending: false })
          .limit(40),
      ]);
      const lessonRows = (lessonRes.data as { id: string; bbb_status: string; timetable_slot_id: string }[] | null) || [];
      const ids = lessonRows.map((l) => l.id);
      const hwIds = ((hwRes.data as { id: string }[] | null) || []).map((h) => h.id);

      // Second round: registers taken today, and submissions waiting for a mark.
      const [attRes, subRes] = await Promise.all([
        ids.length ? supabase.from("attendance_records").select("lesson_instance_id").in("lesson_instance_id", ids) : Promise.resolve({ data: [] }),
        hwIds.length ? supabase.from("homework_submissions").select("id").in("homework_id", hwIds).limit(300) : Promise.resolve({ data: [] }),
      ]);
      const subIds = ((subRes.data as { id: string }[] | null) || []).map((s) => s.id);
      const markRes = subIds.length ? await supabase.from("homework_marks").select("submission_id").in("submission_id", subIds) : { data: [] };
      if (cancelled) return;

      const taken = new Set(((attRes.data as { lesson_instance_id: string }[] | null) || []).map((a) => a.lesson_instance_id));
      const marked = new Set(((markRes.data as { submission_id: string }[] | null) || []).map((m) => m.submission_id));
      setLessons(
        lessonRows
          .map((l) => {
            const s = bySlot.get(l.timetable_slot_id)!;
            return { id: l.id, classId: s.class_id, className: s.classes?.name || "Class", start: s.start_time, end: s.end_time, live: l.bbb_status === "live", registerTaken: taken.has(l.id) };
          })
          .sort((a, b) => a.start.localeCompare(b.start)),
      );
      setCounts({
        toMark: subIds.filter((id) => !marked.has(id)).length,
        unread: ((unreadRes.data as { unread: number }[] | null) || []).reduce((n, r) => n + r.unread, 0),
        toSign: signRes.count || 0,
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
  const chips: { label: string; n: number; href: string }[] = counts
    ? [
        { label: "registers to take", n: missingRegisters, href: "/teach/today" },
        { label: "homework to mark", n: counts.toMark, href: "/teach/homework" },
        { label: "unread messages", n: counts.unread, href: "/teach/messages" },
        { label: "documents to sign", n: counts.toSign, href: "/documents" },
      ]
    : [];

  return (
    <section className="rounded-2xl border border-gold-light bg-white">
      <div className="flex items-center justify-between px-5 pt-4">
        <h1 className="font-serif text-h3 font-semibold text-ink">Today</h1>
        <Link href="/teach/today" className="text-sm font-medium text-teal-700 hover:underline">
          Registers
        </Link>
      </div>

      <div className="px-5 py-3">
        {lessons === null ? (
          <div className="h-16 animate-pulse rounded-lg bg-cream" />
        ) : lessons.length === 0 ? (
          <p className="text-sm text-ink/60">No lessons today.</p>
        ) : (
          <ul className="divide-y divide-gold-light">
            {lessons.map((l) => {
              const done = now > hhmm(l.end);
              return (
                <li key={l.id} className="flex items-center gap-3 py-2">
                  <span className="w-24 shrink-0 text-sm tabular-nums text-ink/60">
                    {hhmm(l.start)}–{hhmm(l.end)}
                  </span>
                  <Link href={`/teach/lessons/view?id=${l.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold text-ink hover:text-teal-700">
                    {l.className}
                  </Link>
                  {l.live && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Live</span>}
                  {!l.registerTaken && now >= hhmm(l.start) && <span className="hidden rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 sm:inline">Register due</span>}
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

      <div className="flex flex-wrap gap-2 border-t border-gold-light px-5 py-3">
        {counts === null ? (
          <div className="h-7 w-full animate-pulse rounded-lg bg-cream" />
        ) : (
          chips.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className={`rounded-full px-3 py-1 text-sm ${c.n > 0 ? "bg-amber-50 font-semibold text-amber-900 hover:bg-amber-100" : "bg-cream text-ink/55 hover:text-ink"}`}
            >
              {c.n} {c.label}
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
