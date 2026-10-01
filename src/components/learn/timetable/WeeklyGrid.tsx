"use client";

import { useEffect, useRef, useState } from "react";
import { WEEKDAYS, PERIODS, type TimetableSlot } from "@/lib/learn/timetable";
import { classColour, hhmm, moveProblem, type Colour, type Teacher } from "./types";

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
  onMove,
  allSlots,
  colourOf,
  flagged,
}: {
  slots: TimetableSlot[];
  /** Every slot in the run: clash checks use this even when `slots` is a filtered view. */
  allSlots?: TimetableSlot[];
  /** Block colour; defaults to one colour per class. */
  colourOf?: (slot: TimetableSlot) => Colour;
  /** Slot ids with a warning: drawn with a red outline. */
  flagged?: Set<string>;
  teachers: Teacher[];
  editable: boolean;
  onEdit: (slot: TimetableSlot) => void;
  onAdd: (weekday: number, start: string, end: string) => void;
  /** Persist a drag-move; resolve with an error message, or null on success. */
  onMove?: (slot: TimetableSlot, weekday: number, start: string, end: string) => Promise<string | null>;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ key: string; ok: boolean } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const universe = allSlots ?? slots;
  const canDrag = editable && Boolean(onMove);
  const fail = (msg: string) => {
    setMoveError(msg);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMoveError(null), 5000);
  };
  const dragging = dragId ? universe.find((s) => s.id === dragId) || null : null;
  const endDrag = () => {
    setDragId(null);
    setOver(null);
  };
  const drop = async (weekday: number, start: string, end: string) => {
    const slot = dragging;
    endDrag();
    if (!slot || !onMove) return;
    if (slot.weekday === weekday && hhmm(slot.start_time) === start) return;
    const problem = moveProblem(slot, weekday, start, end, universe);
    if (problem) return fail(`Can't move there: ${problem}`);
    const err = await onMove(slot, weekday, start, end);
    if (err) fail(`Move failed: ${err}`);
  };

  const rows = new Map<string, string>(); // start -> end
  for (const p of PERIODS) rows.set(p.start, p.end);
  for (const s of slots) {
    const st = hhmm(s.start_time);
    if (!rows.has(st)) rows.set(st, hhmm(s.end_time));
  }
  const ordered = [...rows.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const nameOf = (id: string) => teachers.find((t) => t.id === id)?.full_name || "Teacher";

  return (
    <div>
    {moveError && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{moveError}</p>}
    {!editable && slots.length > 0 && <p className="mb-2 text-xs text-ink/50">Locked: only draft timetables can be changed or dragged.</p>}
    {canDrag && slots.length > 0 && <p className="mb-2 text-xs text-ink/50">Tip: drag a lesson to another day or time to move it.</p>}
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
                const cellKey = `${wd.value}-${start}`;
                const hot = over && over.key === cellKey ? over : null;
                const hotClass = hot ? (hot.ok ? "bg-green-100 outline outline-2 -outline-offset-2 outline-green-500" : "bg-red-100 outline outline-2 -outline-offset-2 outline-red-500") : "";
                return (
                  <td
                    key={wd.value}
                    className={`h-20 border-b border-l border-gold-light/30 p-1 align-top ${hotClass}`}
                    onDragOver={
                      canDrag && dragging
                        ? (e) => {
                            e.preventDefault();
                            const ok = moveProblem(dragging, wd.value, start, end, universe) === null;
                            e.dataTransfer.dropEffect = ok ? "move" : "none";
                            if (!over || over.key !== cellKey || over.ok !== ok) setOver({ key: cellKey, ok });
                          }
                        : undefined
                    }
                    onDragLeave={canDrag ? () => setOver((o) => (o && o.key === cellKey ? null : o)) : undefined}
                    onDrop={
                      canDrag
                        ? (e) => {
                            e.preventDefault();
                            void drop(wd.value, start, end);
                          }
                        : undefined
                    }
                  >
                    <div className="flex flex-col gap-1">
                      {cell.map((s) => {
                        const c = colourOf ? colourOf(s) : classColour(s.class_id);
                        const inner = (
                          <>
                            <span className="block truncate text-xs font-semibold">{s.classes?.name || "Class"}</span>
                            <span className="block truncate text-[11px] opacity-80">{s.subjects?.name}</span>
                            <span className="block truncate text-[11px] opacity-70">{nameOf(s.teacher_user_id)}</span>
                          </>
                        );
                        const style = { backgroundColor: c.bg, borderColor: c.border, color: c.text };
                        const ring = flagged?.has(s.id) ? " ring-2 ring-red-500" : "";
                        return editable ? (
                          <div
                            key={s.id}
                            draggable={canDrag}
                            onDragStart={
                              canDrag
                                ? (e) => {
                                    e.dataTransfer.effectAllowed = "move";
                                    e.dataTransfer.setData("text/plain", s.id);
                                    setDragId(s.id);
                                  }
                                : undefined
                            }
                            onDragEnd={canDrag ? endDrag : undefined}
                            className={canDrag ? `cursor-grab active:cursor-grabbing ${dragId === s.id ? "opacity-40" : ""}` : undefined}
                          >
                            <button type="button" onClick={() => onEdit(s)} style={style} className={`w-full rounded-lg border-l-4 px-2 py-1 text-left transition hover:shadow-md focus-visible:outline focus-visible:outline-2${ring}`} aria-label={`Edit ${s.classes?.name} ${WEEKDAYS.find((w) => w.value === s.weekday)?.label} ${start}`}>
                              {inner}
                            </button>
                          </div>
                        ) : (
                          <div key={s.id} style={style} className={`rounded-lg border-l-4 px-2 py-1${ring}`} title="Locked: make an editable draft to change this lesson">
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
    </div>
  );
}
