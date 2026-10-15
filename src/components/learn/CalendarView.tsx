"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyEvent } from "react";
import { classColour } from "@/lib/learn/classes";
import { localDateKey, useCalendarEvents, type CalendarScope } from "@/lib/learn/calendar";
import { TermsManager } from "@/components/learn/calendar/TermsManager";
import { CLOSURE_LABEL, dayInfo, useCalendarTerms } from "@/components/learn/calendar/useCalendarTerms";
import { useCalendarData, type DayItem, type Directory } from "@/components/learn/calendar/useCalendarData";
import { applyView, countByKind, groupByDate, itemColour, type CalView } from "@/components/learn/calendar/calendarUtils";
import { ViewFilter } from "@/components/learn/calendar/ViewFilter";
import { DayPanel, gregLong, parseKey, shiftKey } from "@/components/learn/calendar/DayPanel";
import { addDays, formatHijri, hijriMonthLength, hijriMonthName, hijriMonthStart, isUmmAlQura, resetHijriEngine, shiftHijriMonth, toHijri, todayHijri } from "@/lib/learn/hijri";
import { Tabs } from "@/components/learn/Tabs";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const GREG_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

type HMonth = { year: number; month: number };
type Cell = { date: Date; hijriDay: number } | null;
type Mode = "month" | "week" | "day";
const MODES: { id: Mode; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day agenda" },
];
const EMPTY_DIR: Directory = { classes: [], children: [], teachers: [], childClasses: new Map() };

/** A Hijri month laid out Monday-first: leading/trailing nulls pad the weeks. */
function hijriGrid(m: HMonth): { cells: Cell[]; first: Date; last: Date } {
  const first = hijriMonthStart(m.year, m.month);
  const len = hijriMonthLength(m.year, m.month);
  const offset = (first.getDay() + 6) % 7;
  const cells: Cell[] = Array.from({ length: offset }, () => null);
  for (let i = 0; i < len; i++) cells.push({ date: addDays(first, i), hijriDay: i + 1 });
  while (cells.length % 7 !== 0) cells.push(null);
  return { cells, first, last: addDays(first, len - 1) };
}

function gregShort(d: Date, withYear = false): string {
  return `${d.getDate()} ${GREG_MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`;
}

function gregSpan(a: Date, b: Date): string {
  return `${gregShort(a, a.getFullYear() !== b.getFullYear())} – ${gregShort(b, true)}`;
}

function bothDates(k: string): string {
  const d = parseKey(k);
  return `${formatHijri(toHijri(d))} · ${gregShort(d, true)}`;
}

function useIsDesktop(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return on;
}

/** Marker for a kind of item: dot = lesson, square = homework, diamond = assessment, ring = announcement. */
function Mark({ kind, colour, size = 8 }: { kind: DayItem["kind"]; colour: string; size?: number }) {
  const shape = kind === "lesson" ? "rounded-full" : kind === "homework" ? "rounded-[2px]" : kind === "assessment" ? "rotate-45 rounded-[1px]" : "rounded-full bg-transparent";
  return <span aria-hidden="true" className={`inline-block shrink-0 ${shape}`} style={{ width: size, height: size, backgroundColor: kind === "announcement" ? undefined : colour, border: kind === "announcement" ? `2px solid ${colour}` : undefined }} />;
}

function summary(list: DayItem[]): string {
  const c = countByKind(list);
  const parts = [c.lesson && `${c.lesson} lesson${c.lesson === 1 ? "" : "s"}`, c.homework && `${c.homework} homework due`, c.assessment && `${c.assessment} assessment${c.assessment === 1 ? "" : "s"}`, c.announcement && `${c.announcement} announcement${c.announcement === 1 ? "" : "s"}`].filter(Boolean);
  return parts.length ? parts.join(", ") : "nothing scheduled";
}

