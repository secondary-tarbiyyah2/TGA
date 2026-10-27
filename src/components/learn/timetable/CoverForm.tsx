"use client";

import { useState } from "react";
import { edgeErrorMessage } from "@/lib/learn/edge";
import { WEEKDAYS, timeLabel, type TimetableSlot } from "@/lib/learn/timetable";
import { callFunction, btn, fieldCls } from "./api";
import { hhmm, ukIsoDate, type Teacher } from "./types";

/** Assign a covering teacher for one dated lesson. */
export function CoverForm({ slots, teachers, onDone }: { slots: TimetableSlot[]; teachers: Teacher[]; onDone: () => void }) {
  const [slotId, setSlotId] = useState("");
  const [date, setDate] = useState("");
  const [coveringTeacher, setCoveringTeacher] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const slot = slots.find((s) => s.id === slotId) || null;
  const ordered = [...slots].sort((a, b) => a.weekday - b.weekday || hhmm(a.start_time).localeCompare(hhmm(b.start_time)) || (a.classes?.name || "").localeCompare(b.classes?.name || ""));
  // 1 = Monday ... 7 = Sunday, matching WEEKDAYS.
  const weekdayOf = (iso: string) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const dayMismatch = slot && date ? weekdayOf(date) !== slot.weekday : false;

  const assign = async () => {
    if (!slotId || !date || !coveringTeacher) return setMessage("Choose the lesson, the date and the covering teacher.");
    if (dayMismatch && slot) return setMessage(`That lesson is on a ${WEEKDAYS.find((w) => w.value === slot.weekday)?.label}. Pick a ${WEEKDAYS.find((w) => w.value === slot.weekday)?.label} date.`);
    setBusy(true);
    const result = await callFunction("timetable-cover", { slot_id: slotId, cover_date: date, covering_teacher_user_id: coveringTeacher, reason });
    setBusy(false);
    if (!result.ok) return setMessage(`Could not assign cover: ${edgeErrorMessage(result)}`);
    const who = slot ? `${slot.subjects?.name || "Lesson"} (${slot.classes?.name || "class"})` : "the lesson";
    setMessage(`Cover assigned for ${who} on ${new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}.`);
    setSlotId("");
    setDate("");
    setCoveringTeacher("");
    setReason("");
    onDone();
  };

  return (
    <div>
      {message && <p role="status" className="mb-2 text-xs text-ink/70">{message}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink/70">Lesson
          <select value={slotId} onChange={(e) => setSlotId(e.target.value)} className={fieldCls}>
            <option value="">Choose…</option>
            {ordered.map((s) => <option key={s.id} value={s.id}>{s.subjects?.name} ({s.classes?.name}) · {WEEKDAYS.find((w) => w.value === s.weekday)?.short} {timeLabel(s.start_time)}</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium text-ink/70">Date
          <input type="date" value={date} min={ukIsoDate()} onChange={(e) => setDate(e.target.value)} className={fieldCls} aria-invalid={dayMismatch || undefined} />
          {dayMismatch && slot && <span className="mt-1 block text-xs text-amber-800">That date is not a {WEEKDAYS.find((w) => w.value === slot.weekday)?.label}.</span>}
        </label>
        <label className="block text-xs font-medium text-ink/70">Covering teacher
          <select value={coveringTeacher} onChange={(e) => setCoveringTeacher(e.target.value)} className={fieldCls}>
            <option value="">Choose…</option>
            {teachers.filter((t) => t.id !== slot?.teacher_user_id).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium text-ink/70">Reason (optional)
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={fieldCls} />
        </label>
      </div>
      <button type="button" onClick={assign} disabled={busy} className={`${btn} mt-3`}>{busy ? "Assigning…" : "Assign cover"}</button>
    </div>
  );
}
