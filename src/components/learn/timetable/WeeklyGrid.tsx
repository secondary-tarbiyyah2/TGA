"use client";

import { WEEKDAYS, PERIODS, type TimetableSlot } from "@/lib/learn/timetable";
import { classColour, hhmm, type Teacher } from "./types";

/**
 * Days across, times down. Every slot is a coloured block (colour = class).
 * Click a block to edit it; click "+" in an empty cell to add one (only
 * when editable). On a phone the grid scrolls sideways inside its card.
 */
export function WeeklyGrid({
  slots,
  teachers,
  editable,
  onEdit,
  onAdd,
}: {
  slots: TimetableSlot[];
  teachers: Teacher[];
  editable: boolean;
  onEdit: (slot: TimetableSlot) => void;
  onAdd: (weekday: number, start: string, end: string) => void;
}) {
  const rows = new Map<string, string>(); // start -> end
  for (const p of PERIODS) rows.set(p.start, p.end);
  for (const s of slots) {
    const st = hhmm(s.start_time);
    if (!rows.has(st)) rows.set(st, hhmm(s.end_time));
  }
  const ordered = [...rows.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const nameOf = (id: string) => teachers.find((t) => t.id === id)?.full_name || "Teacher";

  return (
    <div className="overflow-x-auto rounded-xl border border-gold-light/50">
      <table className="w-full min-w-[720px] table-fixed border-collapse text-left text-sm">
        <thead>
          <tr className="bg-cream/70">
            <th className="w-20 border-b border-gold-light/50 p-2 text-xs font-semibold text-ink/60">Time</th>
            {WEEKDAYS.map((wd) => (
              <th key={wd.value} className="border-b border-l border-gold-light/40 p-2 text-xs font-semibold text-ink/70">
                {wd.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map(([start, end]) => (
            <tr key={start}>
              <td className="border-b border-gold-light/30 p-2 align-top text-xs tabular-nums text-ink/60">
                {start}
                <br />
                <span className="text-ink/40">{end}</span>
              </td>
              {WEEKDAYS.map((wd) => {
                const cell = slots.filter((s) => s.weekday === wd.value && hhmm(s.start_time) === start);
                return (
                  <td key={wd.value} className="h-20 border-b border-l border-gold-light/30 p-1 align-top">
                    <div className="flex flex-col gap-1">
                      {cell.map((s) => {
                        const c = classColour(s.class_id);
                        const inner = (
                          <>
                            <span className="block truncate text-xs font-semibold">{s.classes?.name || "Class"}</span>
                            <span className="block truncate text-[11px] opacity-80">{s.subjects?.name}</span>
                            <span className="block truncate text-[11px] opacity-70">{nameOf(s.teacher_user_id)}</span>
                          </>
                        );
                        const style = { backgroundColor: c.bg, borderColor: c.border, color: c.text };
                        return editable ? (
                          <button key={s.id} type="button" onClick={() => onEdit(s)} style={style} className="w-full rounded-lg border-l-4 px-2 py-1 text-left transition hover:shadow-md focus-visible:outline focus-visible:outline-2" aria-label={`Edit ${s.classes?.name} ${WEEKDAYS.find((w) => w.value === s.weekday)?.label} ${start}`}>
                            {inner}
                          </button>
                        ) : (
                          <div key={s.id} style={style} className="rounded-lg border-l-4 px-2 py-1">
                            {inner}
                          </div>
                        );
                      })}
                      {editable && (
                        <button type="button" onClick={() => onAdd(wd.value, start, end)} aria-label={`Add a lesson ${wd.label} ${start}`} className="rounded-lg border border-dashed border-gold-light/70 py-0.5 text-xs text-ink/35 hover:bg-cream hover:text-ink/70">
                          +
                        </button>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
