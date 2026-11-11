"use client";

import { useEffect, useRef, useState } from "react";
import { WEEKDAYS, lessonPeriods, type TimetableSlot } from "@/lib/learn/timetable";
import { DEFAULT_LESSON, MIN_LESSON, SNAP, bandOnDay, buildBands, fmt, laneLayout, snap, timeRange, toMin } from "./gridShared";
import { classColour, hhmm, moveProblem, type LockableSlot } from "./types";
import type { GridProps } from "./WeeklyGrid";

/** What each row of the grid is: one day (time runs across), or one class or teacher (the five days sit side by side). */
export type RowsBy = "day" | "class" | "teacher";

const LABEL_W = 112; // px, sticky row labels
const LANE_H = 40; // px, one line of lessons in a row
const ROW_PAD = 3;
const SEG_GAP = 10; // px between days when the days sit side by side

type Row = { key: string; label: string; sub?: string; weekday?: number; slots: TimetableSlot[]; lanes: Map<string, { lane: number; lanes: number }>; laneCount: number; top: number; height: number };

type Drag = {
  id: string;
  mode: "move" | "resize";
  x0: number;
  y0: number;
  grab: number; // minutes between the block's start and the pointer
  weekday0: number;
  start0: number;
  end0: number;
  moved: boolean;
  cur: { weekday: number; start: number; end: number };
};

