"use client";

import { useEffect, useRef, useState } from "react";
import { WEEKDAYS, lessonPeriods, type TimetablePeriod, type TimetableSlot } from "@/lib/learn/timetable";
import { DEFAULT_LESSON, MIN_LESSON, SNAP, bandOnDay, buildBands, fmt, laneLayout, snap, timeRange, toMin, type GridBreak } from "./gridShared";
import { RowsGrid } from "./RowsGrid";
import { chipCls } from "./api";
import { classColour, hhmm, moveProblem, type Colour, type LockableSlot, type Teacher } from "./types";

const PX_PER_MIN = 1.15; // vertical scale: 60 min = 69px
const GUTTER = 56; // px, time labels
const MIN_LANE_PX = 72; // narrowest a lesson block gets before the grid scrolls sideways

type Drag = {
  id: string;
  mode: "move" | "resize";
  x0: number;
  y0: number;
  weekday0: number;
  start0: number;
  end0: number;
  moved: boolean;
  cur: { weekday: number; start: number; end: number };
};

export type GridProps = {
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
  /** Persist a drag-move/resize; resolve with an error message, or null on success. */
  onMove?: (slot: TimetableSlot, weekday: number, start: string, end: string) => Promise<string | null>;
  /** Non-blocking warnings for a move (availability, protected time, load); shown after it is saved. */
  moveNotes?: (slot: TimetableSlot, weekday: number, start: string, end: string) => string[];
  /** Extra shaded bands (protected times such as prayer or lunch). */
  breaks?: GridBreak[];
  /** The school day's stored periods. Their non-lesson blocks (break, lunch, prayer, enrichment) are drawn as bands; with none, the built-in day's blocks are drawn. */
  periods?: TimetablePeriod[];
};

/**
 * Days across, a continuous time axis down (to the minute). Lessons are
 * coloured blocks sized by their length: drag a block anywhere (it snaps to
 * 5 minutes), drag its bottom edge to change the length, click it to edit,
 * click an empty spot to add a lesson there. Gaps between the standard
 * periods show as breaks, and protected times (prayer, lunch...) are
 * shaded. On a phone the grid scrolls sideways inside its card.
 */
