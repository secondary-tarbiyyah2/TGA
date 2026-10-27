import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ukDaysAgo } from "@/lib/learn/ukTime";

export type NoteStatus = "undecided" | "authorised" | "unauthorised";
export type AbsenceKind = "authorised" | "unauthorised" | "unexplained";

export type AbsenceNote = {
  id: string;
  child_id: string;
  childName: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: NoteStatus;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
};

export type Absence = {
  id: string;
  childId: string;
  childName: string;
  date: string;
  classId: string;
  className: string;
  kind: AbsenceKind;
  /** Staff-recorded reason code for this child and day, if any. */
  reasonCode?: string;
};

export const STATUS_LABEL: Record<NoteStatus, string> = {
  undecided: "Awaiting a decision",
  authorised: "Authorised",
  unauthorised: "Not authorised",
};

/** The UK date `n` days ago: the school runs on UK time whatever the browser's zone. */
export function dateKeyDaysAgo(n: number): string {
  return ukDaysAgo(n);
}

export function formatDay(key: string): string {
  const d = new Date(`${key}T12:00:00`);
  return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDayShort(key: string): string {
  const d = new Date(`${key}T12:00:00`);
  return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function formatRange(from: string, to: string): string {
  return from === to ? formatDay(from) : `${formatDayShort(from)} to ${formatDay(to)}`;
}

type NoteRaw = {
  id: string;
  child_id: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: NoteStatus;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  children?: { name: string } | null;
};

type AttRaw = {
  id: string;
  status: "absent" | "excused";
  child_id: string;
  children?: { name: string } | null;
  lesson_instances?: {
    date: string;
    timetable_slots?: { class_id: string; classes?: { name: string } | null } | null;
  } | null;
};

const PAGE_SIZE = 1000;
const MAX_ROWS = 10000;

export async function fetchNotes(): Promise<{ notes: AbsenceNote[]; error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { notes: [], error: "Not connected." };
  const { data, error } = await supabase
    .from("absence_notes")
    .select("id, child_id, from_date, to_date, reason, status, decision_note, decided_at, created_at, children(name)")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return { notes: [], error: error.message };
  const notes = ((data as unknown as NoteRaw[]) || []).map((n) => ({
    id: n.id,
    child_id: n.child_id,
    childName: n.children?.name || "Unknown student",
    from_date: n.from_date,
    to_date: n.to_date,
    reason: n.reason,
    status: n.status,
    decision_note: n.decision_note,
    decided_at: n.decided_at,
    created_at: n.created_at,
  }));
  return { notes, error: null };
}

/** Authorised wins over not authorised; undecided/no note is unexplained. */
export function classify(childId: string, date: string, attendance: "absent" | "excused", notes: AbsenceNote[]): AbsenceKind {
  if (attendance === "excused") return "authorised";
  let sawNo = false;
  for (const n of notes) {
    if (n.child_id !== childId || date < n.from_date || date > n.to_date) continue;
    if (n.status === "authorised") return "authorised";
    if (n.status === "unauthorised") sawNo = true;
  }
  return sawNo ? "unauthorised" : "unexplained";
}

/** Recorded reasons that count as an authorised / unauthorised explanation. */
const REASON_KIND: Record<string, AbsenceKind> = {
  illness: "authorised",
  medical_appointment: "authorised",
  family_emergency: "authorised",
  religious_observance: "authorised",
  holiday: "unauthorised",
};

export async function fetchAbsences(from: string, to: string, notes: AbsenceNote[], reasons: Record<string, string> = {}): Promise<{ absences: Absence[]; error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { absences: [], error: "Not connected." };
  const out: AttRaw[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("attendance_records")
      .select("id, status, child_id, children(name), lesson_instances!inner(date, timetable_slots(class_id, classes(name)))")
      .in("status", ["absent", "excused"])
      .gte("lesson_instances.date", from)
      .lte("lesson_instances.date", to)
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return { absences: [], error: error.message };
    const page = (data as unknown as AttRaw[]) || [];
    out.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  const absences: Absence[] = out.map((r) => {
    const date = r.lesson_instances?.date || "";
    let kind = classify(r.child_id, date, r.status, notes);
    const reasonCode = reasons[`${r.child_id}|${date}`];
    if (kind === "unexplained" && reasonCode && REASON_KIND[reasonCode]) kind = REASON_KIND[reasonCode];
    return {
      id: r.id,
      childId: r.child_id,
      childName: r.children?.name || "Unknown student",
      date,
      classId: r.lesson_instances?.timetable_slots?.class_id || "",
      className: r.lesson_instances?.timetable_slots?.classes?.name || "Unknown class",
      kind,
      reasonCode,
    };
  });
  absences.sort((a, b) => b.date.localeCompare(a.date) || a.childName.localeCompare(b.childName));
  return { absences, error: null };
}

/** Notes plus the absences in [from, to], re-run on demand. */
export function useAbsenceData(from: string, to: string) {
  const [notes, setNotes] = useState<AbsenceNote[] | null>(null);
  const [absences, setAbsences] = useState<Absence[] | null>(null);
  const [reasonMap, setReasonMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // No range means "not wanted" (e.g. the dashboard for a role that can't read absences).
    if (!from || !to) return;
    let cancelled = false;
    (async () => {
      setError(null);
      const n = await fetchNotes();
      if (cancelled) return;
      setNotes(n.notes);
      const rs = await fetchReasons(from, to);
      if (cancelled) return;
      const a = await fetchAbsences(from, to, n.notes, rs.map);
      if (cancelled) return;
      setAbsences(a.absences);
      setReasonMap(rs.map);
      setError(n.error || rs.error || a.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { notes, absences, reasonMap, error, reload };
}

/** Staff-recorded reasons keyed by "childId|date" (RLS scopes teachers to their classes). */
export async function fetchReasons(from: string, to: string): Promise<{ map: Record<string, string>; error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { map: {}, error: null };
  const { data, error } = await supabase.from("absence_reasons").select("child_id, absence_date, reason_code").gte("absence_date", from).lte("absence_date", to).limit(5000);
  const map: Record<string, string> = {};
  for (const r of ((data as unknown as { child_id: string; absence_date: string; reason_code: string }[]) || [])) map[`${r.child_id}|${r.absence_date}`] = r.reason_code;
  return { map, error: error ? error.message : null };
}

export const REASONS: { value: string; label: string }[] = [
  { value: "illness", label: "Illness" },
  { value: "medical_appointment", label: "Medical appointment" },
  { value: "family_emergency", label: "Family emergency" },
  { value: "religious_observance", label: "Religious observance" },
  { value: "holiday", label: "Holiday" },
  { value: "unknown", label: "Unknown / no contact" },
  { value: "other", label: "Other" },
];
export const reasonLabel = (code?: string | null) => REASONS.find((r) => r.value === code)?.label || "";

/** Save (or replace) the reason for a child's absence on a day. */
export async function saveReason(childId: string, date: string, code: string, note: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return "Not connected.";
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { error } = await supabase
    .from("absence_reasons")
    .upsert({ child_id: childId, absence_date: date, reason_code: code, note: note.trim() || null, recorded_by: userId, recorded_at: new Date().toISOString() }, { onConflict: "child_id,absence_date" });
  return error ? error.message : null;
}
