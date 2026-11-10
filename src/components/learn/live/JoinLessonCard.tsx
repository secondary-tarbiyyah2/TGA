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
    classes?: { name: string; meeting_url?: string | null } | null;
    subjects?: { name: string } | null;
  } | null;
};

/**
 * A meeting link as typed by staff, made safe to open: trimmed, "https://"
 * added when it was pasted without a scheme (a bare "meet.google.com/abc"
 * would otherwise open as a path on our own site), and anything that is not
 * http(s) refused. Returns null when there is nothing usable.
 */
export function normaliseMeetingUrl(raw: string | null | undefined): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// Self-check, run once in development builds: fails loudly if the normaliser regresses.
if (process.env.NODE_ENV === "development") {
  const cases: [string | null, string | null][] = [
    ["https://meet.google.com/abc-defg-hij", "https://meet.google.com/abc-defg-hij"],
    [" meet.google.com/abc-defg-hij ", "https://meet.google.com/abc-defg-hij"],
    ["javascript:alert(1)", null],
    ["", null],
    [null, null],
  ];
  for (const [input, want] of cases) {
    if (normaliseMeetingUrl(input) !== want) console.error("normaliseMeetingUrl self-check failed for", input);
  }
}

/** Opens `url` in a new tab straight away, or a holding tab when it is not known yet. */
function openMeetingWindow(url: string | null): Window | null {
  try {
    const w = window.open(url || "", "_blank");
    if (!w) {
      // Popup blocked: just navigate this tab if we have somewhere to go.
      if (url) window.location.href = url;
      return null;
    }
    w.opener = null;
    if (!url) {
      w.document.title = "Joining your lesson…";
      w.document.body.innerHTML = '<p style="font-family:system-ui,sans-serif;padding:2rem;color:#3a3f45">Joining your lesson…</p>';
    }
    return w;
  } catch {
    if (url) window.location.href = url;
    return null;
  }
}

/** Fire-and-forget attendance log (the RPC never raises; any failure is swallowed). */
function logJoin(lessonInstanceId: string, childId: string | null): void {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    Promise.resolve(supabase.rpc("log_lesson_join", { p_lesson_instance_id: lessonInstanceId, p_child_id: childId })).then(
      () => undefined,
      () => undefined,
    );
  } catch {
    /* logging must never get in the way of joining */
  }
}

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
        .select("id, date, timetable_slots!inner(class_id, start_time, end_time, virtual_sessions(meeting_url), classes(name, meeting_url), subjects(name))")
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
              // The class's own Teams link (Class settings) is the usual source; a
              // timetable session link, where one is set, overrides it.
              meetingUrl: s.virtual_sessions?.meeting_url || s.classes?.meeting_url || null,
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
    setMessage(null);
    const known = normaliseMeetingUrl(lesson.meetingUrl);
    // Open the meeting DURING the click (browsers block a window opened after
    // an await). With a known link we go straight there; otherwise we open a
    // holding tab and point it at the link the lesson-join function returns.
    const popup = openMeetingWindow(known);
    // Log the join for the register in the background. It can never block,
    // delay or show an error: the meeting is already opening.
    logJoin(lesson.id, kid ? kid.id : null);
    if (known) return;

    setBusy(`${lesson.id}:${kid?.id ?? "me"}`);
    try {
      const result = await callEdgeFunction("lesson-join", { lesson_instance_id: lesson.id });
      const url = normaliseMeetingUrl(typeof result.joinUrl === "string" ? result.joinUrl : null);
      if (!result.ok || !url) {
        popup?.close();
        setMessage(`Could not join: ${edgeErrorMessage(result)}`);
        return;
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
                  {l.className ? ` · ${l.className}` : ""}
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
                      className="rounded-xl bg-gold-700 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-gold-900 disabled:opacity-60"
                    >
                      {busy === `${l.id}:${k.id}` ? "Joining…" : l.kids.length > 1 ? `Join lesson · ${k.name}` : "Join lesson"}
                    </button>
                  ))
                ) : (
                  <button
                    type="button"
                    onClick={() => join(l, who.kind === "student" ? l.kids[0] ?? null : null)}
                    disabled={busy !== null || (who.kind === "student" && l.kids.length === 0)}
                    className="rounded-xl bg-gold-700 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-gold-900 disabled:opacity-60"
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
