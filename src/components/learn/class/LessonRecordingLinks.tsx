"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { safeHttpUrl } from "@/lib/learn/markup";

/** The exact wording the teacher agrees to; stored with the link (who and when are stamped by the database). */
export const RECORDING_CONSENT_TEXT =
  "I confirm this recording shows only me (the teacher) and my shared screen. No pupil appears on camera or is heard, unless consent for that pupil is already recorded with the school.";

type LinkRow = {
  id: string;
  lesson_instance_id: string;
  url: string;
  note: string | null;
  acknowledged_at: string;
  created_at: string;
  profiles?: { full_name: string | null } | null;
};

/** "Watch recording": a plain external link that opens in a new tab. */
export function RecordingChip({ url, label = "Watch recording" }: { url: string; label?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-teal-700/30 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100"
    >
      {label}
    </a>
  );
}

/** Recording links for every lesson of one class (RLS decides who sees any). */
export function useRecordingLinks(classId: string): { byLesson: Map<string, string>; latest: { url: string } | null } {
  const [rows, setRows] = useState<{ lessonId: string; url: string }[]>([]);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !classId) return;
    let alive = true;
    supabase
      .from("lesson_recording_links")
      .select("lesson_instance_id, url, created_at, lesson_instances!inner(timetable_slots!inner(class_id))")
      .eq("lesson_instances.timetable_slots.class_id", classId)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (!alive) return;
        setRows(((data as unknown as { lesson_instance_id: string; url: string }[]) || []).map((r) => ({ lessonId: r.lesson_instance_id, url: r.url })));
      });
    return () => {
      alive = false;
    };
  }, [classId]);
  const byLesson = new Map<string, string>();
  for (const r of rows) if (!byLesson.has(r.lessonId)) byLesson.set(r.lessonId, r.url);
  return { byLesson, latest: rows[0] ? { url: rows[0].url } : null };
}

/**
 * Recordings for one lesson. Everyone allowed to see the lesson sees the
 * "Watch recording" link(s). The class teacher (and head/admin) can add one
 * after ticking the safeguarding confirmation, and remove it again.
 */
export function LessonRecordingPanel({ lessonInstanceId, canManage }: { lessonInstanceId: string; canManage: boolean }) {
  const [rows, setRows] = useState<LinkRow[] | null>(null);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase
      .from("lesson_recording_links")
      .select("id, lesson_instance_id, url, note, acknowledged_at, created_at, profiles:acknowledged_by(full_name)")
      .eq("lesson_instance_id", lessonInstanceId)
      .order("created_at", { ascending: false });
    setRows((data as unknown as LinkRow[]) || []);
  }, [lessonInstanceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  const add = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const clean = safeHttpUrl(url);
    if (!clean || !clean.startsWith("https://")) return setError("Paste the full https:// link to the recording.");
    if (!agreed) return setError("Please tick the confirmation first.");
    setBusy(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return setError("You are signed out.");
      const { error: err } = await supabase.from("lesson_recording_links").insert({
        lesson_instance_id: lessonInstanceId,
        url: clean,
        note: note.trim() || null,
        consent_acknowledged: true,
        consent_text: RECORDING_CONSENT_TEXT,
        acknowledged_by: user.id,
      });
      if (err) return setError("Could not save the link. Check you teach this class and try again.");
      setUrl("");
      setNote("");
      setAgreed(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!window.confirm("Remove this recording link? Pupils will no longer see it.")) return;
    await supabase.from("lesson_recording_links").delete().eq("id", id);
    await load();
  };

  if (rows === null) return null;
  if (!canManage && rows.length === 0) return null;
  return (
    <div className="mt-4 border-t border-gold-light/60 pt-4">
      <h3 className="text-sm font-semibold text-ink">Lesson recording link</h3>
      {rows.length === 0 && <p className="mt-1 text-sm text-ink/65">No recording has been added for this lesson.</p>}
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-cream/60 px-3 py-2">
            <div className="min-w-0">
              <RecordingChip url={r.url} />
              {r.note && <span className="ml-2 text-sm text-ink/70">{r.note}</span>}
              {canManage && (
                <p className="mt-1 text-xs text-ink/65">
                  Confirmed by {r.profiles?.full_name || "staff"} on {new Date(r.acknowledged_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
            {canManage && (
              <button type="button" onClick={() => remove(r.id)} className="text-xs font-medium text-red-700 hover:underline">
                Remove link
              </button>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <div className="mt-3 space-y-3 rounded-xl border border-gold-light/70 p-4">
          <p className="text-sm text-ink/75">
            How it works: start the recording yourself in Microsoft Teams (as the teacher, sharing your screen), then paste the link to the saved recording here. The video stays in Teams, Stream, SharePoint or Drive. Pupils and families of this class then see a Watch recording link.
          </p>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… link to the recording" aria-label="Recording link" className="w-full rounded-lg border border-gold-light/70 px-3 py-2 text-sm" />
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Optional note, e.g. Part 1 of 2" aria-label="Note" className="w-full rounded-lg border border-gold-light/70 px-3 py-2 text-sm" />
          <label className="flex items-start gap-2 text-sm text-ink/85">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
            <span>{RECORDING_CONSENT_TEXT}</span>
          </label>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          <button type="button" onClick={add} disabled={busy || !agreed || !url.trim()} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-medium text-white hover:bg-gold-900 disabled:opacity-50">
            {busy ? "Saving…" : "Save recording link"}
          </button>
        </div>
      )}
    </div>
  );
}
