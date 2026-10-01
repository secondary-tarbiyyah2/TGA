"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Register } from "@/components/learn/attendance/Register";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { getSupabaseClient } from "@/lib/supabase/client";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { classBannerStyle } from "@/lib/learn/classes";
import { localDateKey } from "@/lib/learn/calendar";

type TodayLesson = {
  id: string;
  date: string;
  bbb_status: string;
  objectives: string | null;
  slot: { start_time: string; end_time: string; class_id: string; className: string };
};

function useTodayLessons() {
  const [lessons, setLessons] = useState<TodayLesson[] | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return setLessons([]);
      const { data: slots } = await supabase
        .from("timetable_slots")
        .select("id, class_id, start_time, end_time, classes(name), timetable_runs!inner(status)")
        .eq("teacher_user_id", user.id)
        .eq("timetable_runs.status", "published");
      const published = ((slots as unknown as { id: string; class_id: string; start_time: string; end_time: string; classes?: { name: string } | null; timetable_runs?: { status: string } | null }[]) || []).filter(
        (s) => s.timetable_runs?.status === "published",
      );
      if (published.length === 0) return setLessons([]);
      const { data } = await supabase
        .from("lesson_instances")
        .select("id, date, bbb_status, objectives, timetable_slot_id")
        .in(
          "timetable_slot_id",
          published.map((s) => s.id),
        )
        .eq("date", localDateKey(new Date()));
      const bySlot = new Map(published.map((s) => [s.id, s]));
      const rows = ((data as { id: string; date: string; bbb_status: string; objectives: string | null; timetable_slot_id: string }[]) || [])
        .map((l) => {
          const s = bySlot.get(l.timetable_slot_id)!;
          return { ...l, slot: { start_time: s.start_time, end_time: s.end_time, class_id: s.class_id, className: s.classes?.name || "Class" } };
        })
        .sort((a, b) => a.slot.start_time.localeCompare(b.slot.start_time));
      setLessons(rows);
    })();
  }, []);
  return lessons;
}

function LessonCard({ lesson }: { lesson: TodayLesson }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const now = new Date().toTimeString().slice(0, 5);
  const state = lesson.bbb_status === "live" ? "live" : now > lesson.slot.end_time.slice(0, 5) ? "done" : now >= lesson.slot.start_time.slice(0, 5) ? "now" : "later";

  const join = async () => {
    const popup = window.open("", "_blank");
    if (popup) {
      popup.opener = null;
      popup.document.title = "Starting your lesson…";
      popup.document.body.innerHTML = '<p style="font-family:system-ui,sans-serif;padding:2rem;color:#3a3f45">Starting your lesson…</p>';
    }
    setBusy(true);
    setMessage(null);
    const result = await callEdgeFunction("lesson-join", { lesson_instance_id: lesson.id });
    setBusy(false);
    const url = typeof result.joinUrl === "string" ? result.joinUrl : null;
    if (result.ok && url) {
      if (popup) popup.location.href = url;
      else window.location.href = url;
    } else {
      popup?.close();
      setMessage(edgeErrorMessage(result));
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-gold-light bg-white">
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <span className="h-12 w-12 shrink-0 rounded-xl" style={classBannerStyle(lesson.slot.class_id)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink/60">
            {lesson.slot.start_time.slice(0, 5)}–{lesson.slot.end_time.slice(0, 5)}
            {state === "live" && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Live</span>}
            {state === "now" && <span className="ml-2 rounded-full bg-teal-700 px-2 py-0.5 text-xs font-semibold text-white">Now</span>}
            {state === "done" && <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-xs font-semibold text-ink/60">Finished</span>}
          </p>
          <Link href={`/teach/class?id=${lesson.slot.class_id}`} className="block truncate text-lg font-semibold text-ink hover:text-teal-700">
            {lesson.slot.className}
          </Link>
          {lesson.objectives && <p className="truncate text-sm text-ink/60">{lesson.objectives}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/teach/lessons/view?id=${lesson.id}`} className="rounded-lg border border-gold-light bg-white px-3 py-2 text-sm font-medium text-ink/80 hover:bg-cream">
            Lesson page
          </Link>
          {state !== "done" && (
            <button type="button" onClick={join} disabled={busy} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60">
              {busy ? "Starting…" : "Join"}
            </button>
          )}
        </div>
      </div>
      {message && <p className="border-t border-gold-light/70 bg-red-50 px-5 py-2 text-sm text-red-800">{message}</p>}
      <div className="border-t border-gold-light">
        <Register lessonId={lesson.id} classId={lesson.slot.class_id} />
      </div>
    </section>
  );
}

function TodayContent() {
  const lessons = useTodayLessons();
  const dateLabel = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return (
    <>
      <PageHeader title="Today" subtitle={`${dateLabel}: your lessons, with the register underneath each one.`} />
      {lessons === null ? (
        <div className="h-48 animate-pulse rounded-2xl bg-white" />
      ) : lessons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center">
          <p className="text-base font-semibold text-ink">No lessons today</p>
          <p className="mt-1 text-sm text-ink/60">
            Your week is on the <Link href="/teach/calendar" className="text-teal-700 underline">calendar</Link>.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {lessons.map((l) => (
            <LessonCard key={l.id} lesson={l} />
          ))}
        </div>
      )}
    </>
  );
}

export default function TeachTodayPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <TodayContent />
      </LearnGate>
    </section>
  );
}