function ColumnsGrid({
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
}: GridProps) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveNote, setMoveNote] = useState<string | null>(null);
  const [hover, setHover] = useState<{ weekday: number; min: number } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
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

  const { lo, hi } = timeRange(periods, slots);
  const height = (hi - lo) * PX_PER_MIN;
  const yOf = (m: number) => (m - lo) * PX_PER_MIN;
  const hours: number[] = [];
  for (let m = lo; m <= hi; m += 60) hours.push(m);

  const bands = buildBands(periods, breaks);

  const nameOf = (id: string) => teachers.find((t) => t.id === id)?.full_name || "Teacher";

  // Clicking an empty spot inside a lesson period adds a lesson for exactly that period.
  const lessonBlocks = lessonPeriods(periods).map((p) => ({ start: toMin(p.start), end: toMin(p.end), weekdays: p.weekdays }));
  const addRange = (weekday: number, minute: number): { start: number; end: number } => {
    const hit = lessonBlocks.find((p) => p.weekdays.includes(weekday) && minute >= p.start && minute < p.end);
    if (hit) return { start: hit.start, end: hit.end };
    const start = Math.max(lo, Math.min(hi - MIN_LESSON, snap(minute)));
    return { start, end: Math.min(hi, start + DEFAULT_LESSON) };
  };
  const lanesByDay = new Map(WEEKDAYS.map((wd) => [wd.value, laneLayout(slots.filter((s) => s.weekday === wd.value))]));
  const maxLanes = Math.max(1, ...[...lanesByDay.values()].flatMap((m) => [...m.values()].map((v) => v.lanes)));
  const minGridWidth = Math.max(720, GUTTER + WEEKDAYS.length * Math.max(132, maxLanes * MIN_LANE_PX));

  const geometry = () => {
    const el = bodyRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left + GUTTER, colW: (r.width - GUTTER) / WEEKDAYS.length };
  };

  const slotById = (id: string) => universe.find((s) => s.id === id) || null;

  const compute = (d: Drag, clientX: number, clientY: number): Drag["cur"] => {
    const dy = clientY - d.y0;
    const dMin = Math.round(dy / PX_PER_MIN / SNAP) * SNAP;
    if (d.mode === "resize") {
      const end = Math.min(hi, Math.max(d.start0 + MIN_LESSON, d.end0 + dMin));
      return { weekday: d.weekday0, start: d.start0, end };
    }
    const dur = d.end0 - d.start0;
    const start = Math.min(hi - dur, Math.max(lo, d.start0 + dMin));
    let weekday = d.weekday0;
    const g = geometry();
    if (g) {
      const col = Math.floor((clientX - g.left) / g.colW);
      weekday = WEEKDAYS[Math.min(WEEKDAYS.length - 1, Math.max(0, col))].value;
    }
    return { weekday, start, end: start + dur };
  };

  const begin = (e: React.PointerEvent, s: TimetableSlot, mode: "move" | "resize") => {
    if (!canDrag || e.button > 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const d: Drag = {
      id: s.id,
      mode,
      x0: e.clientX,
      y0: e.clientY,
      weekday0: s.weekday,
      start0: toMin(s.start_time),
      end0: toMin(s.end_time),
      moved: false,
      cur: { weekday: s.weekday, start: toMin(s.start_time), end: toMin(s.end_time) },
    };
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
    const unchanged = cur.weekday === d.weekday0 && cur.start === d.start0 && cur.end === d.end0;
    if (unchanged || !onMove) return;
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

  const minuteAt = (clientY: number) => {
    const el = bodyRef.current;
    if (!el) return lo;
    const top = el.getBoundingClientRect().top + 0; // body (below header)
    return lo + (clientY - top) / PX_PER_MIN;
  };

  const preview = drag && drag.moved ? drag : null;
  const previewSlot = preview ? slotById(preview.id) : null;
  const previewOk = preview && previewSlot ? moveProblem(previewSlot, preview.cur.weekday, fmt(preview.cur.start), fmt(preview.cur.end), universe) === null : true;

  return (
    <div data-guide="timetable-grid">
      {moveNote && !moveError && <p role="status" className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{moveNote}</p>}
      {moveError && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{moveError}</p>}
      {!editable && slots.length > 0 && <p className="mb-2 text-xs text-ink/65">Locked: only draft timetables can be changed or dragged.</p>}
      <div className="overflow-x-auto rounded-xl border border-gold-light/50">
        <div style={{ minWidth: minGridWidth }}>
          <div className="flex bg-cream/70 text-xs font-semibold text-ink/70">
            <div style={{ width: GUTTER }} className="border-b border-gold-light/50 p-2 text-ink/65">Time</div>
            {WEEKDAYS.map((wd) => (
              <div key={wd.value} className="flex-1 border-b border-l border-gold-light/40 p-2">{wd.label}</div>
            ))}
          </div>
          <div ref={bodyRef} className="relative select-none" style={{ height }} onPointerMove={onPointerMove}>
            {/* hour lines + labels */}
            {hours.map((m) => (
              <div key={m} className="pointer-events-none absolute left-0 right-0 border-t border-gold-light/40" style={{ top: yOf(m) }}>
                <span className="absolute left-2 -translate-y-1/2 bg-white px-0.5 text-[11px] tabular-nums text-ink/65">{fmt(m)}</span>
              </div>
            ))}
            {WEEKDAYS.map((wd, i) => {
              const left = `calc(${GUTTER}px + (100% - ${GUTTER}px) * ${i} / ${WEEKDAYS.length})`;
              const width = `calc((100% - ${GUTTER}px) / ${WEEKDAYS.length})`;
              const daySlots = slots.filter((s) => s.weekday === wd.value);
              const lanes = lanesByDay.get(wd.value);
              return (
                <div
                  key={wd.value}
                  className="absolute top-0 border-l border-gold-light/40"
                  style={{ left, width, height }}
                  onPointerMove={
                    editable
                      ? (e) => {
                          if (dragRef.current) return;
                          const m = Math.max(lo, Math.min(hi - SNAP, snap(minuteAt(e.clientY))));
                          setHover((h) => (h && h.weekday === wd.value && h.min === m ? h : { weekday: wd.value, min: m }));
                        }
                      : undefined
                  }
                  onPointerLeave={() => setHover(null)}
                  onClick={
                    editable
                      ? (e) => {
                          if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.bg) return;
                          const r = addRange(wd.value, minuteAt(e.clientY));
                          onAdd(wd.value, fmt(r.start), fmt(r.end));
                        }
                      : undefined
                  }
                >
                  {bands
                    .filter((b) => bandOnDay(b, wd.value))
                    .map((b, bi) => (
                      <div
                        key={bi}
                        data-bg="1"
                        title={`${b.label} ${fmt(b.start)}-${fmt(b.end)}`}
                        className={`absolute left-0 right-0 overflow-hidden px-1 text-[10px] ${b.className}`}
                        style={{ top: yOf(b.start), height: Math.max(8, (b.end - b.start) * PX_PER_MIN) }}
                      >
                        {b.label}
                      </div>
                    ))}
                  {hover && hover.weekday === wd.value && !drag && editable && (
                    <div data-bg="1" className="pointer-events-none absolute left-1 right-1 border-t border-dashed border-teal-600/60" style={{ top: yOf(hover.min) }}>
                      <span className="absolute -top-2 right-0 rounded bg-white/90 px-1 text-[10px] text-teal-700">+ {fmt(hover.min)}</span>
                    </div>
                  )}
                  {daySlots.map((s) => {
                    const c = colourOf ? colourOf(s) : classColour(s.class_id);
                    const st = toMin(s.start_time);
                    const en = toMin(s.end_time);
                    const lane = lanes?.get(s.id) || { lane: 0, lanes: 1 };
                    const style = {
                      left: `calc(${lane.lane} * (100% - 8px) / ${lane.lanes} + 4px)`,
                      width: `calc((100% - 8px) / ${lane.lanes} - ${lane.lanes > 1 ? 2 : 0}px)`,
                      backgroundColor: c.bg,
                      borderColor: c.border,
                      color: c.text,
                      top: yOf(st),
                      height: Math.max(18, (en - st) * PX_PER_MIN - 1),
                      touchAction: canDrag ? ("none" as const) : undefined,
                    };
                    const ring = flagged?.has(s.id) ? " ring-2 ring-red-500" : "";
                    const dragging = drag?.id === s.id && drag.moved;
                    const tall = (en - st) * PX_PER_MIN >= 44;
                    const inner = (
                      <>
                        <span className="block truncate text-xs font-semibold">{s.classes?.name || "Class"}</span>
                        <span className="block truncate text-[11px] opacity-80">{s.subjects?.name} · {hhmm(s.start_time)}-{hhmm(s.end_time)}</span>
                        {tall && <span className="block truncate text-[11px] opacity-70">{nameOf(s.teacher_user_id)}{(s as LockableSlot).locked ? " · fixed" : ""}</span>}
                      </>
                    );
                    if (!editable) {
                      return (
                        <div key={s.id} style={style} className={`absolute overflow-hidden rounded-lg border-l-4 px-2 py-0.5${ring}`} title="Locked: make an editable draft to change this lesson">
                          {inner}
                        </div>
                      );
                    }
                    return (
                      <div
                        key={s.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Edit ${s.classes?.name} ${WEEKDAYS.find((w) => w.value === s.weekday)?.label} ${hhmm(s.start_time)}`}
                        style={style}
                        className={`absolute overflow-hidden rounded-lg border-l-4 px-2 py-0.5 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 ${canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${dragging ? "opacity-30" : ""}${ring}`}
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
                        {canDrag && (
                          <span
                            aria-hidden="true"
                            title="Drag to change the length"
                            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize bg-black/0 hover:bg-black/10"
                            onPointerDown={(e) => begin(e, s, "resize")}
                          />
                        )}
                      </div>
                    );
                  })}
                  {preview && previewSlot && preview.cur.weekday === wd.value && (
                    <div
                      className={`pointer-events-none absolute left-1 right-1 rounded-lg border-2 px-2 py-0.5 text-[11px] font-semibold ${previewOk ? "border-green-500 bg-green-100/80 text-green-900" : "border-red-500 bg-red-100/80 text-red-900"}`}
                      style={{ top: yOf(preview.cur.start), height: Math.max(18, (preview.cur.end - preview.cur.start) * PX_PER_MIN - 1) }}
                    >
                      {fmt(preview.cur.start)}-{fmt(preview.cur.end)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

type Layout = "rows" | "days" | "classic";
const ZOOMS = [
  { id: "s", label: "Compact", ppm: 1.1 },
  { id: "m", label: "Normal", ppm: 1.5 },
  { id: "l", label: "Wide", ppm: 2.2 },
] as const;
const PREF_KEY = "tga.timetable.layout";

/**
 * The weekly timetable with a layout switch. "One row per class / teacher"
 * (the default for the whole school) puts Monday to Friday side by side so the
 * week reads across in a few compact rows; "One row per day" (the default for
 * a single class or teacher) gives five short rows; "Classic" is the older
 * time-down grid. The choice and zoom are remembered on this device.
 */
export function WeeklyGrid(props: GridProps & { groupBy?: "class" | "teacher"; single?: boolean }) {
  const { groupBy = "class", single = false, ...grid } = props;
  const [pref, setPref] = useState<{ layout: Layout | null; zoom: (typeof ZOOMS)[number]["id"] }>({ layout: null, zoom: "m" });
  const layout = pref.layout;
  const zoom = pref.zoom;
  const setLayout = (l: Layout) => setPref((p) => ({ ...p, layout: l }));
  const setZoom = (z: (typeof ZOOMS)[number]["id"]) => setPref((p) => ({ ...p, zoom: z }));
  useEffect(() => {
    let saved: { layout?: Layout; zoom?: string } | null = null;
    try {
      saved = JSON.parse(window.localStorage.getItem(PREF_KEY) || "null");
    } catch {
      saved = null; // storage unavailable: defaults
    }
    const z = ZOOMS.find((x) => x.id === saved?.zoom)?.id;
    if (saved?.layout === "classic" || z) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read a per-device preference once
      setPref((p) => ({ layout: saved?.layout === "classic" ? "classic" : p.layout, zoom: z ?? p.zoom }));
    }
  }, []);
  const save = (next: { layout?: Layout; zoom?: string }) => {
    try {
      const cur = JSON.parse(window.localStorage.getItem(PREF_KEY) || "{}");
      window.localStorage.setItem(PREF_KEY, JSON.stringify({ ...cur, ...next }));
    } catch {
      /* ignore */
    }
  };
  // Whole school: one row per class (or teacher); one class or teacher: one row per day.
  const eff: Layout = layout ?? (single ? "days" : "rows");
  const ppm = ZOOMS.find((z) => z.id === zoom)?.ppm ?? 1.5;
  const options: { id: Layout; label: string }[] = [
    { id: "rows", label: groupBy === "teacher" ? "Row per teacher" : "Row per class" },
    { id: "days", label: "Row per day" },
    { id: "classic", label: "Classic (time down)" },
  ];
  const seg = (on: boolean) => `${chipCls(on)} !py-0.5 !text-xs`;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Grid layout">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink/65">Layout</span>
          {options.map((o) => (
            <button key={o.id} type="button" aria-pressed={eff === o.id} className={seg(eff === o.id)} onClick={() => { setLayout(o.id); save({ layout: o.id }); }}>
              {o.label}
            </button>
          ))}
        </div>
        {eff !== "classic" && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Zoom">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink/65">Zoom</span>
            {ZOOMS.map((z) => (
              <button key={z.id} type="button" aria-pressed={zoom === z.id} className={seg(zoom === z.id)} onClick={() => { setZoom(z.id); save({ zoom: z.id }); }}>
                {z.label}
              </button>
            ))}
          </div>
        )}
        {grid.editable && grid.onMove && (
          <details className="text-xs text-ink/65">
            <summary className="cursor-pointer font-medium">How to edit</summary>
            <p className="mt-1 max-w-prose">
              {eff === "classic"
                ? "Drag a lesson to any day or time (snaps to 5 minutes), drag its bottom edge to change the length, or click an empty spot to add a lesson."
                : "Drag a lesson sideways to change its time or day (snaps to 5 minutes), drag its right edge to change the length, click it to edit, or click an empty spot to add a lesson."}{" "}
              Shaded bands are breaks (grey), lunch and prayer (amber), enrichment (green) and protected times (orange).
            </p>
          </details>
        )}
      </div>
      {eff === "classic" ? <ColumnsGrid {...grid} /> : <RowsGrid {...grid} rowsBy={eff === "days" ? "day" : groupBy} pxPerMin={ppm} />}
    </div>
  );
}
