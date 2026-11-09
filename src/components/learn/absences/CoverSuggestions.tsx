"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { shiftDateKey, ukToday } from "@/lib/learn/ukTime";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchTimetablePeriods, getPublishedRunId, timeLabel, type TimetablePeriod } from "@/lib/learn/timetable";
import { Select } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/learn/DatePicker";
import { DataTable, type Column } from "@/components/learn/DataTable";
import { Tabs } from "@/components/learn/Tabs";
import { Button, EmptyState, Field, Notice, Section, StatusChip, ui } from "@/components/learn/ui";
import {
  ABSENCE_CATEGORY,
  absenceLabel,
  affectedLessons,
  coverReport,
  rankCover,
  type AffectedLesson,
  type Candidate,
  type CoverRow,
  type CoverSlot,
  type CoverStaff,
  type StaffAbsence,
  type SubjectLink,
} from "@/lib/learn/cover";

import { askConfirm } from "@/components/learn/kit";
type LogRow = CoverRow & {
  original_teacher_user_id: string;
  reason: string | null;
  absence_id: string | null;
  families_notified_at: string | null;
  teacher_notified_at: string | null;
  created_at: string;
};
type View = "plan" | "log" | "report";

const dateLabel = (dateKey: string): string => new Date(`${dateKey}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const TIMES = Array.from({ length: (18 - 7) * 4 + 1 }, (_, i) => {
  const m = 7 * 60 + i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
const SLOT_COLUMNS = "id, class_id, subject_id, teacher_user_id, weekday, start_time, end_time, classes(name, year_group), subjects(name)";
const LOG_COLUMNS = "id, slot_id, cover_date, covering_teacher_user_id, original_teacher_user_id, reason, absence_id, families_notified_at, teacher_notified_at, created_at";

/**
 * Admin › Absences › Cover. Record a member of staff's absence (a range of
 * days, or part of a day), see every lesson it affects from the published
 * timetable, and assign cover in one click from a ranked list that says why
 * each person is suggested. Assigning emails the covering teacher (and the
 * class's families). The cover log lists every cover with an undo, and the
 * report counts covers given and received over a period.
 */
export function CoverSuggestions() {
  const [view, setView] = useState<View>("plan");
  const [staff, setStaff] = useState<CoverStaff[]>([]);
  const [slots, setSlots] = useState<CoverSlot[]>([]);
  const [absences, setAbsences] = useState<StaffAbsence[]>([]);
  const [covers, setCovers] = useState<LogRow[]>([]);
  const [subjectLinks, setSubjectLinks] = useState<SubjectLink[]>([]);
  const [periods, setPeriods] = useState<TimetablePeriod[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const today = ukToday();
  const [logFrom, setLogFrom] = useState(() => shiftDateKey(ukToday(), -90));

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const runId = await getPublishedRunId();
    const [staffRes, slotRes, absRes, coverRes, linkRes, periodRows] = await Promise.all([
      supabase.from("profiles").select("id, full_name, user_roles!inner(role)").in("user_roles.role", ["teacher", "teaching_assistant_cover", "head_teacher"]),
      runId ? supabase.from("timetable_slots").select(SLOT_COLUMNS).eq("run_id", runId) : Promise.resolve({ data: [] as unknown[], error: null }),
      supabase.from("teacher_absences").select("id, teacher_user_id, starts_on, ends_on, start_time, end_time, category, reason").gte("ends_on", shiftDateKey(ukToday(), -400)).order("starts_on"),
      supabase.from("cover_assignments").select(LOG_COLUMNS).gte("cover_date", logFrom < shiftDateKey(ukToday(), -28) ? logFrom : shiftDateKey(ukToday(), -28)).order("cover_date"),
      supabase.from("class_subject_teachers").select("teacher_id, subject_id, class_id"),
      fetchTimetablePeriods(),
    ]);
    const seen = new Map<string, CoverStaff>();
    for (const r of (staffRes.data as unknown as { id: string; full_name: string | null; user_roles: { role: string }[] | null }[] | null) || []) {
      const prev = seen.get(r.id);
      const cover = (r.user_roles || []).some((u) => u.role === "teaching_assistant_cover");
      seen.set(r.id, { id: r.id, name: r.full_name || "Unnamed", isCoverStaff: cover || Boolean(prev?.isCoverStaff) });
    }
    setStaff(Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name)));
    setSlots((slotRes.data as unknown as CoverSlot[] | null) || []);
    // Before 0187 is applied the new columns are missing: fall back to the old ones.
    if (absRes.error) {
      const old = await supabase.from("teacher_absences").select("id, teacher_user_id, starts_on, ends_on, reason").gte("ends_on", shiftDateKey(ukToday(), -400)).order("starts_on");
      setError(old.error ? "Staff absences aren't switched on yet. They will work once the latest database update is applied." : "Part days and the cover log need the latest database update. Whole-day absences work meanwhile.");
      setAbsences(((old.data as unknown as StaffAbsence[] | null) || []).map((a) => ({ ...a, start_time: null, end_time: null, category: "other" })));
    } else {
      setError(null);
      setAbsences((absRes.data as unknown as StaffAbsence[] | null) || []);
    }
    if (coverRes.error) {
      const old = await supabase.from("cover_assignments").select("id, slot_id, cover_date, covering_teacher_user_id, original_teacher_user_id, reason, families_notified_at, created_at").gte("cover_date", shiftDateKey(ukToday(), -28));
      setCovers(((old.data as unknown as LogRow[] | null) || []).map((c) => ({ ...c, absence_id: null, teacher_notified_at: null })));
    } else {
      setCovers((coverRes.data as unknown as LogRow[] | null) || []);
    }
    setSubjectLinks((linkRes.data as unknown as SubjectLink[] | null) || []);
    setPeriods(periodRows);
    setLoaded(true);
  }, [logFrom]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    void load();
  }, [load]);

  const nameOf = useCallback((id: string): string => staff.find((s) => s.id === id)?.name || "A colleague", [staff]);
  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);

  const assign = async (lesson: AffectedLesson, who: Candidate, absence: StaffAbsence) => {
    const key = `${lesson.key}|${who.staff.id}`;
    setBusy(key);
    setMessage(null);
    const reason = `Cover for ${nameOf(absence.teacher_user_id)}`;
    const result = await callEdgeFunction("timetable-cover", { slot_id: lesson.slot.id, cover_date: lesson.date, covering_teacher_user_id: who.staff.id, reason, absence_id: absence.id });
    if (!result.ok) {
      setBusy(null);
      return setMessage({ tone: "bad", text: `Couldn't assign cover: ${edgeErrorMessage(result)}` });
    }
    const notify = await callEdgeFunction("cover-notify", { slot_id: lesson.slot.id, cover_date: lesson.date });
    setBusy(null);
    const what = `${who.staff.name} is covering ${lesson.slot.subjects?.name || "the lesson"} (${lesson.slot.classes?.name || "class"}) on ${dateLabel(lesson.date)}.`;
    if (!notify.ok) {
      setMessage({ tone: "bad", text: `${what} The emails couldn't be sent: ${edgeErrorMessage(notify)}. Use "Email again" in the cover log.` });
    } else {
      const families = typeof notify.emailed === "number" ? notify.emailed : 0;
      const teacher = notify.teacherEmailed ? `${who.staff.name} has been emailed` : `${who.staff.name} couldn't be emailed (no email address on file) but will see it on their Today page`;
      setMessage({ tone: "good", text: `${what} ${teacher}${families > 0 ? `, and ${families} famil${families === 1 ? "y" : "ies"} told` : ""}.` });
    }
    await load();
  };

  const unassign = async (c: LogRow) => {
    if (!(await askConfirm(`Remove ${nameOf(c.covering_teacher_user_id)}'s cover on ${dateLabel(c.cover_date)}? The lesson goes back to ${nameOf(c.original_teacher_user_id)}. Anyone already emailed is not told automatically.`))) return;
    setBusy(c.id);
    const result = await callEdgeFunction("timetable-cover", { action: "remove", cover_id: c.id });
    setBusy(null);
    if (!result.ok) return setMessage({ tone: "bad", text: `Couldn't remove the cover: ${edgeErrorMessage(result)}` });
    setMessage({ tone: "good", text: "Cover removed." });
    await load();
  };

  const resend = async (c: LogRow) => {
    setBusy(c.id);
    const notify = await callEdgeFunction("cover-notify", { slot_id: c.slot_id, cover_date: c.cover_date });
    setBusy(null);
    if (!notify.ok) return setMessage({ tone: "bad", text: `Couldn't send the emails: ${edgeErrorMessage(notify)}` });
    setMessage({ tone: "good", text: notify.teacherEmailed ? `${nameOf(c.covering_teacher_user_id)} has been emailed.` : "Nothing left to send." });
    await load();
  };

  const removeAbsence = async (a: StaffAbsence) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!(await askConfirm("Remove this absence? Cover already assigned stays in place (remove it from the cover log if it's no longer needed)."))) return;
    setBusy(a.id);
    const { error: err } = await supabase.from("teacher_absences").delete().eq("id", a.id);
    setBusy(null);
    if (err) return setMessage({ tone: "bad", text: `Couldn't remove it: ${err.message}` });
    await load();
  };

  const current = useMemo(() => absences.filter((a) => a.ends_on >= today), [absences, today]);

  if (!loaded) return <p className="text-sm text-ink/65">Loading…</p>;

  return (
    <div className="space-y-5">
      <Tabs
        variant="switch"
        label="Cover"
        value={view}
        onChange={setView}
        items={[
          { key: "plan", label: "Absences and cover", count: current.length || undefined },
          { key: "log", label: "Cover log" },
          { key: "report", label: "Cover report" },
        ]}
      />
      {error && <Notice tone="warn">{error}</Notice>}
      {message && (
        // Sticky, so the result of "Assign" far down the list is still seen.
        <div role="status" className="sticky top-2 z-10">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      {view === "plan" && (
        <>
          <RecordAbsence staff={staff} onSaved={load} setMessage={setMessage} />
          {current.length === 0 ? (
            <EmptyState title="No current or upcoming staff absences." icon="calendarX">
              Record one above to see the lessons it affects and who can cover them.
            </EmptyState>
          ) : (
            current.map((a) => (
              <AbsencePanel
                key={a.id}
                absence={a}
                name={nameOf(a.teacher_user_id)}
                lessons={affectedLessons(a, slots, covers, today)}
                rank={(lesson) => rankCover({ lesson, staff, slots, covers, absences, subjectLinks, enrichment: periods, today })}
                nameOf={nameOf}
                busy={busy}
                onAssign={(l, c) => void assign(l, c, a)}
                onRemove={() => void removeAbsence(a)}
              />
            ))
          )}
        </>
      )}

      {view === "log" && <CoverLog covers={covers} slotById={slotById} nameOf={nameOf} busy={busy} from={logFrom} setFrom={setLogFrom} onRemove={(c) => void unassign(c)} onResend={(c) => void resend(c)} />}
      {view === "report" && <CoverReport covers={covers} staff={staff} absences={absences} slots={slots} from={logFrom} setFrom={setLogFrom} />}
    </div>
  );
}

function RecordAbsence({ staff, onSaved, setMessage }: { staff: CoverStaff[]; onSaved: () => Promise<void>; setMessage: (m: { tone: "good" | "bad"; text: string } | null) => void }) {
  const [teacherId, setTeacherId] = useState("");
  const [from, setFrom] = useState(() => ukToday());
  const [to, setTo] = useState(() => ukToday());
  const [partDay, setPartDay] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [category, setCategory] = useState("sickness");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const oneDay = from === to;

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!teacherId) return setMessage({ tone: "bad", text: "Choose who will be away." });
    if (!from || !to || to < from) return setMessage({ tone: "bad", text: "The last day must be on or after the first day." });
    if (partDay && !startTime && !endTime) return setMessage({ tone: "bad", text: "Choose a time, or untick Part of a day." });
    if (partDay && oneDay && startTime && endTime && endTime <= startTime) return setMessage({ tone: "bad", text: "The time they're back must be after the time they leave." });
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.from("teacher_absences").insert({
      teacher_user_id: teacherId,
      starts_on: from,
      ends_on: to,
      start_time: partDay && startTime ? startTime : null,
      end_time: partDay && endTime ? endTime : null,
      category,
      reason: reason.trim() || null,
    });
    setSaving(false);
    if (error) return setMessage({ tone: "bad", text: `Couldn't save: ${error.message}` });
    setReason("");
    setPartDay(false);
    setStartTime("");
    setEndTime("");
    setMessage({ tone: "good", text: "Absence recorded. The lessons it affects are listed below." });
    await onSaved();
  };

  return (
    <Section title="Record a staff absence" description="A day, several days, or part of a day. The lessons it affects are listed with who can cover them.">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Who is away" htmlFor="abs-who">
            <Select id="abs-who" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={ui.select} searchable="auto">
              <option value="">Choose…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type of absence" htmlFor="abs-cat">
            <Select id="abs-cat" value={category} onChange={(e) => setCategory(e.target.value)} className={ui.select}>
              {Object.entries(ABSENCE_CATEGORY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <DatePicker
            label="First day"
            value={from}
            onChange={(v) => {
              setFrom(v);
              if (v && to < v) setTo(v);
            }}
          />
          <DatePicker label="Last day" value={to} min={from || undefined} onChange={setTo} />
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4 accent-teal-700" checked={partDay} onChange={(e) => setPartDay(e.target.checked)} />
          Part of a day
        </label>
        {partDay && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={oneDay ? "Away from" : "Away from (first day)"} htmlFor="abs-start" hint="Leave empty if away from the start of the day.">
              <Select id="abs-start" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={ui.select} searchable={false}>
                <option value="">Start of the day</option>
                {TIMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={oneDay ? "Back at" : "Back at (last day)"} htmlFor="abs-end" hint="Leave empty if away until the end of the day.">
              <Select id="abs-end" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={ui.select} searchable={false}>
                <option value="">End of the day</option>
                {TIMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        <Field label="Note (optional)" htmlFor="abs-reason" hint="Seen by the Headteacher, admin and the member of staff themselves. Never sent to the covering teacher or families.">
          <input id="abs-reason" className={ui.input} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Button variant="primary" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Record absence"}
        </Button>
      </div>
    </Section>
  );
}

function AbsencePanel({
  absence,
  name,
  lessons,
  rank,
  nameOf,
  busy,
  onAssign,
  onRemove,
}: {
  absence: StaffAbsence;
  name: string;
  lessons: AffectedLesson[];
  rank: (l: AffectedLesson) => Candidate[];
  nameOf: (id: string) => string;
  busy: string | null;
  onAssign: (l: AffectedLesson, c: Candidate) => void;
  onRemove: () => void;
}) {
  const uncovered = lessons.filter((l) => !l.cover).length;
  return (
    <section className={ui.card} aria-labelledby={`abs-${absence.id}`}>
      <div className={ui.cardHead}>
        <div>
          <h3 id={`abs-${absence.id}`} className={ui.sectionTitle}>
            {name}
          </h3>
          <p className="text-sm text-ink/65">
            {absenceLabel(absence, dateLabel)} · {ABSENCE_CATEGORY[absence.category || "other"] || "Other"}
            {absence.reason ? ` · ${absence.reason}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lessons.length > 0 && <StatusChip tone={uncovered ? "warn" : "good"}>{uncovered ? `${uncovered} of ${lessons.length} lessons need cover` : `All ${lessons.length} lessons covered`}</StatusChip>}
          <button type="button" onClick={onRemove} disabled={busy !== null} className={ui.btnLinkDanger}>
            Remove absence
          </button>
        </div>
      </div>
      {lessons.length === 0 ? (
        <p className="text-sm text-ink/65">No lessons in the published timetable fall in this time.</p>
      ) : (
        <ul className="divide-y divide-gold-light/50">
          {lessons.map((l) => (
            <LessonRow key={l.key} lesson={l} nameOf={nameOf} busy={busy} rank={rank} onAssign={onAssign} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LessonRow({ lesson, nameOf, busy, rank, onAssign }: { lesson: AffectedLesson; nameOf: (id: string) => string; busy: string | null; rank: (l: AffectedLesson) => Candidate[]; onAssign: (l: AffectedLesson, c: Candidate) => void }) {
  const [showAll, setShowAll] = useState(false);
  const title = `${dateLabel(lesson.date)} · ${timeLabel(lesson.slot.start_time)} to ${timeLabel(lesson.slot.end_time)} · ${lesson.slot.subjects?.name || "Lesson"} (${lesson.slot.classes?.name || "class"})`;
  if (lesson.cover) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-3 text-sm">
        <span className="min-w-0 flex-1 font-medium text-ink">{title}</span>
        <StatusChip tone="good">Covered by {nameOf(lesson.cover.covering_teacher_user_id)}</StatusChip>
      </li>
    );
  }
  const options = rank(lesson);
  const shown = showAll ? options : options.slice(0, 3);
  return (
    <li className="py-3 text-sm">
      <p className="font-medium text-ink">{title}</p>
      {options.length === 0 ? (
        <p className="mt-1 text-amber-900">Nobody is free at this time. Try the manual cover form on the timetable page, or move the lesson.</p>
      ) : (
        <>
          <ol className="mt-2 space-y-2" aria-label={`Suggested cover for ${title}, best first`}>
            {shown.map((c, i) => (
              <li key={c.staff.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-gold-light/70 bg-cream/40 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-ink">
                    {i === 0 && !showAll ? "Best match: " : ""}
                    {c.staff.name}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-1.5">
                    {c.reasons.map((r) => (
                      <span key={r} className="rounded-full bg-white px-2 py-0.5 text-xs text-ink/75 ring-1 ring-gold-light">
                        {r}
                      </span>
                    ))}
                  </span>
                </span>
                <Button size="sm" variant={i === 0 ? "primary" : "secondary"} disabled={busy !== null} onClick={() => onAssign(lesson, c)} aria-label={`Assign ${c.staff.name} to cover ${title} and email them`}>
                  {busy === `${lesson.key}|${c.staff.id}` ? "Assigning…" : "Assign and notify"}
                </Button>
              </li>
            ))}
          </ol>
          {options.length > 3 && (
            <button type="button" className={`${ui.btnLink} mt-1`} onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? "Show the top 3 only" : `Show all ${options.length} free staff`}
            </button>
          )}
        </>
      )}
    </li>
  );
}

function PeriodPicker({ from, setFrom }: { from: string; setFrom: (v: string) => void }) {
  const today = ukToday();
  const choices: { label: string; value: string }[] = [
    { label: "Last 30 days", value: shiftDateKey(today, -30) },
    { label: "Last 90 days", value: shiftDateKey(today, -90) },
    { label: "Last 12 months", value: shiftDateKey(today, -365) },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Period">
      {choices.map((c) => (
        <button key={c.label} type="button" aria-pressed={from === c.value} onClick={() => setFrom(c.value)} className={from === c.value ? ui.chipOn : ui.chip}>
          {c.label}
        </button>
      ))}
    </div>
  );
}

function CoverLog({
  covers,
  slotById,
  nameOf,
  busy,
  from,
  setFrom,
  onRemove,
  onResend,
}: {
  covers: LogRow[];
  slotById: Map<string, CoverSlot>;
  nameOf: (id: string) => string;
  busy: string | null;
  from: string;
  setFrom: (v: string) => void;
  onRemove: (c: LogRow) => void;
  onResend: (c: LogRow) => void;
}) {
  const today = ukToday();
  const rows = useMemo(() => covers.filter((c) => c.cover_date >= from), [covers, from]);
  const lessonOf = (c: LogRow) => {
    const s = slotById.get(c.slot_id);
    return s ? `${s.subjects?.name || "Lesson"} (${s.classes?.name || "class"}), ${timeLabel(s.start_time)}` : "Lesson from an earlier timetable";
  };
  const columns: Column<LogRow>[] = [
    { key: "date", header: "Date", cell: (c) => dateLabel(c.cover_date), sort: (c) => c.cover_date, csv: (c) => c.cover_date },
    { key: "lesson", header: "Lesson", cell: lessonOf, csv: lessonOf },
    { key: "for", header: "Covering for", cell: (c) => nameOf(c.original_teacher_user_id), sort: (c) => nameOf(c.original_teacher_user_id), csv: (c) => nameOf(c.original_teacher_user_id) },
    { key: "by", header: "Covered by", cell: (c) => <span className="font-medium text-ink">{nameOf(c.covering_teacher_user_id)}</span>, sort: (c) => nameOf(c.covering_teacher_user_id), csv: (c) => nameOf(c.covering_teacher_user_id) },
    {
      key: "told",
      header: "Told",
      cell: (c) => (
        <span className="flex flex-wrap gap-1">
          <StatusChip tone={c.teacher_notified_at ? "good" : "warn"}>{c.teacher_notified_at ? "Teacher emailed" : "Teacher not emailed"}</StatusChip>
          {c.families_notified_at && <StatusChip>Families told</StatusChip>}
        </span>
      ),
      csv: (c) => (c.teacher_notified_at ? "Teacher emailed" : "Not emailed"),
    },
    {
      key: "actions",
      header: "",
      cell: (c) =>
        c.cover_date >= today ? (
          <span className="flex flex-wrap justify-end gap-2">
            {(!c.teacher_notified_at || !c.families_notified_at) && (
              <button type="button" className={ui.btnLink} disabled={busy !== null} onClick={() => onResend(c)}>
                Email again
              </button>
            )}
            <button type="button" className={ui.btnLinkDanger} disabled={busy !== null} onClick={() => onRemove(c)} aria-label={`Remove ${nameOf(c.covering_teacher_user_id)}'s cover on ${dateLabel(c.cover_date)}`}>
              Remove
            </button>
          </span>
        ) : null,
      align: "right",
    },
  ];
  return (
    <div className="space-y-3">
      <PeriodPicker from={from} setFrom={setFrom} />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(c) => c.id}
        caption="Cover log: every lesson covered, newest first"
        initialSort={{ key: "date", dir: "desc" }}
        search={{ text: (c) => `${nameOf(c.covering_teacher_user_id)} ${nameOf(c.original_teacher_user_id)} ${lessonOf(c)}`, placeholder: "Search by name or class" }}
        csvName={`cover-log-from-${from}.csv`}
        empty="No cover in this period."
      />
    </div>
  );
}

function CoverReport({ covers, staff, absences, slots, from, setFrom }: { covers: LogRow[]; staff: CoverStaff[]; absences: StaffAbsence[]; slots: CoverSlot[]; from: string; setFrom: (v: string) => void }) {
  const today = ukToday();
  const rows = useMemo(() => coverReport(covers, staff, from, today), [covers, staff, from, today]);
  const inPeriod = useMemo(() => absences.filter((a) => a.ends_on >= from && a.starts_on <= today), [absences, from, today]);
  // Lessons affected by absences in the period, and how many got cover.
  const totals = useMemo(() => {
    let affected = 0;
    let covered = 0;
    for (const a of inPeriod) {
      for (const l of affectedLessons({ ...a, starts_on: a.starts_on < from ? from : a.starts_on, ends_on: a.ends_on > today ? today : a.ends_on }, slots, covers)) {
        affected++;
        if (l.cover) covered++;
      }
    }
    return { affected, covered };
  }, [inPeriod, slots, covers, from, today]);
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of inPeriod) m.set(a.category || "other", (m.get(a.category || "other") || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [inPeriod]);

  const columns: Column<(typeof rows)[number]>[] = [
    { key: "name", header: "Member of staff", cell: (r) => <span className="font-medium text-ink">{r.name}</span>, sort: (r) => r.name, csv: (r) => r.name },
    { key: "given", header: "Lessons covered", cell: (r) => r.given, sort: (r) => r.given, csv: (r) => r.given, align: "right" },
    { key: "received", header: "Lessons covered for them", cell: (r) => r.received, sort: (r) => r.received, csv: (r) => r.received, align: "right" },
  ];

  return (
    <div className="space-y-4">
      <PeriodPicker from={from} setFrom={setFrom} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={ui.card}>
          <p className={ui.hint}>Staff absences</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{inPeriod.length}</p>
          {byCategory.length > 0 && <p className="mt-1 text-xs text-ink/65">{byCategory.map(([k, n]) => `${ABSENCE_CATEGORY[k] || k} ${n}`).join(" · ")}</p>}
        </div>
        <div className={ui.card}>
          <p className={ui.hint}>Lessons affected (current timetable)</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{totals.affected}</p>
        </div>
        <div className={ui.card}>
          <p className={ui.hint}>Of those, covered</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{totals.affected ? `${Math.round((totals.covered / totals.affected) * 100)}%` : "None to cover"}</p>
          {totals.affected > 0 && <p className="mt-1 text-xs text-ink/65">{`${totals.covered} of ${totals.affected}`}</p>}
        </div>
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} caption="Cover given and received per member of staff" initialSort={{ key: "given", dir: "desc" }} csvName={`cover-report-from-${from}.csv`} empty="No cover in this period." />
      <p className={ui.hint}>Counts every cover from {dateLabel(from)} to today. Lessons affected are worked out from the timetable published now, so they are a guide for earlier terms.</p>
    </div>
  );
}
