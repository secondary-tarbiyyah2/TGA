"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchAllClasses, fetchChildClasses, fetchTeacherClasses, type ClassSummary } from "@/lib/learn/classes";
import { localDateKey, type CalendarScope } from "@/lib/learn/calendar";

// Everything the day-detail calendar shows, fetched ONCE for a date range
// (the visible Hijri month plus a week either side) and split into days on
// the client. All queries run as the signed-in user, so RLS decides what comes
// back; nothing here is a security boundary.
//
// Data gaps (no column exists today): lesson "room" (the school is online, so
// the room is the virtual session name/link) and calendar_events (there is no
// general events table; term dates, INSET and closures come from
// useCalendarTerms and announcements stand in for school notices).

export type ItemKind = "lesson" | "homework" | "assessment" | "announcement";

export type DayItem = {
  id: string;
  kind: ItemKind;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM
  endTime: string | null;
  title: string;
  subject: string | null;
  classId: string | null;
  className: string | null;
  teacherId: string | null;
  teacherName: string | null;
  childId: string | null; // the child this copy belongs to (parent/student)
  childName: string | null;
  childIds: string[]; // staff/teacher assessments: pupils sat it
  room: string | null; // virtual session name
  joinUrl: string | null; // external meeting link, if the slot has one
  href: string | null;
  note: string | null;
};

export type Directory = {
  classes: ClassSummary[];
  children: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
  childClasses: Map<string, Set<string>>;
};

export type CalendarData = { items: DayItem[]; directory: Directory };

const AREA: Record<CalendarScope["kind"], string> = { teacher: "/teach", staff: "/admin", student: "/student", parent: "/family" };
const PAGE = 1000;
const CHUNK = 80;

function scopeKey(s: CalendarScope | null): string {
  if (!s) return "";
  if (s.kind === "student") return `s:${s.childId}`;
  if (s.kind === "parent") return `p:${s.children.map((c) => c.id).join(",")}`;
  return s.kind;
}

