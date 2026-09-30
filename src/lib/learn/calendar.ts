"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchAllClasses, fetchChildClasses, fetchTeacherClasses, type ClassSummary } from "@/lib/learn/classes";

// Calendar events (lessons + homework due) for whoever is looking. Every
// query runs as the signed-in user, so RLS decides what comes back.

export type CalendarScope =
  | { kind: "teacher" }
  | { kind: "staff" }
  | { kind: "student"; childId: string }
  | { kind: "parent"; children: { id: string; name: string }[] };

export type CalendarEvent = {
  id: string;
  kind: "lesson" | "homework";
  date: string; // YYYY-MM-DD (local)
  time: string | null; // HH:MM
  title: string;
  classId: string;
  className: string;
  who?: string; // child's name, for parents with several children
  href: string;
};

export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function scopeKey(s: CalendarScope | null): string {
  if (!s) return "";
  if (s.kind === "student") return `s:${s.childId}`;
  if (s.kind === "parent") return `p:${s.children.map((c) => c.id).join(",")}`;
  return s.kind;
}

const AREA: Record<CalendarScope["kind"], string> = { teacher: "/teach", staff: "/admin", student: "/student", parent: "/family" };

/** Events between `from` and `to` (inclusive, YYYY-MM-DD). */
export function useCalendarEvents(scope: CalendarScope | null, from: string, to: string): CalendarEvent[] | null {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const key = scopeKey(scope);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !scope) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show loading while the range changes
    setEvents(null);
    (async () => {
      const area = AREA[scope.kind];
      // Which classes, and (for parents) which child each belongs to.
      const classOwners = new Map<string, { cls: ClassSummary; childId?: string; childName?: string }[]>();
      const add = (cls: ClassSummary, childId?: string, childName?: string) => {
        classOwners.set(cls.id, [...(classOwners.get(cls.id) || []), { cls, childId, childName }]);
      };
      if (scope.kind === "teacher") (await fetchTeacherClasses()).forEach((c) => add(c));
      else if (scope.kind === "staff") (await fetchAllClasses()).forEach((c) => add(c));
      else if (scope.kind === "student") (await fetchChildClasses(scope.childId)).forEach((c) => add(c, scope.childId));
      else for (const ch of scope.children) (await fetchChildClasses(ch.id)).forEach((c) => add(c, ch.id, ch.name));

      const classIds = [...classOwners.keys()];
      if (classIds.length === 0) {
        if (!cancelled) setEvents([]);
        return;
      }
      const out: CalendarEvent[] = [];
      const classHref = (classId: string, childId?: string, tab = "course") =>
        `${area}/class?id=${classId}${scope.kind === "parent" && childId ? `&child=${childId}` : ""}&tab=${tab}`;
      const showWho = scope.kind === "parent" && scope.children.length > 1;

      const { data: slots } = await supabase.from("timetable_slots").select("id, class_id, start_time").in("class_id", classIds);
      const slotById = new Map(((slots as { id: string; class_id: string; start_time: string }[]) || []).map((s) => [s.id, s]));
      if (slotById.size) {
        const { data: lessons } = await supabase
          .from("lesson_instances")
          .select("id, date, objectives, timetable_slot_id")
          .in("timetable_slot_id", [...slotById.keys()])
          .gte("date", from)
          .lte("date", to)
          .order("date");
        for (const l of (lessons as { id: string; date: string; objectives: string | null; timetable_slot_id: string }[]) || []) {
          const slot = slotById.get(l.timetable_slot_id);
          if (!slot) continue;
          for (const owner of classOwners.get(slot.class_id) || []) {
            out.push({
              id: `l-${l.id}-${owner.childId || ""}`,
              kind: "lesson",
              date: l.date,
              time: slot.start_time.slice(0, 5),
              title: owner.cls.name,
              classId: slot.class_id,
              className: owner.cls.name,
              who: showWho ? owner.childName : undefined,
              href: `${area}/lessons/view?id=${l.id}${scope.kind === "parent" && owner.childId ? `&child=${owner.childId}` : ""}`,
            });
          }
        }
      }

      const { data: hw } = await supabase
        .from("homework")
        .select("id, title, due_at, class_id")
        .in("class_id", classIds)
        .gte("due_at", `${from}T00:00:00`)
        .lte("due_at", `${to}T23:59:59`);
      for (const h of (hw as { id: string; title: string; due_at: string; class_id: string }[]) || []) {
        const due = new Date(h.due_at);
        for (const owner of classOwners.get(h.class_id) || []) {
          out.push({
            id: `h-${h.id}-${owner.childId || ""}`,
            kind: "homework",
            date: localDateKey(due),
            time: due.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
            title: h.title,
            classId: h.class_id,
            className: owner.cls.name,
            who: showWho ? owner.childName : undefined,
            href: classHref(h.class_id, owner.childId, "assignments"),
          });
        }
      }

      out.sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));
      if (!cancelled) setEvents(out);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on scope identity + range
  }, [key, from, to]);

  return events;
}
