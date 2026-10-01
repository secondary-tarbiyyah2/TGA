"use client";

import { useState } from "react";
import { edgeErrorMessage } from "@/lib/learn/edge";
import { WEEKDAYS, timeLabel, type TimetableSlot } from "@/lib/learn/timetable";
import { callFunction, btn, fieldCls } from "./api";
import type { Teacher } from "./types";

/** Assign a covering teacher for one dated lesson. */
export function CoverForm({ slots, teachers, onDone }: { slots: TimetableSlot[]; teachers: Teacher[]; onDone: () => void }) {
  const [slotId, setSlotId] = useState("");
  const [date, setDate] = useState("");
  const [coveringTeacher, setCoveringTeacher] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const assign = async () => {
    if (!slotId || !date || !coveringTeacher) return setMessage("Choose the lesson, the date and the covering teacher.");
    const result = await callFunction("timetable-cover", { slot_id: slotId, cover_date: date, covering_teacher_user_id: coveringTeacher, reason });
    if (!result.ok) return setMessage(`Could not assign cover: ${edgeErrorMessage(result)}`);
    setMessage("Cover assigned.");
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
            {slots.map((s) => <option key={s.id} value={s.id}>{s.subjects?.name} ({s.classes?.name}) — {WEEKDAYS.find((w) => w.value === s.weekday)?.short} {timeLabel(s.start_time)}</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium text-ink/70">Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
        </label>
        <label className="block text-xs font-medium text-ink/70">Covering teacher
          <select value={coveringTeacher} onChange={(e) => setCoveringTeacher(e.target.value)} className={fieldCls}>
            <option value="">Choose…</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium text-ink/70">Reason (optional)
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={fieldCls} />
        </label>
      </div>
      <button type="button" onClick={assign} className={`${btn} mt-3`}>Assign cover</button>
    </div>
  );
}
