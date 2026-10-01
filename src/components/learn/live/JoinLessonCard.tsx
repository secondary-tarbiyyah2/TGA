"use client";

import { useEffect, useState } from "react";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { localDateKey } from "@/lib/learn/calendar";
import { getSupabaseClient } from "@/lib/supabase/client";

/** Who is looking: a teacher, a student (own account) or a parent (one or all of their children). */
export type JoinWho = { kind: "teacher" } | { kind: "student"; childId?: string } | { kind: "parent"; childId?: string };

type Kid = { id: string; name: string };
type Lesson = { id: string; classId: string; subject: string; className: string; start: string; end: string; meetingUrl: string | null; kids: Kid[] };

type LessonRowRaw = {
  id: string;
  date: string;
  timetable_slots: {
    class_id: string;
    start_time: string;
    end_time: string;
    virtual_sessions?: { meeting_url: string | null } | null;
    classes?: { name: string } | null;
    subjects?: { name: string } | null;
  } | null;
};

/** The button appears this long before the lesson starts. */
export const JOIN_LEAD_MINUTES = 10;

const hhmm = (t: string): string => t.slice(0, 5);
const minutesOf = (t: string): number => {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
};

/** True from JOIN_LEAD_MINUTES before `start` until `end` (all "HH:MM", same day). */
export function joinWindowOpen(nowMinutes: number, start: string, end: string): boolean {
  return nowMinutes >= minutesOf(start) - JOIN_LEAD_MINUTES && nowMinutes < minutesOf(end);
}

/**
 * A prominent one-click "Join lesson" card. It appears 10 minutes before a
 * lesson that is happening today and stays until the lesson ends. Pressing
 * it opens the slot's virtual session link (or the lesson's own join link)
 * and logs a lesson_joins row, which the teacher's register then uses to
 * pre-fill attendance. Nothing is recorded of the lesson itself.
 *
 * `classId` narrows it to one class (the class page). Renders nothing when
 * there is no lesson to join right now.
 */