/** Page through a query 1000 rows at a time until it runs dry. */
async function fetchAll<T>(make: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await make(from, from + PAGE - 1);
    if (error || !data) break;
    const rows = data as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

function chunks<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

type Owner = { cls: ClassSummary; childId?: string; childName?: string };
type SlotRow = {
  id: string;
  class_id: string;
  teacher_user_id: string | null;
  start_time: string;
  end_time: string | null;
  subjects?: { name: string } | null;
  virtual_sessions?: { name: string | null; meeting_url: string | null } | null;
};

export function useCalendarData(scope: CalendarScope | null, from: string, to: string): { data: CalendarData | null; loading: boolean } {
  const [state, setState] = useState<{ key: string; data: CalendarData } | null>(null);
  const key = `${scopeKey(scope)}|${from}|${to}`;

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !scope) return;
    let cancelled = false;
    (async () => {
      const area = AREA[scope.kind];
      const owners = new Map<string, Owner[]>();
      const add = (cls: ClassSummary, childId?: string, childName?: string) => owners.set(cls.id, [...(owners.get(cls.id) || []), { cls, childId, childName }]);
      const childClasses = new Map<string, Set<string>>();
      const childNames = new Map<string, string>();
      let classList: ClassSummary[] = [];

      if (scope.kind === "teacher") {
        classList = await fetchTeacherClasses();
        classList.forEach((c) => add(c));
      } else if (scope.kind === "staff") {
        classList = await fetchAllClasses();
        classList.forEach((c) => add(c));
        // Every enrolled pupil, for the child picker and child -> classes.
        const enr = await fetchAll<{ class_id: string; child_id: string; children: { name: string } | null }>((a, b) =>
          supabase.from("enrolments").select("class_id, child_id, children(name)").order("created_at").range(a, b),
        );
        for (const e of enr) {
          childClasses.set(e.child_id, (childClasses.get(e.child_id) || new Set()).add(e.class_id));
          if (e.children?.name) childNames.set(e.child_id, e.children.name);
        }
      } else if (scope.kind === "student") {
        classList = await fetchChildClasses(scope.childId);
        classList.forEach((c) => add(c, scope.childId));
      } else {
        const seen = new Map<string, ClassSummary>();
        for (const ch of scope.children) {
          const cs = await fetchChildClasses(ch.id);
          cs.forEach((c) => {
            add(c, ch.id, ch.name);
            seen.set(c.id, c);
          });
          childClasses.set(ch.id, new Set(cs.map((c) => c.id)));
        }
        classList = [...seen.values()];
      }

      const items: DayItem[] = [];
      const blank = { endTime: null, subject: null, classId: null, className: null, teacherId: null, teacherName: null, childId: null, childName: null, childIds: [], room: null, joinUrl: null, href: null, note: null };
      const ownChildIds = scope.kind === "parent" ? scope.children.map((c) => c.id) : scope.kind === "student" ? [scope.childId] : [];

      // ── Lessons: instances in range, then their slots (chunked). ──
      const lessons = await fetchAll<{ id: string; date: string; objectives: string | null; timetable_slot_id: string }>((a, b) =>
        supabase.from("lesson_instances").select("id, date, objectives, timetable_slot_id").gte("date", from).lte("date", to).order("date").range(a, b),
      );
      const slotIds = [...new Set(lessons.map((l) => l.timetable_slot_id))];
      const slotById = new Map<string, SlotRow>();
      for (const ids of chunks(slotIds, CHUNK)) {
        let r = await supabase.from("timetable_slots").select("id, class_id, teacher_user_id, start_time, end_time, subjects(name), virtual_sessions(name, meeting_url)").in("id", ids);
        if (r.error) r = (await supabase.from("timetable_slots").select("id, class_id, teacher_user_id, start_time, end_time").in("id", ids)) as typeof r;
        ((r.data as unknown as SlotRow[]) || []).forEach((s) => slotById.set(s.id, s));
      }

      // ── Homework, assessments, announcements in range. ──
      const hw = await fetchAll<{ id: string; title: string; due_at: string; class_id: string; teacher_id: string | null }>((a, b) =>
        supabase.from("homework").select("id, title, due_at, class_id, teacher_id").gte("due_at", `${from}T00:00:00`).lte("due_at", `${to}T23:59:59`).order("due_at").range(a, b),
      );
      const assess = await fetchAll<{ id: string; class_id: string; child_id: string; title: string; date: string; entered_by: string | null }>((a, b) =>
        supabase.from("assessments").select("id, class_id, child_id, title, date, entered_by").gte("date", from).lte("date", to).order("date").range(a, b),
      );
      const ann = await fetchAll<{ id: string; scope: string; class_id: string | null; title: string; author_id: string | null; created_at: string; recalled_at: string | null }>((a, b) =>
        supabase
          .from("announcements")
          .select("id, scope, class_id, title, author_id, created_at, recalled_at")
          .gte("created_at", `${from}T00:00:00`)
          .lte("created_at", `${to}T23:59:59`)
          .order("created_at")
          .range(a, b),
      );

      // Teacher names (best effort: profiles RLS may hide them from parents).
      const teacherIds = new Set<string>();
      slotById.forEach((s) => s.teacher_user_id && teacherIds.add(s.teacher_user_id));
      hw.forEach((h) => h.teacher_id && teacherIds.add(h.teacher_id));
      assess.forEach((x) => x.entered_by && teacherIds.add(x.entered_by));
      const teacherName = new Map<string, string>();
      for (const ids of chunks([...teacherIds], CHUNK)) {
        const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        ((data as { id: string; full_name: string }[]) || []).forEach((p) => teacherName.set(p.id, p.full_name));
      }
      const tn = (id: string | null) => (id ? teacherName.get(id) || null : null);

      for (const l of lessons) {
        const slot = slotById.get(l.timetable_slot_id);
        if (!slot) continue;
        for (const o of owners.get(slot.class_id) || []) {
          items.push({
            ...blank,
            id: `l-${l.id}-${o.childId || ""}`,
            kind: "lesson",
            date: l.date,
            time: slot.start_time.slice(0, 5),
            endTime: slot.end_time ? slot.end_time.slice(0, 5) : null,
            title: o.cls.name,
            subject: slot.subjects?.name || o.cls.subject,
            classId: slot.class_id,
            className: o.cls.name,
            teacherId: slot.teacher_user_id,
            teacherName: tn(slot.teacher_user_id),
            childId: o.childId || null,
            childName: o.childName || null,
            room: slot.virtual_sessions?.name || null,
            joinUrl: slot.virtual_sessions?.meeting_url || null,
            href: `${area}/lessons/view?id=${l.id}${scope.kind === "parent" && o.childId ? `&child=${o.childId}` : ""}`,
            note: l.objectives,
          });
        }
      }

      for (const h of hw) {
        const due = new Date(h.due_at);
        for (const o of owners.get(h.class_id) || []) {
          items.push({
            ...blank,
            id: `h-${h.id}-${o.childId || ""}`,
            kind: "homework",
            date: localDateKey(due),
            time: due.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
            title: h.title,
            subject: o.cls.subject,
            classId: h.class_id,
            className: o.cls.name,
            teacherId: h.teacher_id,
            teacherName: tn(h.teacher_id),
            childId: o.childId || null,
            childName: o.childName || null,
            href: `${area}/class?id=${h.class_id}${scope.kind === "parent" && o.childId ? `&child=${o.childId}` : ""}&tab=assignments`,
          });
        }
      }

      // Assessments are one row per pupil: parents/students keep their own
      // child's rows; teachers and staff get one item per (class, title, date).
      const sittings = new Map<string, DayItem>();
      for (const x of assess) {
        const o = (owners.get(x.class_id) || [])[0];
        if (!o) continue;
        if (ownChildIds.length) {
          if (!ownChildIds.includes(x.child_id)) continue;
          const who = scope.kind === "parent" ? scope.children.find((c) => c.id === x.child_id)?.name || null : null;
          items.push({
            ...blank,
            id: `a-${x.id}`,
            kind: "assessment",
            date: x.date,
            title: x.title,
            subject: o.cls.subject,
            classId: x.class_id,
            className: o.cls.name,
            teacherId: x.entered_by,
            teacherName: tn(x.entered_by),
            childId: x.child_id,
            childName: who,
            childIds: [x.child_id],
            href: `${area}/class?id=${x.class_id}${scope.kind === "parent" ? `&child=${x.child_id}` : ""}&tab=grades`,
          });
        } else {
          const k = `${x.class_id}|${x.title}|${x.date}`;
          const ex = sittings.get(k);
          if (ex) ex.childIds.push(x.child_id);
          else
            sittings.set(k, {
              ...blank,
              id: `a-${k}`,
              kind: "assessment",
              date: x.date,
              title: x.title,
              subject: o.cls.subject,
              classId: x.class_id,
              className: o.cls.name,
              teacherId: x.entered_by,
              teacherName: tn(x.entered_by),
              childIds: [x.child_id],
              href: `${area}/class?id=${x.class_id}&tab=grades`,
            });
        }
      }
      items.push(...sittings.values());

      for (const n of ann) {
        if (n.recalled_at) continue;
        const isSchool = n.scope === "school";
        const cls = n.class_id ? (owners.get(n.class_id) || [])[0] : undefined;
        if (!isSchool && !cls) continue;
        const t = new Date(n.created_at);
        items.push({
          ...blank,
          id: `n-${n.id}`,
          kind: "announcement",
          date: localDateKey(t),
          time: t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
          title: n.title,
          classId: cls?.cls.id || null,
          className: cls?.cls.name || (isSchool ? "Whole school" : null),
          teacherId: n.author_id,
          href: `${area}/announcements`,
        });
      }

      items.sort((x, y) => x.date.localeCompare(y.date) || (x.time || "99:99").localeCompare(y.time || "99:99") || x.title.localeCompare(y.title));

      const directory: Directory = {
        classes: classList,
        children:
          scope.kind === "parent"
            ? scope.children
            : scope.kind === "staff"
              ? [...childNames.entries()].map(([id, name]) => ({ id, name })).sort((p, q) => p.name.localeCompare(q.name))
              : [],
        teachers: [...teacherName.entries()].map(([id, name]) => ({ id, name })).sort((p, q) => p.name.localeCompare(q.name)),
        childClasses,
      };
      if (!cancelled) setState({ key, data: { items, directory } });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on scope identity + range
  }, [key]);

  // Keep showing the previous range's data while the next one loads.
  return { data: state ? state.data : null, loading: !!scope && (!state || state.key !== key) };
}