const navBtn = "rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream";
type Tab = "month" | "dates" | "terms";
const TABS: { id: Tab; label: string }[] = [
  { id: "month", label: "Calendar" },
  { id: "dates", label: "Dates and overrides" },
  { id: "terms", label: "Terms" },
];

/**
 * Academic calendar, Hijri-first (Umm al-Qura via the browser's Intl).
 * Month grid (Hijri day big, Gregorian small, coloured markers), a week list,
 * and a day agenda; selecting any date opens a DAY DETAIL panel (side panel on
 * desktop, bottom sheet on mobile) with everything on that date. One range is
 * fetched per visible month and split into days on the client.
 */
export function CalendarView({ scope, canManageTerms = false }: { scope: CalendarScope | null; canManageTerms?: boolean }) {
  const [ver, setVer] = useState(0); // bumped by "Sync Islamic dates"
  const [tab, setTab] = useState<Tab>("month");
  const [mode, setMode] = useState<Mode>("month");
  const [hm, setHm] = useState<HMonth>(() => {
    const t = todayHijri();
    return { year: t.year, month: t.month };
  });
  const [selected, setSelected] = useState(() => localDateKey(new Date()));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [view, setView] = useState<CalView>({ kind: "all" });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const isDesktop = useIsDesktop();
  const { terms, years, closures, reload } = useCalendarTerms();

  const today = new Date();
  const todayKey = localDateKey(today);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ver forces a recompute
  const grid = useMemo(() => hijriGrid(hm), [hm, ver]);
  // A week either side so the week list and day arrows work across month edges.
  const { data, loading } = useCalendarData(scope, localDateKey(addDays(grid.first, -7)), localDateKey(addDays(grid.last, 7)));
  const dir = data?.directory || EMPTY_DIR;
  const items = useMemo(() => applyView(data?.items || [], view, dir), [data, view, dir]);
  const byDay = useMemo(() => groupByDate(items), [items]);
  const childOrder = useMemo(() => (scope?.kind === "parent" ? scope.children.map((c) => c.id) : []), [scope]);
  const umalqura = isUmmAlQura();
  const role = scope?.kind === "parent" ? "parent" : scope?.kind === "teacher" ? "teacher" : scope?.kind === "staff" ? "staff" : null;
  const perChild = childOrder.length > 1;

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  // Bottom sheet: Escape closes, focus moves in, page behind doesn't scroll.
  const sheetShown = sheetOpen && !isDesktop && mode !== "day" && tab === "month";
  useEffect(() => {
    if (!sheetShown) return;
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [sheetShown]);

  /** Select a date (keeps the visible Hijri month in step). */
  const select = (key: string, open = false) => {
    setSelected(key);
    if (open) setSheetOpen(true);
    const h = toHijri(parseKey(key));
    if (h.year !== hm.year || h.month !== hm.month) setHm({ year: h.year, month: h.month });
  };
  const shiftMonth = (n: number) => {
    const next = shiftHijriMonth(hm.year, hm.month, n);
    setHm(next);
    setSelected(localDateKey(hijriMonthStart(next.year, next.month)));
  };
  const sync = () => {
    resetHijriEngine();
    setVer((v) => v + 1);
    setToast("Dates synced to Umm al-Qura");
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  };
  const goToday = () => select(todayKey);

  const selectedItems = byDay.get(selected) || [];

  const onCellKey = (e: ReactKeyEvent, key: string) => {
    const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -7 : e.key === "ArrowDown" ? 7 : 0;
    if (!step) return;
    e.preventDefault();
    const next = shiftKey(key, step);
    select(next);
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus(), 30);
  };

  // Cheap to work out, so it is computed on each render rather than memoised.
  const upcoming = (() => {
    const out: { key: string; date: string; label: string }[] = [];
    for (const t of terms || []) {
      if (t.starts_on >= todayKey) out.push({ key: `s-${t.id}`, date: t.starts_on, label: `${t.name} starts` });
      if (t.ends_on >= todayKey) out.push({ key: `e-${t.id}`, date: t.ends_on, label: `${t.name} ends` });
    }
    for (const t of terms || []) if (t.half_term_starts_on && t.half_term_ends_on && t.half_term_ends_on >= todayKey) out.push({ key: `h-${t.id}`, date: t.half_term_starts_on, label: `${t.name} half-term break` });
    for (const c of closures) if (c.ends_on >= todayKey) out.push({ key: `c-${c.id}`, date: c.starts_on, label: `${c.name} (${CLOSURE_LABEL[c.kind]})` });
    for (const e of items) if (e.kind === "homework" && e.date >= todayKey) out.push({ key: e.id, date: e.date, label: `Homework due: ${e.title} (${e.className})${e.childName ? ` · ${e.childName}` : ""}` });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  })();

  const panel = (onClose?: () => void) => (
    <DayPanel
      dateKey={selected}
      items={selectedItems}
      loading={loading && !data}
      terms={terms}
      closures={closures}
      childOrder={childOrder}
      isToday={selected === todayKey}
      onShift={(n) => select(shiftKey(selected, n))}
      onToday={goToday}
      onClose={onClose}
      headingId={headingId}
    />
  );

  // Week (Mon-Sun) containing the selected date.
  const weekDays = useMemo(() => {
    const d = parseKey(selected);
    const start = addDays(d, -((d.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selected]);

  const filter = role && data ? <ViewFilter role={role} directory={dir} view={view} onChange={setView} /> : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-serif text-h3 font-semibold text-ink">Academic Calendar</h2>
        <Tabs variant="switch" items={TABS.map((t) => ({ key: t.id, label: t.label }))} value={tab} onChange={setTab} label="Calendar sections" />
      </div>

      {toast && (
        <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-900">
          {toast}
        </p>
      )}

      {tab === "month" && (
        <>
          {filter}
          <div className={mode === "day" ? "" : "grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"}>
            <section className="min-w-0 overflow-hidden rounded-2xl border border-gold-light bg-white">
              <div className="flex flex-wrap items-center gap-2 border-b border-gold-light px-4 py-3">
                <div className="mr-auto min-w-0">
                  <h3 className="text-lg font-semibold text-ink">
                    {mode === "month" ? `${hijriMonthName(hm.month)} ${hm.year} AH` : mode === "week" ? `Week of ${formatHijri(toHijri(weekDays[0]), false)}` : formatHijri(toHijri(parseKey(selected)))}
                  </h3>
                  <p className="text-xs text-ink/55">
                    {mode === "month" ? gregSpan(grid.first, grid.last) : mode === "week" ? gregSpan(weekDays[0], weekDays[6]) : gregLong(parseKey(selected))}
                  </p>
                </div>
                <div role="group" aria-label="Calendar view" className="flex gap-1 rounded-xl border border-gold-light bg-cream/60 p-1">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={mode === m.id}
                      onClick={() => setMode(m.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium sm:text-sm ${mode === m.id ? "bg-white text-ink shadow-sm" : "text-ink/60 hover:text-ink"}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={sync} className={`${navBtn} hidden sm:inline-block`}>
                  Sync Islamic dates
                </button>
                <button
                  type="button"
                  onClick={() => (mode === "month" ? shiftMonth(-1) : select(shiftKey(selected, mode === "week" ? -7 : -1)))}
                  aria-label={mode === "month" ? "Previous month" : mode === "week" ? "Previous week" : "Previous day"}
                  className={navBtn}
                >
                  ‹
                </button>
                <button type="button" onClick={goToday} className={navBtn}>
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => (mode === "month" ? shiftMonth(1) : select(shiftKey(selected, mode === "week" ? 7 : 1)))}
                  aria-label={mode === "month" ? "Next month" : mode === "week" ? "Next week" : "Next day"}
                  className={navBtn}
                >
                  ›
                </button>
              </div>

              <div className="space-y-1.5 border-b border-gold-light px-4 py-2 text-xs">
                <p className="font-medium text-green-800">
                  {formatHijri(todayHijri())} · {gregLong(today)}
                </p>
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ink/60" aria-label="Legend">
                  <span className="inline-flex items-center gap-1.5"><Mark kind="lesson" colour="#555" /> Lesson</span>
                  <span className="inline-flex items-center gap-1.5"><Mark kind="homework" colour="#555" /> Homework due</span>
                  <span className="inline-flex items-center gap-1.5"><Mark kind="assessment" colour="#555" size={7} /> Assessment</span>
                  <span className="inline-flex items-center gap-1.5"><Mark kind="announcement" colour="#555" /> Announcement</span>
                  <span className="text-ink/65">{perChild ? "Colour = child" : "Colour = class"}</span>
                </p>
                {mode === "month" && (
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ink/60">
                    <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded border border-green-200 bg-green-50" /> Term</span>
                    <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded border border-amber-200 bg-amber-50" /> Half-term</span>
                    <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded border border-red-200 bg-red-50" /> INSET / closure</span>
                    <span><strong className="text-sm text-ink/80">1</strong> Hijri day · <span className="text-[10px]">1</span> Gregorian</span>
                  </p>
                )}
                {!umalqura && <p className="text-amber-800">Your browser doesn&apos;t include the Umm al-Qura calendar, so the civil Islamic calendar is shown (a day may differ).</p>}
              </div>

              {mode === "month" && (
                <>
                  <div className="grid grid-cols-7 border-b border-gold-light bg-cream/60 text-center text-xs font-semibold uppercase tracking-wide text-ink/65">
                    {WEEKDAYS.map((d) => (
                      <div key={d} className="py-2">
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {grid.cells.map((c, i) => {
                      if (!c) return <div key={`pad-${i}`} className="min-h-[64px] border-b border-r border-gold-light/70 bg-cream/40 sm:min-h-[96px]" />;
                      const key = localDateKey(c.date);
                      const list = byDay.get(key) || [];
                      const isToday = key === todayKey;
                      const isSelected = key === selected;
                      const firstOfGreg = c.date.getDate() === 1;
                      const info = dayInfo(key, terms, closures);
                      const closed = info.closure.length > 0;
                      const tint = closed ? "bg-red-50" : info.halfTerm ? "bg-amber-50" : info.term ? "bg-green-50/70" : "bg-white";
                      const cellTag = closed ? info.closure[0].name : info.halfTerm ? "Half-term" : info.boundaryLabel;
                      // One marker per item, capped; the badge carries the true count.
                      const marks = list.slice(0, 6);
                      return (
                        <button
                          key={key}
                          type="button"
                          data-day={key}
                          onClick={() => select(key, true)}
                          onKeyDown={(e) => onCellKey(e, key)}
                          aria-pressed={isSelected}
                          aria-label={`${c.hijriDay} ${hijriMonthName(hm.month)} ${hm.year} AH, ${gregLong(c.date)}, ${summary(list)}${cellTag ? `, ${cellTag}` : ""}`}
                          className={`relative min-h-[64px] border-b border-r border-gold-light/70 p-1 text-left align-top transition-colors focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-700 sm:min-h-[96px] sm:p-1.5 ${
                            isSelected ? "z-10 bg-teal-100 shadow-[inset_0_0_0_3px_var(--color-teal-700)]" : `${tint} hover:bg-cream/70`
                          }`}
                        >
                          <span className="flex items-start justify-between gap-1">
                            <span
                              className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-semibold sm:h-7 sm:min-w-7 sm:text-base ${
                                isToday ? "bg-teal-700 text-white" : isSelected ? "text-teal-900" : "text-ink/85"
                              }`}
                            >
                              {c.hijriDay}
                            </span>
                            <span className={`pt-0.5 text-[9px] sm:text-[11px] ${firstOfGreg ? "font-semibold text-ink/70" : "text-ink/65"}`}>
                              {firstOfGreg ? gregShort(c.date) : c.date.getDate()}
                            </span>
                          </span>
                          {cellTag && (
                            <span className={`mt-0.5 block truncate text-[9px] font-semibold sm:text-[10px] ${closed ? "text-red-800" : info.halfTerm ? "text-amber-800" : "text-green-800"}`}>{cellTag}</span>
                          )}
                          {list.length > 0 && (
                            <span className="mt-1 flex flex-wrap items-center gap-1" aria-hidden="true">
                              {marks.map((e) => (
                                <Mark key={e.id} kind={e.kind} colour={itemColour(e, childOrder)} size={e.kind === "assessment" ? 6 : 8} />
                              ))}
                              {list.length > marks.length && <span className="text-[10px] font-medium text-ink/55">+{list.length - marks.length}</span>}
                            </span>
                          )}
                          {list.length > 0 && (
                            <span aria-hidden="true" className="absolute bottom-1 right-1 rounded-full bg-ink/80 px-1.5 text-[10px] font-semibold leading-4 text-white sm:text-[11px]">
                              {list.length}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {mode === "week" && (
                <ul className="divide-y divide-gold-light/70">
                  {weekDays.map((d) => {
                    const key = localDateKey(d);
                    const list = byDay.get(key) || [];
                    const isSelected = key === selected;
                    const info = dayInfo(key, terms, closures);
                    const tag = info.closure[0]?.name || (info.halfTerm ? "Half-term" : info.boundaryLabel);
                    return (
                      <li key={key} className={isSelected ? "bg-teal-100 shadow-[inset_4px_0_0_var(--color-teal-700)]" : ""}>
                        <button type="button" data-day={key} onClick={() => select(key, true)} aria-pressed={isSelected} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-cream/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700">
                          <span className="w-16 shrink-0">
                            <span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-base font-semibold ${key === todayKey ? "bg-teal-700 text-white" : "text-ink/85"}`}>{toHijri(d).day}</span>
                            <span className="block text-[11px] text-ink/65">
                              {WEEKDAYS[(d.getDay() + 6) % 7]} {gregShort(d)}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1">
                            {tag && <span className="mb-0.5 block text-xs font-semibold text-amber-800">{tag}</span>}
                            {list.length === 0 ? (
                              <span className="text-xs text-ink/65">Nothing scheduled</span>
                            ) : (
                              <span className="block space-y-1">
                                {list.slice(0, 4).map((e) => (
                                  <span key={e.id} className="flex items-center gap-2 text-sm text-ink">
                                    <Mark kind={e.kind} colour={itemColour(e, childOrder)} />
                                    <span className="w-11 shrink-0 text-xs text-ink/55">{e.time || ""}</span>
                                    <span className="truncate">{e.kind === "homework" ? `Due: ${e.title}` : e.title}</span>
                                    {e.childName && <span className="shrink-0 text-xs text-ink/65">{e.childName}</span>}
                                  </span>
                                ))}
                                {list.length > 4 && <span className="block text-xs font-medium text-ink/55">+{list.length - 4} more</span>}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {mode === "day" && <div className="max-h-[75vh] overflow-y-auto">{panel()}</div>}

              <p className="px-4 py-2 text-[10px] text-ink/65">
                {umalqura ? "Umm al-Qura calendar" : "Islamic civil calendar (fallback)"}
                {loading && data ? " · updating…" : ""}
              </p>
            </section>

            {mode !== "day" && isDesktop && (
              <aside aria-labelledby={headingId} className="overflow-hidden rounded-2xl border border-gold-light bg-white xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start">
                {panel()}
              </aside>
            )}
          </div>

          {sheetShown && (
            <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-labelledby={headingId}>
              <button type="button" aria-label="Close day details" tabIndex={-1} onClick={() => setSheetOpen(false)} className="absolute inset-0 bg-ink/40" />
              <div ref={sheetRef} tabIndex={-1} className="relative max-h-[82vh] w-full overflow-hidden rounded-t-2xl border-t border-gold-light bg-white shadow-2xl outline-none">
                <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-ink/20" />
                {panel(() => setSheetOpen(false))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "dates" && (
        <section className="rounded-2xl border border-gold-light bg-white">
          <h3 className="border-b border-gold-light px-4 py-3 text-sm font-semibold text-ink">Upcoming term dates and deadlines</h3>
          {terms === null || !data ? (
            <p className="px-4 py-3 text-sm text-ink/55">Loading…</p>
          ) : upcoming.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink/55">No upcoming term boundaries or deadlines.</p>
          ) : (
            <ul className="divide-y divide-gold-light/60">
              {upcoming.map((u) => (
                <li key={u.key} className="px-4 py-2.5 text-sm">
                  <span className="block font-medium text-ink">{u.label}</span>
                  <span className="block text-xs text-ink/55">{bothDates(u.date)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-gold-light px-4 py-2 text-[11px] text-ink/65">Showing term boundaries and the homework deadlines around {hijriMonthName(hm.month)} {hm.year} AH.</p>
        </section>
      )}

      {tab === "terms" && <TermsManager terms={terms} years={years} closures={closures} canManage={canManageTerms} reload={reload} />}
    </div>
  );
}

function groupByDate2(events: { date: string }[] | null) {
  const m = new Map<string, { id: string; title: string; classId: string }[]>();
  for (const e of (events || []) as unknown as { date: string; id: string; title: string; classId: string }[]) m.set(e.date, [...(m.get(e.date) || []), e]);
  return m;
}

/** Small Hijri month calendar for the dashboard side panel: Hijri day
 * numbers (Gregorian small), dots on days with something on, links to the
 * full calendar. */
export function MiniCalendar({ scope, href }: { scope: CalendarScope | null; href: string }) {
  const today = new Date();
  const th = todayHijri();
  const grid = useMemo(() => hijriGrid({ year: th.year, month: th.month }), [th.year, th.month]);
  const events = useCalendarEvents(scope, localDateKey(grid.first), localDateKey(grid.last));
  const byDay = useMemo(() => groupByDate2(events), [events]);
  const todayKey = localDateKey(today);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">
          {hijriMonthName(th.month)} {th.year} AH
        </p>
        <Link href={href} className="text-xs font-medium text-teal-700 hover:underline">
          Full calendar
        </Link>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-semibold uppercase text-ink/65">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1">
            {d[0]}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 text-center">
        {grid.cells.map((c, i) => {
          if (!c) return <span key={`pad-${i}`} />;
          const key = localDateKey(c.date);
          const list = byDay.get(key) || [];
          return (
            <Link
              key={key}
              href={href}
              className="group flex flex-col items-center rounded-lg py-0.5"
              aria-label={`${c.hijriDay} ${hijriMonthName(th.month)}, ${gregShort(c.date, true)}${list.length ? `: ${list.map((e) => e.title).join(", ")}` : ""}`}
              title={`${gregShort(c.date, true)}${list.length ? `: ${list.map((e) => e.title).join(", ")}` : ""}`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] tabular-nums ${
                  key === todayKey ? "bg-teal-700 font-semibold text-white" : "text-ink/85 group-hover:bg-cream"
                }`}
              >
                {c.hijriDay}
              </span>
              <span aria-hidden="true" className={`text-[10px] leading-3 tabular-nums ${key === todayKey ? "font-semibold text-teal-700" : "text-ink/60"}`}>
                {c.date.getDate()}
              </span>
              <span className="flex h-1.5 gap-0.5">
                {list.slice(0, 3).map((e) => (
                  <span key={e.id} className="h-1 w-1 rounded-full" style={{ backgroundColor: classColour(e.classId) }} />
                ))}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
