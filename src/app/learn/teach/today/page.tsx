"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { getSupabaseClient } from "@/lib/supabase/client";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { classBannerStyle } from "@/lib/learn/classes";
import { localDateKey } from "@/lib/learn/calendar";

type Status = "present" | "late" | "absent" | "excused";
const STATUSES: { value: Status; label: string; on: string }[] = [
  { value: "present", label: "Present", on: "bg-green-600 text-white" },
  { value: "late", label: "Late", on: "bg-amber-500 text-white" },
  { value: "absent", label: "Absent", on: "bg-red-600 text-white" },
  { value: "excused", label: "Excused", on: "bg-slate-500 text-white" },
];

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
        .select("id, class_id, start_time, end_time, classes(name), timetable_runs(status)")
        .eq("teacher_user_id", user.id);
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

/** One-click register: everyone shows as Present until you change them;
 * every tap saves straight away. "Mark everyone else present" saves the
 * untouched rows in one go. */
function Register({ lesson }: { lesson: TodayLesson }) {
  const [children, setChildren] = useState<{ id: string; name: string }[] | null>(null);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState<Record<string, "saving" | "saved" | "error">>({});

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    (async () => {
      const [{ data: enr }, { data: att }] = await Promise.all([
        supabase.from("enrolments").select("children(id, name)").eq("class_id", lesson.slot.class_id),
        supabase.from("attendance_records").select("child_id, status").eq("lesson_instance_id", lesson.id),
      ]);
      setChildren(
        (((enr as unknown as { children: { id: string; name: string } | null }[]) || []).map((r) => r.children).filter(Boolean) as { id: string; name: string }[]).sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      const m: Record<string, Status> = {};
      for (const a of (att as { child_id: string; status: Status }[]) || []) m[a.child_id] = a.status;
      setMarks(m);
    })();
  }, [lesson.id, lesson.slot.class_id]);

  const save = useCallback(
    async (entries: { childId: string; status: Status }[]) => {
      const supabase = getSupabaseClient();
      if (!supabase || entries.length === 0) return;
      // Optimistic: show the choice immediately, then confirm or flag.
      setMarks((m) => ({ ...m, ...Object.fromEntries(entries.map((e) => [e.childId, e.status])) }));
      setSaving((s) => ({ ...s, ...Object.fromEntries(entries.map((e) => [e.childId, "saving" as const])) }));
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { error } = await supabase.from("attendance_records").upsert(
        entries.map((e) => ({ lesson_instance_id: lesson.id, child_id: e.childId, status: e.status, marked_by: userId, marked_at: new Date().toISOString() })),
        { onConflict: "lesson_instance_id,child_id" },
      );
      setSaving((s) => ({ ...s, ...Object.fromEntries(entries.map((e) => [e.childId, error ? ("error" as const) : ("saved" as const)])) }));
    },
    [lesson.id],
  );

  if (children === null) return <p className="px-5 py-4 text-sm text-ink/55">Loading register…</p>;
  if (children.length === 0) return <p className="px-5 py-4 text-sm text-ink/55">No students enrolled in this class yet.</p>;
  const unmarked = children.filter((c) => !marks[c.id]);
  const taken = children.length - unmarked.length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gold-light/70 px-5 py-3">
        <p className="text-sm text-ink/70">
          <span className="font-semibold text-ink">
            {taken}/{children.length}
          </span>{" "}
          marked
        </p>
        {unmarked.length > 0 && (
          <button
            type="button"
            onClick={() => save(unmarked.map((c) => ({ childId: c.id, status: "present" })))}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            Mark {taken === 0 ? "everyone" : "everyone else"} present
          </button>
        )}
      </div>
      <ul className="divide-y divide-gold-light/70">
        {children.map((c) => {
          const current = marks[c.id];
          const shown = current || "present";
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{c.name}</span>
              <span className="w-14 text-right text-xs text-ink/45" aria-live="polite">
                {saving[c.id] === "saving" ? "Saving…" : saving[c.id] === "error" ? <span className="text-red-700">Not saved</span> : saving[c.id] === "saved" ? "Saved" : current ? "" : "Not yet"}
              </span>
              <div role="radiogroup" aria-label={`Attendance for ${c.name}`} className="flex overflow-hidden rounded-lg border border-gold-light">
                {STATUSES.map((st) => {
                  const on = shown === st.value;
                  return (
                    <button
                      key={st.value}
                      type="button"
                      role="radio"
                      aria-checked={on && !!current}
                      onClick={() => save([{ childId: c.id, status: st.value }])}
                      className={`px-3 py-1.5 text-sm font-medium transition-colors ${on ? (current ? st.on : "bg-green-50 text-green-800") : "bg-white text-ink/60 hover:bg-cream"}`}
                    >
                      {st.label}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
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
        <Register lesson={lesson} />
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
