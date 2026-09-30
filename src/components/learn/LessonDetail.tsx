"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient, getEdgeFunctionUrl } from "@/lib/supabase/client";

type Resource = { label: string; url: string };
type LessonInstance = {
  id: string;
  date: string;
  objectives: string | null;
  resources: Resource[];
  bbb_status: "not_started" | "live" | "ended";
  recording_enabled: boolean;
  recording_paused: boolean;
  timetable_slots?: {
    class_id: string;
    start_time: string;
    end_time: string;
    classes?: { name: string; subjects?: { name: string } | null } | null;
  } | null;
};
type Recording = { id: string; status: string; duration_seconds: number | null; recorded_at: string | null };
type Child = { id: string; name: string };

async function callFunction<T = Record<string, unknown>>(name: string, body: Record<string, unknown>): Promise<T & { ok: boolean; error?: string; detail?: string }> {
  const supabase = getSupabaseClient();
  const url = getEdgeFunctionUrl(name);
  if (!supabase || !url) return { ok: false, error: "not_configured" } as T & { ok: boolean; error?: string };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

function timeLabel(t: string) {
  return t.slice(0, 5);
}

export type LessonVariant = "teacher" | "parent" | "student" | "admin";

export function LessonDetail({ lessonInstanceId, variant, childId }: { lessonInstanceId: string; variant: LessonVariant; childId?: string }) {
  const supabase = getSupabaseClient();
  const [lesson, setLesson] = useState<LessonInstance | null | undefined>(undefined);
  const [message, setMessage] = useState<string | null>(null);
  const [objectivesDraft, setObjectivesDraft] = useState("");
  const [resourcesDraft, setResourcesDraft] = useState<Resource[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [enrolledChildren, setEnrolledChildren] = useState<Child[]>([]);
  const [attendance, setAttendance] = useState<Record<string, "present" | "absent" | "late">>({});
  const [consentGiven, setConsentGiven] = useState<boolean | null>(null);
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceNoticeSent, setAbsenceNoticeSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("lesson_instances")
      .select("id, date, objectives, resources, bbb_status, recording_enabled, recording_paused, timetable_slots(class_id, start_time, end_time, classes(name, subjects(name)))")
      .eq("id", lessonInstanceId)
      .maybeSingle();
    const row = (data as unknown as LessonInstance) || null;
    setLesson(row);
    setObjectivesDraft(row?.objectives || "");
    setResourcesDraft(row?.resources || []);

    const { data: recs } = await supabase
      .from("lesson_recordings")
      .select("id, status, duration_seconds, recorded_at")
      .eq("lesson_instance_id", lessonInstanceId);
    setRecordings((recs as Recording[]) || []);

    if (variant === "teacher" && row?.timetable_slots?.class_id) {
      const { data: enrolments } = await supabase
        .from("enrolments")
        .select("child_id, children(id, name)")
        .eq("class_id", row.timetable_slots.class_id);
      const children = (enrolments || [])
        .map((e) => e.children as unknown as Child | null)
        .filter((c): c is Child => Boolean(c));
      setEnrolledChildren(children);

      const { data: att } = await supabase.from("attendance_records").select("child_id, status").eq("lesson_instance_id", lessonInstanceId);
      const map: Record<string, "present" | "absent" | "late"> = {};
      for (const a of att || []) map[a.child_id] = a.status;
      setAttendance(map);
    }

    if ((variant === "parent" || variant === "student") && childId) {
      const { data: consent } = await supabase.from("recording_consents").select("given").eq("child_id", childId).maybeSingle();
      setConsentGiven(consent?.given ?? null);
      const { data: notice } = await supabase.from("absence_notices").select("id").eq("child_id", childId).eq("lesson_instance_id", lessonInstanceId).maybeSingle();
      setAbsenceNoticeSent(Boolean(notice));
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, lessonInstanceId]);

  if (lesson === undefined) return <p className="text-sm text-ink/60">Loading…</p>;
  if (lesson === null) return <p className="text-sm text-ink/60">Lesson not found, or you don&apos;t have access to it.</p>;

  const slot = lesson.timetable_slots;
  const title = `${slot?.classes?.subjects?.name || "Lesson"} — ${slot?.classes?.name || ""}`;

  const join = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await callFunction<{ joinUrl?: string; role?: string }>("lesson-join", { lesson_instance_id: lessonInstanceId });
      if (!result.ok || !result.joinUrl) {
        setMessage(`Could not join: ${result.detail || result.error}`);
        return;
      }
      window.open(result.joinUrl, "_blank", "noopener,noreferrer");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const toggleRecording = async (action: "pause" | "resume") => {
    setBusy(true);
    try {
      const result = await callFunction("recording-control", { lesson_instance_id: lessonInstanceId, action });
      if (!result.ok) setMessage(`Could not ${action} recording: ${result.detail || result.error}`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const saveDetails = async () => {
    setBusy(true);
    try {
      const result = await callFunction("lesson-update-details", {
        lesson_instance_id: lessonInstanceId,
        objectives: objectivesDraft,
        resources: resourcesDraft.filter((r) => r.url.trim()),
      });
      setMessage(result.ok ? "Saved." : `Could not save: ${result.detail || result.error}`);
      if (result.ok) await load();
    } finally {
      setBusy(false);
    }
  };

  const markAttendance = async (childIdToMark: string, status: "present" | "absent" | "late") => {
    if (!supabase) return;
    setAttendance((prev) => ({ ...prev, [childIdToMark]: status }));
    await supabase.from("attendance_records").upsert(
      { lesson_instance_id: lessonInstanceId, child_id: childIdToMark, status, marked_by: (await supabase.auth.getUser()).data.user?.id },
      { onConflict: "lesson_instance_id,child_id" }
    );
  };

  const watchRecording = async (recordingId: string, mode: "stream" | "export") => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await callFunction<{ url?: string }>("recording-access", { recording_id: recordingId, mode });
      if (!result.ok || !result.url) {
        setMessage(
          result.error === "forbidden_or_consent_required"
            ? "Consent hasn't been given for this recording yet — give consent below to view it."
            : `Could not open recording: ${result.detail || result.error}`
        );
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  };

  const setConsent = async (given: boolean) => {
    if (!supabase || !childId) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("recording_consents").upsert({ child_id: childId, given, given_by: user?.id }, { onConflict: "child_id" });
      setConsentGiven(given);
    } finally {
      setBusy(false);
    }
  };

  const submitAbsenceNotice = async () => {
    if (!supabase || !childId || !absenceReason.trim()) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("absence_notices").insert({
        child_id: childId,
        lesson_instance_id: lessonInstanceId,
        reason: absenceReason.trim(),
        submitted_by: user?.id,
      });
      if (!error) {
        setAbsenceNoticeSent(true);
        setAbsenceReason("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-h2 font-semibold text-ink">{title}</h1>
            <p className="mt-1 text-sm text-ink/60">
              {lesson.date} · {slot ? `${timeLabel(slot.start_time)}–${timeLabel(slot.end_time)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={join} className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900 disabled:opacity-50">
              {variant === "teacher" ? "Start / join as teacher" : "Join lesson"}
            </button>
            {variant === "teacher" && (
              <span className="text-xs text-ink/50">Once in, use the call&apos;s own toolbar to split the class into breakout rooms.</span>
            )}
            {variant === "teacher" && lesson.bbb_status === "live" && lesson.recording_enabled && (
              <button
                type="button"
                disabled={busy}
                onClick={() => toggleRecording(lesson.recording_paused ? "resume" : "pause")}
                className="rounded-full border border-gold-500 px-4 py-2 text-xs text-gold-700 disabled:opacity-50"
              >
                {lesson.recording_paused ? "Resume recording" : "Pause recording"}
              </button>
            )}
          </div>
        </div>
        {message && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{message}</p>}
        <p className="mt-3 text-xs text-ink/50">
          Waiting room is on — students and parents wait for the teacher to admit them. In-meeting chat is whole-class only (no
          private 1:1 chat).
        </p>
      </div>

      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-h3 font-semibold text-ink">Objectives</h2>
        {variant === "teacher" ? (
          <>
            <textarea
              value={objectivesDraft}
              onChange={(e) => setObjectivesDraft(e.target.value)}
              rows={3}
              className="mt-2 w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
              placeholder="What will this lesson cover?"
            />
            <h3 className="mt-4 text-sm font-medium text-ink">Resources</h3>
            <div className="mt-2 space-y-2">
              {resourcesDraft.map((r, i) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <input
                    value={r.label}
                    onChange={(e) => setResourcesDraft((prev) => prev.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))}
                    placeholder="Label"
                    className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
                  />
                  <input
                    value={r.url}
                    onChange={(e) => setResourcesDraft((prev) => prev.map((x, idx) => (idx === i ? { ...x, url: e.target.value } : x)))}
                    placeholder="https://…"
                    className="flex-1 rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
                  />
                  <button type="button" onClick={() => setResourcesDraft((prev) => prev.filter((_, idx) => idx !== i))} className="text-xs text-ink/50 hover:text-ink">
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setResourcesDraft((prev) => [...prev, { label: "", url: "" }])}
                className="rounded-full border border-gold-light/60 px-3 py-1.5 text-xs text-ink/70 hover:bg-cream"
              >
                + Add resource link
              </button>
            </div>
            <button type="button" disabled={busy} onClick={saveDetails} className="mt-4 rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900 disabled:opacity-50">
              Save
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink/70">{lesson.objectives || "No objectives set yet."}</p>
            {lesson.resources.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {lesson.resources.map((r, i) => (
                  <li key={i}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-gold-700 underline">
                      {r.label || r.url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {variant === "teacher" && (
        <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
          <h2 className="font-serif text-h3 font-semibold text-ink">Register</h2>
          {enrolledChildren.length === 0 && <p className="mt-2 text-sm text-ink/60">No enrolled students found for this class.</p>}
          <ul className="mt-3 space-y-2">
            {enrolledChildren.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-gold-light/30 p-3 text-sm">
                <span className="font-medium text-ink">{c.name}</span>
                <div className="flex gap-1">
                  {(["present", "late", "absent"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => markAttendance(c.id, s)}
                      className={`rounded-full px-3 py-1 text-xs ${
                        attendance[c.id] === s ? "bg-gold-500 text-ink-900" : "border border-gold-light/60 text-ink/60 hover:bg-cream"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-h3 font-semibold text-ink">Recording</h2>
        {recordings.length === 0 && <p className="mt-2 text-sm text-ink/60">No recording available for this lesson.</p>}
        {recordings.map((r) => (
          <div key={r.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold-light/30 p-3 text-sm">
            <span className="text-ink/70">
              {r.status === "available" ? "Ready to view" : r.status === "processing" ? "Processing…" : "Deleted"}
              {r.duration_seconds ? ` · ${Math.round(r.duration_seconds / 60)} min` : ""}
            </span>
            {r.status === "available" && (
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => watchRecording(r.id, "stream")} className="rounded-full border border-gold-500 px-3 py-1.5 text-xs text-gold-700">
                  Watch (streaming only)
                </button>
                {variant === "admin" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => watchRecording(r.id, "export")}
                    className="rounded-full border border-red-300 px-3 py-1.5 text-xs text-red-700"
                    title="Requires Head Teacher/Admin with Can export data — every use is logged"
                  >
                    Export raw file (logged)
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {(variant === "parent" || variant === "student") && childId && (
          <div className="mt-4 border-t border-gold-light/30 pt-4">
            <p className="text-sm font-medium text-ink">Recording consent</p>
            <p className="mt-1 text-xs text-ink/60">
              Recordings of lessons are only visible to enrolled families once a parent has given consent. This is a whole-child
              setting, not per-lesson.
            </p>
            {variant === "parent" ? (
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConsent(true)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${consentGiven === true ? "bg-gold-500 text-ink-900" : "border border-gold-500 text-gold-700"}`}
                >
                  Consent given
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConsent(false)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${consentGiven === false ? "bg-gold-500 text-ink-900" : "border border-gold-500 text-gold-700"}`}
                >
                  Consent withheld
                </button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-ink/60">Current status: {consentGiven === null ? "not set by parent" : consentGiven ? "given" : "withheld"}</p>
            )}
          </div>
        )}
      </div>

      {variant === "parent" && childId && (
        <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
          <h2 className="font-serif text-h3 font-semibold text-ink">Report an absence</h2>
          {absenceNoticeSent ? (
            <p className="mt-2 text-sm text-ink/60">An absence notice has already been submitted for this lesson — thank you.</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-ink/60">Let the teacher know in advance so this isn&apos;t flagged as unexplained.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  value={absenceReason}
                  onChange={(e) => setAbsenceReason(e.target.value)}
                  placeholder="Reason (e.g. medical appointment)"
                  className="flex-1 rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
                />
                <button type="button" disabled={busy || !absenceReason.trim()} onClick={submitAbsenceNotice} className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900 disabled:opacity-50">
                  Submit
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
