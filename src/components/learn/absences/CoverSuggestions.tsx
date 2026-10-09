"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { localDateKey } from "@/lib/learn/calendar";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchTimetablePeriods, getPublishedRunId, timeLabel, type TimetablePeriod, type TimetableSlot } from "@/lib/learn/timetable";

type Staff = { id: string; name: string; isCoverStaff: boolean };
type Absence = { id: string; teacher_user_id: string; starts_on: string; ends_on: string; reason: string | null };
type CoverRow = { id: string; slot_id: string; cover_date: string; covering_teacher_user_id: string };
type SubjectLink = { teacher_id: string; subject_id: string };
type Need = { key: string; slot: TimetableSlot; date: string };
type Suggestion = { staff: Staff; why: string; sameSubject: boolean };

const fieldCls = "mt-1 w-full rounded-lg border border-gold-light/70 bg-white px-3 py-2 text-sm text-ink";
const btn = "rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gold-900 disabled:opacity-50";
const small = "rounded-lg bg-gold-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gold-900 disabled:opacity-50";

const MAX_DAYS = 31;
const hm = (t: string): string => t.slice(0, 5);
const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string): boolean => hm(aStart) < hm(bEnd) && hm(bStart) < hm(aEnd);
const weekdayOf = (dateKey: string): number => new Date(`${dateKey}T12:00:00`).getDay();
const nextDay = (dateKey: string): string => {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return localDateKey(d);
};
const dateLabel = (dateKey: string): string => new Date(`${dateKey}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/**
 * Pure: the lessons a teacher's absence leaves uncovered. One entry per
 * (weekly slot, date) in the absence (clipped to `from`), weekdays only, up
 * to MAX_DAYS days, excluding lessons that already have a cover assignment.
 */
export function uncoveredLessons(absence: Absence, slots: TimetableSlot[], covers: CoverRow[], from: string): Need[] {
  const out: Need[] = [];
  let day = absence.starts_on > from ? absence.starts_on : from;
  for (let i = 0; i < MAX_DAYS && day <= absence.ends_on; i++, day = nextDay(day)) {
    const wd = weekdayOf(day);
    if (wd < 1 || wd > 5) continue;
    for (const s of slots) {
      if (s.teacher_user_id !== absence.teacher_user_id || s.weekday !== wd) continue;
      if (covers.some((c) => c.slot_id === s.id && c.cover_date === day)) continue;
      out.push({ key: `${s.id}|${day}`, slot: s, date: day });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || hm(a.slot.start_time).localeCompare(hm(b.slot.start_time)));
}

/**
 * Pure: free, qualified staff for one lesson on one date. Qualified = teaches
 * the same subject (in the published timetable or a class/subject mapping) or
 * holds the teaching_assistant_cover role. Free = not absent that day, no
 * lesson of their own then, not already covering something then, and not
 * supervising an enrichment block then. Same-subject teachers come first.
 */
export function suggestCover(args: {
  need: Need;
  staff: Staff[];
  slots: TimetableSlot[];
  covers: CoverRow[];
  absences: Absence[];
  subjectLinks: SubjectLink[];
  periods: TimetablePeriod[];
}): Suggestion[] {
  const { need, staff, slots, covers, absences, subjectLinks, periods } = args;
  const { slot, date } = need;
  const wd = slot.weekday;
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const out: Suggestion[] = [];
  for (const person of staff) {
    if (person.id === slot.teacher_user_id) continue;
    if (absences.some((a) => a.teacher_user_id === person.id && a.starts_on <= date && date <= a.ends_on)) continue;
    const sameSubject = slots.some((s) => s.teacher_user_id === person.id && s.subject_id === slot.subject_id) || subjectLinks.some((l) => l.teacher_id === person.id && l.subject_id === slot.subject_id);
    if (!sameSubject && !person.isCoverStaff) continue;
    if (slots.some((s) => s.teacher_user_id === person.id && s.weekday === wd && overlaps(s.start_time, s.end_time, slot.start_time, slot.end_time))) continue;
    const alreadyCovering = covers.some((c) => {
      if (c.covering_teacher_user_id !== person.id || c.cover_date !== date) return false;
      const other = slotById.get(c.slot_id);
      return Boolean(other && other.weekday === wd && overlaps(other.start_time, other.end_time, slot.start_time, slot.end_time));
    });
    if (alreadyCovering) continue;
    const supervising = periods.some((p) => p.active && p.kind === "enrichment" && p.supervisor_user_id === person.id && p.weekdays.includes(wd) && overlaps(p.start_time, p.end_time, slot.start_time, slot.end_time));
    if (supervising) continue;
    out.push({ staff: person, sameSubject, why: sameSubject ? `Teaches ${slot.subjects?.name || "this subject"}` : "Cover staff" });
  }
  return out.sort((a, b) => Number(b.sameSubject) - Number(a.sameSubject) || a.staff.name.localeCompare(b.staff.name));
}

/** Admin: record a teacher's absence, see the lessons it leaves uncovered, and assign free qualified staff in one click. */
export function CoverSuggestions() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [covers, setCovers] = useState<CoverRow[]>([]);
  const [subjectLinks, setSubjectLinks] = useState<SubjectLink[]>([]);
  const [periods, setPeriods] = useState<TimetablePeriod[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [teacherId, setTeacherId] = useState("");
  const [fromDate, setFromDate] = useState(() => localDateKey(new Date()));
  const [toDate, setToDate] = useState(() => localDateKey(new Date()));
  const [reason, setReason] = useState("");

  const today = localDateKey(new Date());

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const runId = await getPublishedRunId();
    const [staffRes, slotRes, absRes, coverRes, linkRes, periodRows] = await Promise.all([
      supabase.from("profiles").select("id, full_name, user_roles!inner(role)").in("user_roles.role", ["teacher", "teaching_assistant_cover"]),
      runId
        ? supabase
            .from("timetable_slots")
            .select("id, run_id, class_id, subject_id, teacher_user_id, virtual_session_id, weekday, start_time, end_time, classes(name, year_group), subjects(name)")
            .eq("run_id", runId)
        : Promise.resolve({ data: [] as unknown[], error: null }),
      supabase.from("teacher_absences").select("id, teacher_user_id, starts_on, ends_on, reason").gte("ends_on", localDateKey(new Date())).order("starts_on"),
      supabase.from("cover_assignments").select("id, slot_id, cover_date, covering_teacher_user_id").gte("cover_date", localDateKey(new Date())),
      supabase.from("class_subject_teachers").select("teacher_id, subject_id"),
      fetchTimetablePeriods(),
    ]);
    const seen = new Map<string, Staff>();
    for (const r of (staffRes.data as unknown as { id: string; full_name: string | null; user_roles: { role: string }[] | null }[] | null) || []) {
      const prev = seen.get(r.id);
      const cover = (r.user_roles || []).some((u) => u.role === "teaching_assistant_cover");
      seen.set(r.id, { id: r.id, name: r.full_name || "Unnamed", isCoverStaff: cover || Boolean(prev?.isCoverStaff) });
    }
    setStaff(Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name)));
    setSlots((slotRes.data as unknown as TimetableSlot[] | null) || []);
    if (absRes.error) setError("Staff absences aren't switched on yet. They will work once the latest database update is applied.");
    else setError(null);
    setAbsences((absRes.data as unknown as Absence[] | null) || []);
    setCovers((coverRes.data as unknown as CoverRow[] | null) || []);
    setSubjectLinks((linkRes.data as unknown as SubjectLink[] | null) || []);
    setPeriods(periodRows);
    setLoaded(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  const nameOf = useCallback((id: string): string => staff.find((s) => s.id === id)?.name || "A teacher", [staff]);

  const addAbsence = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!teacherId) return setMessage("Choose the teacher who will be away.");
    if (!fromDate || !toDate || toDate < fromDate) return setMessage("The last day must be on or after the first day.");
    setBusy("add");
    setMessage(null);
    const { error: err } = await supabase.from("teacher_absences").insert({ teacher_user_id: teacherId, starts_on: fromDate, ends_on: toDate, reason: reason.trim() || null });
    setBusy(null);
    if (err) return setMessage(`Could not save: ${err.message}`);
    setReason("");
    await load();
  };

  const removeAbsence = async (id: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(id);
    const { error: err } = await supabase.from("teacher_absences").delete().eq("id", id);
    setBusy(null);
    if (err) return setMessage(`Could not remove: ${err.message}`);
    await load();
  };

  const assign = async (need: Need, coverId: string, absence: Absence) => {
    const key = `${need.key}|${coverId}`;
    setBusy(key);
    setMessage(null);
    const why = `Cover for ${nameOf(absence.teacher_user_id)}${absence.reason ? ` (${absence.reason})` : ""}`;
    const result = await callEdgeFunction("timetable-cover", { slot_id: need.slot.id, cover_date: need.date, covering_teacher_user_id: coverId, reason: why });
    if (!result.ok) {
      setBusy(null);
      return setMessage(`Could not assign cover: ${edgeErrorMessage(result)}`);
    }
    const notify = await callEdgeFunction("cover-notify", { slot_id: need.slot.id, cover_date: need.date });
    setBusy(null);
    const emailed = typeof notify.emailed === "number" ? notify.emailed : 0;
    setMessage(
      notify.ok
        ? `Cover assigned: ${nameOf(coverId)} for ${need.slot.classes?.name || "the class"} on ${dateLabel(need.date)}. ${emailed > 0 ? `${emailed} famil${emailed === 1 ? "y" : "ies"} emailed.` : "No families needed emailing."}`
        : `Cover assigned, but the families could not be emailed: ${edgeErrorMessage(notify)}`,
    );
    await load();
  };

  const panels = useMemo(
    () =>
      absences.map((a) => {
        const needs = uncoveredLessons(a, slots, covers, today);
        return { absence: a, needs, suggestions: needs.map((n) => ({ need: n, options: suggestCover({ need: n, staff, slots, covers, absences, subjectLinks, periods }) })) };
      }),
    [absences, slots, covers, staff, subjectLinks, periods, today],
  );

  if (!loaded) return <p className="text-sm text-ink/60">Loading…</p>;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6">
        <h2 className="font-serif text-h3 font-semibold text-ink">Record a teacher&apos;s absence</h2>
        <p className="mt-0.5 text-sm text-ink/60">Enter the days a teacher is away. Their lessons in that time are listed below with free, qualified staff you can assign in one click.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <label className="block text-xs font-medium text-ink/70">
            Teacher
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={fieldCls}>
              <option value="">Choose…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-ink/70">
            First day
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={fieldCls} />
          </label>
          <label className="block text-xs font-medium text-ink/70">
            Last day
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={fieldCls} />
          </label>
          <label className="block text-xs font-medium text-ink/70">
            Reason (optional)
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={fieldCls} />
          </label>
        </div>
        <button type="button" onClick={addAbsence} disabled={busy !== null} className={`${btn} mt-3`}>
          Add absence
        </button>
      </section>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</p>}
      {message && (
        <p role="status" className="rounded-lg border border-gold-light bg-cream px-4 py-2 text-sm text-ink/80">
          {message}
        </p>
      )}

      {panels.length === 0 && !error && <p className="rounded-xl border border-dashed border-gold-light bg-cream/60 px-4 py-3 text-sm text-ink/70">No current or upcoming teacher absences.</p>}

      {panels.map(({ absence, needs, suggestions }) => (
        <section key={absence.id} className="rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-serif text-h3 font-semibold text-ink">Suggest cover: {nameOf(absence.teacher_user_id)}</h3>
              <p className="text-sm text-ink/60">
                {dateLabel(absence.starts_on)}
                {absence.ends_on !== absence.starts_on ? ` to ${dateLabel(absence.ends_on)}` : ""}
                {absence.reason ? ` · ${absence.reason}` : ""}
              </p>
            </div>
            <button type="button" onClick={() => removeAbsence(absence.id)} disabled={busy !== null} className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
              Remove absence
            </button>
          </div>
          {needs.length === 0 ? (
            <p className="mt-3 text-sm text-ink/70">Every lesson in this absence is covered, or there are no lessons in the published timetable.</p>
          ) : (
            <ul className="mt-3 divide-y divide-gold-light/30">
              {suggestions.map(({ need, options }) => (
                <li key={need.key} className="py-3 text-sm">
                  <p className="font-medium text-ink">
                    {dateLabel(need.date)} · {timeLabel(need.slot.start_time)}-{timeLabel(need.slot.end_time)} · {need.slot.subjects?.name || "Lesson"} ({need.slot.classes?.name || "class"})
                  </p>
                  {options.length === 0 ? (
                    <p className="mt-1 text-xs text-amber-900">No free qualified staff at this time. Try the manual cover form on the timetable page.</p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {options.slice(0, 6).map((o) => (
                        <li key={o.staff.id} className="flex items-center gap-2 rounded-lg border border-gold-light/60 bg-cream/40 px-2.5 py-1.5">
                          <span>
                            <span className="font-medium text-ink">{o.staff.name}</span> <span className="text-xs text-ink/55">{o.why}</span>
                          </span>
                          <button type="button" onClick={() => assign(need, o.staff.id, absence)} disabled={busy !== null} className={small}>
                            {busy === `${need.key}|${o.staff.id}` ? "Assigning…" : "Assign cover"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
