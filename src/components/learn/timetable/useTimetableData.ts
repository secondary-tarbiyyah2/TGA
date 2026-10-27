"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PERIOD_COLUMNS, PERIOD_COLUMNS_WITH_SUPERVISOR, attachSupervisorNames, normalisePeriods, type TimetablePeriod } from "@/lib/learn/timetable";
import type { CstRow } from "@/lib/learn/teacherFor";
import type { Availability, ClassOpt, ClassTeacherLink, Protected, Run, SessionOpt, SubjectOpt, Teacher, TermOpt, YearOpt } from "./types";

export type ProtectedRow = Protected & { id: string };
export type AvailabilityRow = Availability & { id: string };

export type TimetableData = {
  loaded: boolean;
  runs: Run[];
  years: YearOpt[];
  terms: TermOpt[];
  classes: ClassOpt[];
  subjects: SubjectOpt[];
  sessions: SessionOpt[];
  teachers: Teacher[];
  classTeachers: ClassTeacherLink[];
  subjectTeachers: CstRow[];
  availability: AvailabilityRow[];
  protectedTimes: ProtectedRow[];
  /** Every stored school-day period (all kinds, active or not); [] until migration 0066 is applied. */
  periods: TimetablePeriod[];
};

const EMPTY: TimetableData = { loaded: false, runs: [], years: [], terms: [], classes: [], subjects: [], sessions: [], teachers: [], classTeachers: [], subjectTeachers: [], availability: [], protectedTimes: [], periods: [] };

/** One load of everything the timetable pages share. */
/** `reload` resolves with the fresh data (or null when offline), so callers can act on it straight away. */
export function useTimetableData(): { data: TimetableData; reload: () => Promise<TimetableData | null> } {
  const [data, setData] = useState<TimetableData>(EMPTY);

  const reload = useCallback(async (): Promise<TimetableData | null> => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const [rn, ay, tm, cl, sj, vs, tr, ct, av, pt, st, pd] = await Promise.all([
      supabase.from("timetable_runs").select("id, label, status, academic_year_id, created_at, solver_stats").order("created_at", { ascending: false }),
      supabase.from("academic_years").select("id, label, starts_on, ends_on").order("starts_on", { ascending: false }),
      supabase.from("terms").select("id, name, academic_year_id").order("starts_on"),
      supabase.from("classes").select("id, name, subject_id, academic_year_id, weekly_lessons, year_group").order("name"),
      supabase.from("subjects").select("id, name").order("name"),
      supabase.from("virtual_sessions").select("id, name, meeting_url, capacity").order("name"),
      supabase.from("profiles").select("id, full_name, user_roles!inner(role)").in("user_roles.role", ["teacher", "teaching_assistant_cover"]),
      supabase.from("user_roles").select("user_id, scope_id").in("role", ["teacher", "teaching_assistant_cover"]).eq("scope_type", "class"),
      supabase.from("teacher_availability").select("id, teacher_user_id, academic_year_id, weekday, start_time, end_time"),
      supabase.from("protected_times").select("id, name, academic_year_id, weekday, start_time, end_time"),
      supabase.from("class_subject_teachers").select("id, class_id, subject_id, teacher_id, valid_from, valid_to, lessons_per_week, notes, created_at"),
      supabase.from("timetable_periods").select(PERIOD_COLUMNS_WITH_SUPERVISOR),
    ]);
    // supervisor_user_id needs migration 0069; fall back to the older columns until it is applied.
    // year_group drives lesson length (Years 1-2 30 min, 3-6 45, 7-11 50); retry without it if the column is missing.
    const classRes = cl.error ? await supabase.from("classes").select("id, name, subject_id, academic_year_id, weekly_lessons").order("name") : cl;
    const periodRes = pd.error ? await supabase.from("timetable_periods").select(PERIOD_COLUMNS) : pd;
    const periods = periodRes.error ? [] : await attachSupervisorNames(normalisePeriods(periodRes.data as unknown as Parameters<typeof normalisePeriods>[0]));
    const seen = new Set<string>();
    const teachers: Teacher[] = [];
    for (const r of (tr.data as unknown as { id: string; full_name: string | null }[]) || []) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      teachers.push({ id: r.id, full_name: r.full_name || "Unnamed" });
    }
    teachers.sort((a, b) => a.full_name.localeCompare(b.full_name));
    const next: TimetableData = {
      loaded: true,
      runs: (rn.data as Run[]) || [],
      years: (ay.data as YearOpt[]) || [],
      terms: (tm.data as TermOpt[]) || [],
      classes: (classRes.data as ClassOpt[]) || [],
      subjects: (sj.data as SubjectOpt[]) || [],
      sessions: (vs.data as SessionOpt[]) || [],
      teachers,
      classTeachers: (ct.data as ClassTeacherLink[]) || [],
      subjectTeachers: (st.data as CstRow[]) || [],
      availability: (av.data as AvailabilityRow[]) || [],
      protectedTimes: (pt.data as ProtectedRow[]) || [],
      periods,
    };
    setData(next);
    return next;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    reload();
  }, [reload]);

  return { data, reload };
}