export function JoinLessonCard({ who, classId, className = "" }: { who: JoinWho; classId?: string; className?: string }) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const whoKind = who.kind;
  const whoChildId = who.kind === "teacher" ? undefined : who.childId;

  // Re-evaluate the window every 30 seconds so the card appears and goes away by itself.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !alive) return;
      setUserId(user.id);

      // Which children this person joins for, and which classes they are in.
      const kidsByClass = new Map<string, Kid[]>();
      if (whoKind !== "teacher") {
        let kids: Kid[] = [];
        if (whoKind === "student") {
          const acc = whoChildId
            ? { data: { child_id: whoChildId } as { child_id: string } | null }
            : await supabase.from("student_accounts").select("child_id").eq("profile_id", user.id).maybeSingle();
          const cid = (acc.data as unknown as { child_id: string } | null)?.child_id;
          if (cid) kids = [{ id: cid, name: "me" }];
        } else {
          const { data } = await supabase.from("children").select("id, name").order("name");
          kids = ((data as unknown as Kid[] | null) || []).filter((k) => !whoChildId || k.id === whoChildId);
        }
        if (kids.length === 0) {
          if (alive) setLessons([]);
          return;
        }
        const { data: enr } = await supabase
          .from("enrolments")
          .select("class_id, child_id")
          .in(
            "child_id",
            kids.map((k) => k.id),
          );
        for (const e of (enr as unknown as { class_id: string; child_id: string }[] | null) || []) {
          const kid = kids.find((k) => k.id === e.child_id);
          if (!kid) continue;
          kidsByClass.set(e.class_id, [...(kidsByClass.get(e.class_id) || []), kid]);
        }
        if (kidsByClass.size === 0) {
          if (alive) setLessons([]);
          return;
        }
      }

      let query = supabase
        .from("lesson_instances")
        .select("id, date, timetable_slots!inner(class_id, start_time, end_time, virtual_sessions(meeting_url), classes(name), subjects(name))")
        .eq("date", localDateKey(new Date()));
      if (whoKind === "teacher") query = query.eq("teacher_user_id", user.id);
      else query = query.in("timetable_slots.class_id", Array.from(kidsByClass.keys()));
      if (classId) query = query.eq("timetable_slots.class_id", classId);
      const { data } = await query;
      if (!alive) return;
      const rows = (data as unknown as LessonRowRaw[] | null) || [];
      setLessons(
        rows
          .filter((r) => r.timetable_slots)
          .map((r): Lesson => {
            const s = r.timetable_slots!;
            return {
              id: r.id,
              classId: s.class_id,
              subject: s.subjects?.name || "Lesson",
              className: s.classes?.name || "",
              start: hhmm(s.start_time),
              end: hhmm(s.end_time),
              meetingUrl: s.virtual_sessions?.meeting_url || null,
              kids: kidsByClass.get(s.class_id) || [],
            };
          })
          .sort((a, b) => a.start.localeCompare(b.start)),
      );
    })();
    return () => {
      alive = false;
    };
  }, [whoKind, whoChildId, classId]);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const open = lessons.filter((l) => joinWindowOpen(nowMinutes, l.start, l.end));
  if (open.length === 0 && !message) return null;

  const join = async (lesson: Lesson, kid: Kid | null) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    // Open the tab during the click; Safari/Firefox block it after an await.
    const popup = window.open("", "_blank");
    if (popup) {
      popup.opener = null;
      popup.document.title = "Joining your lesson…";
      popup.document.body.innerHTML = '<p style="font-family:system-ui,sans-serif;padding:2rem;color:#3a3f45">Joining your lesson…</p>';
    }
    const key = `${lesson.id}:${kid?.id ?? "me"}`;
    setBusy(key);
    setMessage(null);
    try {
      let url = lesson.meetingUrl;
      if (!url) {
        const result = await callEdgeFunction("lesson-join", { lesson_instance_id: lesson.id });
        url = typeof result.joinUrl === "string" ? result.joinUrl : null;
        if (!result.ok || !url) {
          popup?.close();
          setMessage(`Could not join: ${edgeErrorMessage(result)}`);
          return;
        }
      }
      // Log the join (the register uses it). A logging problem never stops anyone joining.
      if (userId) {
        await supabase.from("lesson_joins").insert({ lesson_instance_id: lesson.id, user_id: userId, child_id: kid ? kid.id : null, role: kid ? "child" : "teacher" });
      }
      if (popup) popup.location.href = url;
      else window.location.href = url;
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label="Live lesson" className={`space-y-3 ${className}`}>
      {open.map((l) => {
        const started = nowMinutes >= minutesOf(l.start);
        const asParent = who.kind === "parent";
        return (
          <div key={l.id} className="rounded-2xl border-2 border-teal-600 bg-teal-50 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-teal-800">{started ? "Lesson in progress" : `Starts at ${l.start}`}</p>
                <h2 className="mt-1 font-serif text-h2 font-semibold text-ink">
                  {l.subject}
                  {l.className ? ` — ${l.className}` : ""}
                </h2>
                <p className="mt-0.5 text-sm text-ink/70">
                  {l.start}–{l.end}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {asParent ? (
                  l.kids.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => join(l, k)}
                      disabled={busy !== null}
                      className="rounded-xl bg-teal-700 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-teal-900 disabled:opacity-60"
                    >
                      {busy === `${l.id}:${k.id}` ? "Joining…" : l.kids.length > 1 ? `Join lesson — ${k.name}` : "Join lesson"}
                    </button>
                  ))
                ) : (
                  <button
                    type="button"
                    onClick={() => join(l, who.kind === "student" ? l.kids[0] ?? null : null)}
                    disabled={busy !== null || (who.kind === "student" && l.kids.length === 0)}
                    className="rounded-xl bg-teal-700 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-teal-900 disabled:opacity-60"
                  >
                    {busy === `${l.id}:${who.kind === "student" ? l.kids[0]?.id ?? "me" : "me"}` ? "Joining…" : "Join lesson"}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {message && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {message}
        </p>
      )}
    </section>
  );
}
