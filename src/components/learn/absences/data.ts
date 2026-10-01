import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { localDateKey } from "@/lib/learn/calendar";

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
};

export const STATUS_LABEL: Record<NoteStatus, string> = {
  undecided: "Awaiting a decision",
  authorised: "Authorised",
  unauthorised: "Not authorised",
};

export function dateKeyDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateKey(d);
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

export async function fetchAbsences(from: string, to: string, notes: AbsenceNote[]): Promise<{ absences: Absence[]; error: string | null }> {
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
    return {
      id: r.id,
      childId: r.child_id,
      childName: r.children?.name || "Unknown student",
      date,
      classId: r.lesson_instances?.timetable_slots?.class_id || "",
      className: r.lesson_instances?.timetable_slots?.classes?.name || "Unknown class",
      kind: classify(r.child_id, date, r.status, notes),
    };
  });
  absences.sort((a, b) => b.date.localeCompare(a.date) || a.childName.localeCompare(b.childName));
  return { absences, error: null };
}

/** Notes plus the absences in [from, to], re-run on demand. */
export function useAbsenceData(from: string, to: string) {
  const [notes, setNotes] = useState<AbsenceNote[] | null>(null);
  const [absences, setAbsences] = useState<Absence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      const n = await fetchNotes();
      if (cancelled) return;
      setNotes(n.notes);
      const a = await fetchAbsences(from, to, n.notes);
      if (cancelled) return;
      setAbsences(a.absences);
      setError(n.error || a.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { notes, absences, error, reload };
}
