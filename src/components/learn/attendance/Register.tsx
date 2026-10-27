"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { REASONS, saveReason } from "@/components/learn/absences/data";
import { useLearnSession } from "@/lib/learn/session";
import { ukTimeOf } from "@/lib/learn/ukTime";

export type Status = "present" | "late" | "absent" | "excused" | "not_engaged" | "technical";
/** The four marks used every lesson, as one-tap buttons. */
export const STATUSES: { value: Status; label: string; on: string }[] = [
  { value: "present", label: "Present", on: "bg-green-600 text-white" },
  { value: "late", label: "Late", on: "bg-amber-500 text-white" },
  { value: "absent", label: "Absent", on: "bg-red-600 text-white" },
  { value: "excused", label: "Excused", on: "bg-slate-500 text-white" },
];
/** The two less common marks from the Attendance Policy, under "Other". */
export const OTHER_STATUSES: { value: Status; label: string; hint: string }[] = [
  { value: "not_engaged", label: "Present, not engaged", hint: "Logged in but no camera or response after a check. Counts as present; the form tutor sees it." },
  { value: "technical", label: "Couldn't connect", hint: "Tried but couldn't connect. Recorded separately; it doesn't count against attendance." },
];
export const STATUS_LABEL: Record<Status, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
  not_engaged: "Present, not engaged",
  technical: "Couldn't connect",
};

type TeamsHint = { child_id: string; first_join_at: string | null; total_seconds: number; matched_by: string };
const TEAMS_MATCH_LABEL: Record<string, string> = {
  pupil_account: "the pupil's portal email",
  microsoft_email: "the pupil's Microsoft 365 account",
  parent_account: "the parent's email (they may have joined for the pupil)",
};

/** One-click register: everyone shows as Present until you change them;
 * every tap saves straight away. "Mark everyone else present" saves the
 * untouched rows in one go. */
