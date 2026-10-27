"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { CstRow } from "@/lib/learn/teacherFor";
import type { AcademicYear, Child, ClassRow, ClassTeacher, Enrolment, Subject, Teacher, Term, YearGroup } from "./shared";

export type AcademicData = {
  loaded: boolean;
  years: AcademicYear[];
  terms: Term[];
  yearGroups: YearGroup[];
  subjects: Subject[];
  classes: ClassRow[];
  children: Child[];
  enrolments: Enrolment[];
  teachers: Teacher[];
  classTeachers: ClassTeacher[];
  subjectTeachers: CstRow[];
};

const EMPTY: AcademicData = { loaded: false, years: [], terms: [], yearGroups: [], subjects: [], classes: [], children: [], enrolments: [], teachers: [], classTeachers: [], subjectTeachers: [] };

/** One load for the whole page; every section calls reload() after a write. */
export function useAcademicData(): { data: AcademicData; reload: () => Promise<void> } {
  const [data, setData] = useState<AcademicData>(EMPTY);

  const reload = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const [ay, tm, yg, sj, cl, ch, en, tr, ct, st] = await Promise.all([
      supabase.from("academic_years").select("id, label, starts_on, ends_on, is_test").order("starts_on", { ascending: false }),
      supabase.from("terms").select("id, name, starts_on, ends_on, academic_year_id, sanity_document_id").order("starts_on"),
      supabase.from("year_groups").select("id, name, sort_order, capacity").order("sort_order"),
      supabase.from("subjects").select("id, name, code, is_core").order("name"),
      supabase.from("classes").select("id, name, year_group_id, subject_id, weekly_lessons, lesson_length_minutes, academic_year_id, meeting_url").order("name"),
      supabase.from("children").select("id, name, year_group_id").order("name"),
      supabase.from("enrolments").select("id, class_id, child_id"),
      supabase.from("profiles").select("id, full_name, user_roles!inner(role)").in("user_roles.role", ["teacher", "teaching_assistant_cover"]),
      supabase.from("user_roles").select("id, user_id, scope_id").in("role", ["teacher", "teaching_assistant_cover"]).eq("scope_type", "class"),
      supabase.from("class_subject_teachers").select("id, class_id, subject_id, teacher_id, valid_from, valid_to, lessons_per_week, notes, created_at"),
    ]);
    const teacherRows = (tr.data as unknown as { id: string; full_name: string | null }[]) || [];
    const seen = new Set<string>();
    const teachers: Teacher[] = [];
    for (const r of teacherRows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      teachers.push({ id: r.id, full_name: r.full_name || "Unnamed" });
    }
    teachers.sort((a, b) => a.full_name.localeCompare(b.full_name));
    setData({
      loaded: true,
      years: (ay.data as AcademicYear[]) || [],
      terms: (tm.data as Term[]) || [],
      yearGroups: (yg.data as YearGroup[]) || [],
      subjects: (sj.data as Subject[]) || [],
      classes: (cl.data as ClassRow[]) || [],
      children: (ch.data as Child[]) || [],
      enrolments: (en.data as Enrolment[]) || [],
      teachers,
      classTeachers: (ct.data as ClassTeacher[]) || [],
      subjectTeachers: (st.data as CstRow[]) || [],
    });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    reload();
  }, [reload]);

  return { data, reload };
}