const yearOrder = (y: string | undefined) => {
  const n = parseInt(String(y ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 99;
};

/**
 * Time runs left to right, so a whole school week reads across the screen
 * instead of down it. "class" and "teacher" give one compact row each with
 * Monday to Friday side by side (the classic school master timetable);
 * "day" gives five rows, one per day, for a single class or teacher.
 * Drag a lesson sideways to change its time (and day), drag its right edge to
 * change its length, click it to edit, click an empty spot to add a lesson.
 */
export function RowsGrid({
  slots,
  teachers,
  editable,
  onEdit,
  onAdd,
  onMove,
  allSlots,
  colourOf,
  flagged,
  moveNotes,
  breaks,
  periods,
  rowsBy: wanted,
  pxPerMin,
}: GridProps & { rowsBy: RowsBy; pxPerMin: number }) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveNote, setMoveNote] = useState<string | null>(null);
  const [hover, setHover] = useState<{ weekday: number; min: number; y: number } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
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

  // With no lessons yet there are no class rows: show the days so lessons can be added.
  const rowsBy: RowsBy = wanted !== "day" && slots.length === 0 ? "day" : wanted;
  const byDay = rowsBy === "day";
  const ppm = pxPerMin;
  const { lo, hi } = timeRange(periods, slots);
  const segW = (hi - lo) * ppm;
  const days = WEEKDAYS.map((w) => w.value);
  const segIndex = (weekday: number) => (byDay ? 0 : Math.max(0, days.indexOf(weekday)));
  const segX = (i: number) => i * (segW + SEG_GAP);
  const xOf = (weekday: number, m: number) => segX(segIndex(weekday)) + (m - lo) * ppm;
  const trackW = byDay ? segW : days.length * segW + (days.length - 1) * SEG_GAP;
  const hours: number[] = [];
  for (let m = lo; m <= hi; m += 60) hours.push(m);
  const bands = buildBands(periods, breaks);
  const nameOf = (id: string) => teachers.find((t) => t.id === id)?.full_name || "Teacher";

  // Rows.
  const rows: Row[] = [];
  const pushRow = (key: string, label: string, rowSlots: TimetableSlot[], extra: Partial<Row> = {}) => {
    const lanes = new Map<string, { lane: number; lanes: number }>();
    for (const d of days) for (const [k, v] of laneLayout(rowSlots.filter((s) => s.weekday === d))) lanes.set(k, v);
    const laneCount = Math.max(1, ...[...lanes.values()].map((v) => v.lanes));
    const top = rows.length ? rows[rows.length - 1].top + rows[rows.length - 1].height : 0;
    rows.push({ key, label, slots: rowSlots, lanes, laneCount, top, height: laneCount * LANE_H + ROW_PAD * 2, ...extra });
  };
  if (byDay) {
    for (const wd of WEEKDAYS) pushRow(String(wd.value), wd.label, slots.filter((s) => s.weekday === wd.value), { weekday: wd.value });
  } else if (rowsBy === "class") {
    const ids = [...new Set(slots.map((s) => s.class_id))];
    const info = (id: string) => slots.find((s) => s.class_id === id)?.classes;
    ids.sort((a, b) => yearOrder(info(a)?.year_group) - yearOrder(info(b)?.year_group) || String(info(a)?.name).localeCompare(String(info(b)?.name)));
    for (const id of ids) pushRow(id, info(id)?.name || "Class", slots.filter((s) => s.class_id === id), { sub: info(id)?.year_group ? `Year ${String(info(id)?.year_group).replace(/^y(ear)?\s*/i, "")}` : undefined });
  } else {
    const ids = [...new Set(slots.map((s) => s.teacher_user_id))].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    for (const id of ids) pushRow(id, nameOf(id), slots.filter((s) => s.teacher_user_id === id));
  }
  const totalH = rows.length ? rows[rows.length - 1].top + rows[rows.length - 1].height : LANE_H;
  const rowOf = (s: TimetableSlot) => rows.find((r) => (byDay ? r.weekday === s.weekday : rowsBy === "class" ? r.key === s.class_id : r.key === s.teacher_user_id));

  /** Pointer -> (weekday, minute, row). */
  const pointAt = (clientX: number, clientY: number, fixedWeekday?: number) => {
    const el = trackRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const row = rows.find((rw) => y >= rw.top && y < rw.top + rw.height) || (y < 0 ? rows[0] : rows[rows.length - 1]);
    let weekday: number;
    if (fixedWeekday !== undefined) weekday = fixedWeekday;
    else if (byDay) weekday = row?.weekday ?? days[0];
    else weekday = days[Math.min(days.length - 1, Math.max(0, Math.floor((x + SEG_GAP / 2) / (segW + SEG_GAP))))];
    const minute = Math.max(lo, Math.min(hi, lo + (x - segX(segIndex(weekday))) / ppm));
    return { weekday, minute, row, y };
  };

  const compute = (d: Drag, cx: number, cy: number): Drag["cur"] => {
    if (d.mode === "resize") {
      const p = pointAt(cx, cy, d.weekday0);
      const end = p ? Math.min(hi, Math.max(d.start0 + MIN_LESSON, snap(p.minute))) : d.end0;
      return { weekday: d.weekday0, start: d.start0, end };
    }
    const p = pointAt(cx, cy);
    if (!p) return { weekday: d.weekday0, start: d.start0, end: d.end0 };
    const dur = d.end0 - d.start0;
    const start = Math.min(hi - dur, Math.max(lo, snap(p.minute - d.grab)));
    return { weekday: p.weekday, start, end: start + dur };
  };

  const begin = (e: React.PointerEvent, s: TimetableSlot, mode: "move" | "resize") => {
    if (!canDrag || e.button > 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const start0 = toMin(s.start_time);
    const p = pointAt(e.clientX, e.clientY, s.weekday);
    const d: Drag = { id: s.id, mode, x0: e.clientX, y0: e.clientY, grab: p ? p.minute - start0 : 0, weekday0: s.weekday, start0, end0: toMin(s.end_time), moved: false, cur: { weekday: s.weekday, start: start0, end: toMin(s.end_time) } };
    dragRef.current = d;
    setDrag(d);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 4 && Math.abs(e.clientY - d.y0) < 4) return;
    const next = { ...d, moved: true, cur: compute(d, e.clientX, e.clientY) };
    dragRef.current = next;
    setDrag(next);
  };

  const finish = async (e: React.PointerEvent, s: TimetableSlot, cancelled: boolean) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d || cancelled) return;
    if (!d.moved) {
      onEdit(s); // a click, not a drag
      return;
    }
    const cur = compute(d, e.clientX, e.clientY);
    if ((cur.weekday === d.weekday0 && cur.start === d.start0 && cur.end === d.end0) || !onMove) return;
    const start = fmt(cur.start);
    const end = fmt(cur.end);
    setMoveNote(null);
    const problem = moveProblem(s, cur.weekday, start, end, universe);
    if (problem) return fail(`Can't ${d.mode === "resize" ? "change that" : "move there"}: ${problem}`);
    const notes = moveNotes ? moveNotes(s, cur.weekday, start, end) : [];
    const err = await onMove(s, cur.weekday, start, end);
    if (err) return fail(`${d.mode === "resize" ? "Change" : "Move"} failed: ${err}`);
    setMoveNote(notes.length ? `Saved, but note: ${notes.join(" ")}` : null);
  };

  // Clicking an empty spot inside a lesson period adds a lesson for exactly that period.
  const lessonBlocks = lessonPeriods(periods).map((p) => ({ start: toMin(p.start), end: toMin(p.end), weekdays: p.weekdays }));
  const addRange = (weekday: number, minute: number) => {
    const hit = lessonBlocks.find((p) => p.weekdays.includes(weekday) && minute >= p.start && minute < p.end);
    if (hit) return { start: hit.start, end: hit.end };
    const start = Math.max(lo, Math.min(hi - MIN_LESSON, snap(minute)));
    return { start, end: Math.min(hi, start + DEFAULT_LESSON) };
  };

  const preview = drag && drag.moved ? drag : null;
  const previewSlot = preview ? universe.find((s) => s.id === preview.id) || null : null;
  const previewOk = preview && previewSlot ? moveProblem(previewSlot, preview.cur.weekday, fmt(preview.cur.start), fmt(preview.cur.end), universe) === null : true;
  const previewRow = preview && previewSlot ? (byDay ? rows.find((r) => r.weekday === preview.cur.weekday) : rowOf(previewSlot)) : null;
  const segs = byDay ? [days[0]] : days;
  const headH = byDay ? 26 : 46;

  return (
    <div data-guide="timetable-grid">
      {moveNote && !moveError && <p role="status" className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{moveNote}</p>}
      {moveError && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{moveError}</p>}
      {!editable && slots.length > 0 && <p className="mb-2 text-xs text-ink/65">Locked: only draft timetables can be changed or dragged.</p>}
      <div className="overflow-x-auto rounded-xl border border-gold-light/50 bg-white">
        <div style={{ width: LABEL_W + trackW + 8 }}>
          {/* Header: day names (when days sit side by side) and hours. */}
          <div className="flex border-b border-gold-light/50 bg-cream/70 text-xs text-ink/70">
            <div style={{ width: LABEL_W, height: headH }} className="sticky left-0 z-20 flex items-end border-r border-gold-light/50 bg-cream px-2 pb-1 font-semibold text-ink/65">
              {byDay ? "Day" : rowsBy === "class" ? "Class" : "Teacher"}
            </div>
            <div className="relative" style={{ width: trackW, height: headH }}>
              {segs.map((wd) => (
                <div key={wd} className="absolute top-0" style={{ left: segX(segIndex(wd)), width: segW, height: headH }}>
                  {!byDay && <div className="border-b border-gold-light/40 px-1.5 py-0.5 font-semibold text-ink/80">{WEEKDAYS.find((w) => w.value === wd)?.label}</div>}
                  {hours.map((m) => (
                    <span key={m} className="absolute bottom-0.5 -translate-x-1/2 text-[10px] tabular-nums text-ink/65" style={{ left: Math.min(segW - 12, Math.max(12, (m - lo) * ppm)) }}>
                      {fmt(m)}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="flex">
            {/* Row labels stay in view while the week scrolls sideways. */}
            <div className="sticky left-0 z-20 border-r border-gold-light/50 bg-white" style={{ width: LABEL_W, height: totalH }}>
              {rows.map((r) => (
                <div key={r.key} className="flex flex-col justify-center border-b border-gold-light/30 px-2" style={{ height: r.height }}>
                  <span className="truncate text-xs font-semibold text-ink" title={r.label}>{r.label}</span>
                  {r.sub && <span className="truncate text-[10px] text-ink/60">{r.sub}</span>}
                </div>
              ))}
            </div>

            <div
              ref={trackRef}
              className="relative select-none"
              style={{ width: trackW, height: totalH }}
              onPointerMove={(e) => {
                onPointerMove(e);
                if (!editable || dragRef.current) return;
                const p = pointAt(e.clientX, e.clientY);
                if (!p || !p.row) return;
                const m = Math.max(lo, Math.min(hi - SNAP, snap(p.minute)));
                setHover((h) => (h && h.weekday === p.weekday && h.min === m && h.y === p.row!.top ? h : { weekday: p.weekday, min: m, y: p.row!.top }));
              }}
              onPointerLeave={() => setHover(null)}
              onClick={
                editable
                  ? (e) => {
                      if (!(e.target as HTMLElement).dataset.bg) return;
                      const p = pointAt(e.clientX, e.clientY);
                      if (!p) return;
                      const r = addRange(p.weekday, p.minute);
                      onAdd(p.weekday, fmt(r.start), fmt(r.end));
                    }
                  : undefined
              }
            >
              {/* Day backgrounds, breaks and hour lines, per row. */}
              {rows.map((r, ri) =>
                (byDay ? [r.weekday as number] : days).map((wd) => (
                  <div key={`${r.key}-${wd}`} data-bg="1" className={`absolute border-b border-gold-light/30 ${ri % 2 ? "bg-cream/25" : ""}`} style={{ left: segX(segIndex(wd)), width: segW, top: r.top, height: r.height }}>
                    {bands
                      .filter((b) => bandOnDay(b, wd))
                      .map((b, bi) => (
                        <div key={bi} data-bg="1" title={`${b.label} ${fmt(b.start)}-${fmt(b.end)}`} className={`absolute inset-y-0 overflow-hidden ${b.className}`} style={{ left: (b.start - lo) * ppm, width: Math.max(3, (b.end - b.start) * ppm) }}>
                          {ri === 0 && (b.end - b.start) * ppm > 34 && <span className="block truncate px-0.5 text-[9px] leading-3">{b.label}</span>}
                        </div>
                      ))}
                    {hours.map((m) => (
                      <div key={m} className="pointer-events-none absolute inset-y-0 border-l border-gold-light/35" style={{ left: (m - lo) * ppm }} />
                    ))}
                  </div>
                )),
              )}

              {hover && !drag && editable && (
                <div className="pointer-events-none absolute border-l border-dashed border-teal-600/70" style={{ left: xOf(hover.weekday, hover.min), top: hover.y, height: LANE_H }}>
                  <span className="absolute -top-0.5 left-1 rounded bg-white/90 px-1 text-[10px] text-teal-700">+ {fmt(hover.min)}</span>
                </div>
              )}

              {/* Lessons. */}
              {rows.flatMap((r) =>
                r.slots.map((s) => {
                  const c = colourOf ? colourOf(s) : classColour(s.class_id);
                  const st = toMin(s.start_time);
                  const en = toMin(s.end_time);
                  const lane = r.lanes.get(s.id)?.lane ?? 0;
                  const w = Math.max(14, (en - st) * ppm - 2);
                  const style = {
                    left: xOf(s.weekday, st) + 1,
                    width: w,
                    top: r.top + ROW_PAD + lane * LANE_H,
                    height: LANE_H - 3,
                    backgroundColor: c.bg,
                    borderColor: c.border,
                    color: c.text,
                    touchAction: canDrag ? ("none" as const) : undefined,
                  };
                  const ring = flagged?.has(s.id) ? " ring-2 ring-red-500" : "";
                  const dragging = drag?.id === s.id && drag.moved;
                  const line1 = rowsBy === "class" ? s.subjects?.name || "Lesson" : s.classes?.name || "Class";
                  const line2 = rowsBy === "class" ? `${hhmm(s.start_time)} ${nameOf(s.teacher_user_id)}` : `${s.subjects?.name || ""} ${hhmm(s.start_time)}`;
                  const full = `${s.classes?.name || "Class"} · ${s.subjects?.name || ""} · ${WEEKDAYS.find((x) => x.value === s.weekday)?.label} ${hhmm(s.start_time)}-${hhmm(s.end_time)} · ${nameOf(s.teacher_user_id)}${(s as LockableSlot).locked ? " · fixed" : ""}`;
                  const inner = (
                    <>
                      <span className="block truncate text-[11px] font-semibold leading-4">{line1}</span>
                      {w >= 44 && <span className="block truncate text-[10px] leading-3 opacity-80">{line2}</span>}
                    </>
                  );
                  if (!editable) {
                    return (
                      <div key={s.id} style={style} title={full} className={`absolute overflow-hidden rounded-md border-t-4 px-1 py-0.5${ring}`}>
                        {inner}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      title={full}
                      aria-label={`Edit ${full}`}
                      style={style}
                      className={`absolute overflow-hidden rounded-md border-t-4 px-1 py-0.5 text-left shadow-sm transition-shadow hover:z-10 hover:shadow-md focus-visible:outline focus-visible:outline-2 ${canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${dragging ? "opacity-30" : ""}${ring}`}
                      onPointerDown={(e) => begin(e, s, "move")}
                      onPointerUp={(e) => void finish(e, s, false)}
                      onPointerCancel={(e) => void finish(e, s, true)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onEdit(s);
                        }
                      }}
                    >
                      {inner}
                      {canDrag && <span aria-hidden="true" title="Drag to change the length" className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-black/10" onPointerDown={(e) => begin(e, s, "resize")} />}
                    </div>
                  );
                }),
              )}

              {preview && previewRow && (
                <div
                  className={`pointer-events-none absolute z-30 rounded-md border-2 px-1 text-[10px] font-semibold ${previewOk ? "border-green-500 bg-green-100/85 text-green-900" : "border-red-500 bg-red-100/85 text-red-900"}`}
                  style={{ left: xOf(preview.cur.weekday, preview.cur.start), width: Math.max(14, (preview.cur.end - preview.cur.start) * ppm - 2), top: previewRow.top + ROW_PAD, height: LANE_H - 3 }}
                >
                  {!byDay && `${WEEKDAYS.find((w) => w.value === preview.cur.weekday)?.short} `}
                  {fmt(preview.cur.start)}-{fmt(preview.cur.end)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
