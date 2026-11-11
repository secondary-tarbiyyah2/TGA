"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ClassSummary, ClassViewer } from "@/lib/learn/classes";
import { displayName, type TeacherCardData } from "@/lib/learn/staffProfiles";
import { Avatar } from "@/components/learn/ui";
import { loadClassAttendance, rateOf, LOOKBACK_DAYS } from "@/components/learn/class/ClassAttendanceTab";
import { useClassRoster } from "@/components/learn/class/PupilPicker";

type Slot = { weekday: number; start_time: string; teacher_user_id: string | null };
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hhmm = (t: string) => t.slice(0, 5);

/** "Mon, Wed and Thu at 13:20", or "Mon 13:20, Thu 14:00" when the times differ. */
export function scheduleLine(slots: Slot[]): string {
  const seen = new Set<string>();
  const list = [...slots]
    .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.start_time.localeCompare(b.start_time))
    .filter((s) => {
      const k = `${s.weekday}-${hhmm(s.start_time)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  if (!list.length) return "";
  const times = new Set(list.map((s) => hhmm(s.start_time)));
  const days = list.map((s) => DAY[s.weekday % 7]);
  const join = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  if (times.size === 1) return `${join(days)} at ${hhmm(list[0].start_time)}`;
  return list.map((s) => `${DAY[s.weekday % 7]} ${hhmm(s.start_time)}`).join(", ");
}

type Stats = { attendance: number | null; workIn: number | null; average: number | null };

/** The class's live timetable (the published run) and who teaches it. */
function useClassFacts(classId: string, staff: boolean) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [teachers, setTeachers] = useState<string[]>([]);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from("timetable_slots").select("weekday, start_time, teacher_user_id, timetable_runs!inner(status)").eq("class_id", classId).eq("timetable_runs.status", "published");
      const rows = error ? [] : ((data as unknown as Slot[]) || []);
      if (!alive) return;
      setSlots(rows);
      let names: string[] = [];
      if (staff) {
        const ids = [...new Set(rows.map((r) => r.teacher_user_id).filter((x): x is string => !!x))];
        if (ids.length) {
          const { data: ps } = await supabase.from("profiles").select("id, full_name").in("id", ids);
          names = ((ps as { id: string; full_name: string | null }[] | null) || []).map((p) => p.full_name || "").filter(Boolean);
        }
      } else {
        const { data: ts } = await supabase.rpc("meet_my_teachers", { p_class_id: classId });
        names = ((ts as TeacherCardData[] | null) || []).map((t) => displayName(t.full_name, t.display_title));
      }
      if (alive) setTeachers(names);
    })();
    return () => {
      alive = false;
    };
  }, [classId, staff]);
  return { slots, teachers };
}

/** Staff only: the class's three headline figures, from the same sources as Insights. */
function useClassStats(classId: string, staff: boolean): Stats | null {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !staff) return;
    let alive = true;
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
    (async () => {
      const [att, st, gr] = await Promise.all([
        loadClassAttendance(classId),
        supabase.from("homework_status").select("status").eq("class_id", classId).gte("due_at", since).limit(5000),
        supabase.from("assessments").select("percent").eq("class_id", classId).gte("date", since.slice(0, 10)).limit(5000),
      ]);
      if (!alive) return;
      const due = ((st.data as { status: string }[] | null) || []).filter((h) => h.status !== "not_yet_due");
      const handed = due.filter((h) => h.status === "on_time" || h.status === "late").length;
      const scores = ((gr.data as { percent: number | null }[] | null) || []).filter((g) => g.percent != null).map((g) => Number(g.percent));
      setStats({
        attendance: rateOf(att?.marks || []),
        workIn: due.length ? Math.round((handed / due.length) * 100) : null,
        average: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      });
    })();
    return () => {
      alive = false;
    };
  }, [classId, staff]);
  return stats;
}

/**
 * The top of a class (Evergreen, owner 11 Nov 2026: "especially the classroom"): a deep green
 * card with the subject and year as a gold eyebrow, the class name, when it meets and who
 * teaches it, and (for staff) the class's attendance, work handed in and average result over
 * the last ten weeks. `join` is the live lesson's gold Join button when one is open; `actions`
 * the class's own actions. Every figure is read from the class's real records.
 */
export function ClassHero({ cls, viewer, quran, join, actions }: { cls: ClassSummary; viewer: ClassViewer; quran?: boolean; join?: ReactNode; actions?: ReactNode }) {
  const staff = viewer.kind === "teacher" || viewer.kind === "staff";
  const { slots, teachers } = useClassFacts(cls.id, staff);
  const roster = useClassRoster(staff ? cls.id : "");
  const stats = useClassStats(cls.id, staff);
  const schedule = slots ? scheduleLine(slots) : "";
  const meta = [schedule, staff && roster ? `${roster.length} pupil${roster.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
  const eyebrow = [cls.subject, cls.yearGroup].filter(Boolean).join(" · ");
  const figure = (v: number | null, unit = "%") => (v === null ? "–" : `${v}${unit}`);
  const teacherLine = teachers.length ? (teachers.length < 3 ? teachers.join(" and ") : `${teachers.slice(0, 2).join(", ")} and ${teachers.length - 2} more`) : "";

  return (
    <header className="portal-hero mb-6 px-5 py-6 sm:px-7 sm:py-7" data-class-hero>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
        <div className="min-w-[min(100%,18rem)] flex-[1_1_22rem]">
          {eyebrow && <p className="portal-hero-eyebrow text-xs font-semibold uppercase tracking-[0.06em]">{eyebrow}</p>}
          <h1 className="mt-1.5 text-[1.75rem] font-bold leading-[1.1] tracking-[-0.03em] text-white [overflow-wrap:anywhere] sm:text-[2.125rem]">{cls.name}</h1>
          {meta && <p className="portal-hero-muted mt-2 text-sm">{meta}</p>}
          {teacherLine && (
            <div className="mt-4 flex items-center gap-2">
              <span className="flex -space-x-1.5">
                {teachers.slice(0, 3).map((t) => (
                  <Avatar key={t} name={t} size={30} />
                ))}
              </span>
              <span className="portal-hero-muted text-[0.8125rem]">{teacherLine}</span>
            </div>
          )}
        </div>
        {staff && (
          <dl className="flex flex-wrap gap-x-7 gap-y-3" aria-label={`The last ${LOOKBACK_DAYS / 7} weeks`}>
            {[
              { v: figure(stats?.attendance ?? null), l: "attendance" },
              { v: figure(stats?.workIn ?? null), l: "work in" },
              { v: figure(stats?.average ?? null), l: quran ? "average mark" : "average result" },
            ].map((s) => (
              <div key={s.l} className="flex flex-col-reverse">
                <dt className="portal-hero-muted text-xs">{s.l}</dt>
                <dd className="text-[1.75rem] font-bold leading-[1.1] tracking-[-0.02em] tabular-nums text-white">{stats ? s.v : "…"}</dd>
              </div>
            ))}
          </dl>
        )}
        {(join || actions) && (
          <div className="flex flex-wrap items-center gap-2">
            {join}
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