export function Register({ lessonId, classId, onProgress }: { lessonId: string; classId: string; onProgress?: (taken: number, total: number) => void }) {
  const { roles } = useLearnSession();
  // Recording absence reasons is the office's job (0098); teachers see them.
  const canRecordReason = roles.some((r) => r.role === "head_teacher" || r.role === "admin");
  const [children, setChildren] = useState<{ id: string; name: string }[] | null>(null);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const marksRef = useRef<Record<string, Status>>({});
  const totalRef = useRef(0);
  // Enrolled pupils only: a mark left over for a pupil who has since left
  // the class must not push "taken" above the class size.
  const enrolledRef = useRef<Set<string>>(new Set());
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [lessonDate, setLessonDate] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, "saving" | "saved" | "error">>({});
  // Who pressed "Join lesson" (lesson_joins): child id -> first join time. Used to pre-fill 'present'.
  const [joined, setJoined] = useState<Record<string, string>>({});
  const [joinsLoaded, setJoinsLoaded] = useState(false);
  // Teams attendance report (teams-sync, 0145): a hint only, never used to mark anyone.
  const [teams, setTeams] = useState<Record<string, TeamsHint>>({});

  const loadJoins = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error } = await supabase.from("lesson_joins").select("child_id, joined_at").eq("lesson_instance_id", lessonId).eq("role", "child").order("joined_at", { ascending: true });
    if (error) return setJoinsLoaded(false); // table not there yet: the register works as before
    const map: Record<string, string> = {};
    for (const j of (data as unknown as { child_id: string | null; joined_at: string }[] | null) || []) {
      if (j.child_id && !map[j.child_id]) map[j.child_id] = j.joined_at;
    }
    setJoined(map);
    setJoinsLoaded(true);
  }, [lessonId]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    supabase
      .from("lesson_teams_attendance")
      .select("child_id, first_join_at, total_seconds, matched_by")
      .eq("lesson_instance_id", lessonId)
      .then(({ data, error }) => {
        // Table missing (0145 not applied) or Teams attendance off: no hints, register unchanged.
        if (!alive || error) return;
        setTeams(Object.fromEntries(((data as TeamsHint[] | null) || []).map((t) => [t.child_id, t])));
      });
    return () => {
      alive = false;
    };
  }, [lessonId]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    (async () => {
      const { data: li } = await supabase.from("lesson_instances").select("date").eq("id", lessonId).maybeSingle();
      const date = (li as { date: string } | null)?.date || null;
      setLessonDate(date);
      const [{ data: enr }, { data: att }] = await Promise.all([
        supabase.from("enrolments").select("children(id, name)").eq("class_id", classId),
        supabase.from("attendance_records").select("child_id, status").eq("lesson_instance_id", lessonId),
      ]);
      totalRef.current = ((enr as unknown as { children: unknown }[]) || []).filter((r) => r.children).length;
      enrolledRef.current = new Set(((enr as unknown as { children: { id: string } | null }[]) || []).flatMap((r) => (r.children ? [r.children.id] : [])));
      setChildren(
        (((enr as unknown as { children: { id: string; name: string } | null }[]) || []).map((r) => r.children).filter(Boolean) as { id: string; name: string }[]).sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      if (date) {
        const { data: rs } = await supabase.from("absence_reasons").select("child_id, reason_code").eq("absence_date", date);
        setReasons(Object.fromEntries(((rs as { child_id: string; reason_code: string }[]) || []).map((r) => [r.child_id, r.reason_code])));
      }
      const m: Record<string, Status> = {};
      for (const a of (att as { child_id: string; status: Status }[]) || []) m[a.child_id] = a.status;
      setMarks(m);
      marksRef.current = m;
      const list = ((enr as unknown as { children: { id: string } | null }[]) || []).filter((r) => r.children);
      onProgress?.(list.filter((r) => r.children && m[r.children.id]).length, list.length);
      await loadJoins();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, classId]);

  const save = useCallback(
    async (entries: { childId: string; status: Status }[]) => {
      const supabase = getSupabaseClient();
      if (!supabase || entries.length === 0) return;
      // Optimistic: show the choice immediately, then confirm or flag.
      setMarks((m) => ({ ...m, ...Object.fromEntries(entries.map((e) => [e.childId, e.status])) }));
      setSaving((s) => ({ ...s, ...Object.fromEntries(entries.map((e) => [e.childId, "saving" as const])) }));
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { error } = await supabase.from("attendance_records").upsert(
        entries.map((e) => ({ lesson_instance_id: lessonId, child_id: e.childId, status: e.status, marked_by: userId, marked_at: new Date().toISOString() })),
        { onConflict: "lesson_instance_id,child_id" },
      );
      setSaving((s) => ({ ...s, ...Object.fromEntries(entries.map((e) => [e.childId, error ? ("error" as const) : ("saved" as const)])) }));
      if (error) {
        // Put back what is really saved, so the row shows as unmarked (and
        // "Mark everyone else present" picks it up again) instead of looking
        // marked when it isn't.
        setMarks((m) => {
          const back = { ...m };
          for (const e of entries) {
            if (marksRef.current[e.childId]) back[e.childId] = marksRef.current[e.childId];
            else delete back[e.childId];
          }
          return back;
        });
      } else {
        const next = { ...marksRef.current, ...Object.fromEntries(entries.map((e) => [e.childId, e.status])) };
        marksRef.current = next;
        onProgress?.(Object.keys(next).filter((id) => enrolledRef.current.has(id)).length, totalRef.current);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lessonId],
  );

  // Pre-fill 'present' for every child who joined and has no mark yet. The
  // teacher can still change any of them.
  useEffect(() => {
    if (!joinsLoaded || children === null) return;
    const entries = children.filter((c) => !marksRef.current[c.id] && joined[c.id]).map((c) => ({ childId: c.id, status: "present" as Status }));
    if (entries.length > 0) void save(entries);
  }, [joinsLoaded, joined, children, save]);

  const setReason = async (childId: string, code: string) => {
    if (!lessonDate || !code) return;
    const before = reasons[childId];
    setReasons((r) => ({ ...r, [childId]: code }));
    setReasonError(null);
    const err = await saveReason(childId, lessonDate, code, "");
    if (err) {
      setReasons((r) => {
        const back = { ...r };
        if (before) back[childId] = before;
        else delete back[childId];
        return back;
      });
      setReasonError(`Could not save the absence reason: ${err}`);
    }
  };

  if (children === null) return <p className="px-5 py-4 text-sm text-ink/65">Loading register…</p>;
  if (children.length === 0) return <p className="px-5 py-4 text-sm text-ink/65">No students enrolled in this class yet.</p>;
  const unmarked = children.filter((c) => !marks[c.id]);
  const taken = children.length - unmarked.length;
  const anyJoins = Object.keys(joined).length > 0;
  const timeOf = ukTimeOf;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gold-light/70 px-5 py-3">
        <p className="text-sm text-ink/70">
          <span className="font-semibold text-ink">
            {taken}/{children.length}
          </span>{" "}
          marked
        </p>
        <button type="button" onClick={() => void loadJoins()} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream">
          Check who has joined
        </button>
        {unmarked.length > 0 && (
          <button
            type="button"
            onClick={() => save(unmarked.map((c) => ({ childId: c.id, status: "present" })))}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gold-700"
          >
            Mark {taken === 0 ? "everyone" : "everyone else"} present
          </button>
        )}
      </div>
      {reasonError && (
        <p role="alert" className="border-b border-gold-light/70 bg-red-50 px-5 py-2 text-xs text-red-800">
          {reasonError}
        </p>
      )}
      {Object.keys(teams).length > 0 && (
        <p className="border-b border-gold-light/70 bg-indigo-50/50 px-5 py-2 text-xs text-indigo-900">
          &ldquo;Teams says&rdquo; tags come from the Microsoft Teams attendance report. They are suggestions only and are never saved as marks; pupils Teams couldn&apos;t match by email show no tag.
        </p>
      )}
      <ul className="divide-y divide-gold-light/70">
        {children.map((c) => {
          const current = marks[c.id];
          // Once anyone has joined, only children who joined are suggested as present.
          const didJoin = Boolean(joined[c.id]);
          const shown: Status | null = current || (didJoin || !anyJoins ? "present" : null);
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                {c.name}
                {didJoin ? <span className="ml-2 text-xs font-normal text-green-800">Joined {timeOf(joined[c.id])}</span> : anyJoins ? <span className="ml-2 text-xs font-normal text-amber-800">Has not joined</span> : null}
                {teams[c.id] && (
                  <span
                    className="ml-2 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-normal text-indigo-900"
                    title={`Suggestion from the Microsoft Teams attendance report, matched by ${TEAMS_MATCH_LABEL[teams[c.id].matched_by] || "email"}. It is not saved as a mark: choose the mark yourself.`}
                  >
                    Teams says {teams[c.id].first_join_at ? `joined ${timeOf(teams[c.id].first_join_at!)}, ` : ""}
                    {Math.round(teams[c.id].total_seconds / 60)} min
                  </span>
                )}
              </span>
              <span className="w-14 text-right text-xs text-ink/65" aria-live="polite">
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
                      className={`px-3 py-1.5 text-sm font-medium transition-colors ${on ? (current ? st.on : "bg-green-50 text-green-800") : "bg-white text-ink/65 hover:bg-cream"}`}
                    >
                      {st.label}
                    </button>
                  );
                })}
              </div>
              <select
                aria-label={`Other mark for ${c.name}`}
                value={current === "not_engaged" || current === "technical" ? current : ""}
                onChange={(e) => e.target.value && save([{ childId: c.id, status: e.target.value as Status }])}
                className={`rounded-lg border px-2 py-1.5 text-sm ${current === "not_engaged" ? "border-amber-500 bg-amber-50 font-medium text-amber-900" : current === "technical" ? "border-slate-500 bg-slate-100 font-medium text-slate-800" : "border-gold-light bg-white text-ink/65"}`}
              >
                <option value="">Other…</option>
                {OTHER_STATUSES.map((o) => (
                  <option key={o.value} value={o.value} title={o.hint}>
                    {o.label}
                  </option>
                ))}
              </select>
              {current === "absent" && lessonDate && !canRecordReason && (
                <p className="w-full text-xs text-ink/65">
                  Reason: {reasons[c.id] ? REASONS.find((r) => r.value === reasons[c.id])?.label || "Recorded" : "not given yet (the office follows this up)"}
                </p>
              )}
              {current === "absent" && lessonDate && canRecordReason && (
                <label className="flex w-full items-center gap-2 text-xs text-ink/65">
                  Reason
                  <select value={reasons[c.id] || ""} onChange={(e) => setReason(c.id, e.target.value)} className="rounded-lg border border-gold-light bg-white px-2 py-1 text-xs text-ink">
                    <option value="">Not recorded</option>
                    {REASONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

