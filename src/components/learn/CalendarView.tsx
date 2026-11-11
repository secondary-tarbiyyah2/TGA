"use client";

import { Loading, SidePanel } from "@/components/learn/kit";
import { ukToday } from "@/lib/learn/ukTime";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyEvent } from "react";
import { classColour } from "@/lib/learn/classes";
import { localDateKey, useCalendarEvents, type CalendarScope } from "@/lib/learn/calendar";
import { TermsManager } from "@/components/learn/calendar/TermsManager";
import { dayInfo, useCalendarTerms } from "@/components/learn/calendar/useCalendarTerms";
import { useCalendarData, type DayItem, type Directory } from "@/components/learn/calendar/useCalendarData";
import { CATEGORIES, CAT, applyView, countByCategory, groupByDate, islamicItems, itemColour, sortDay, termItems, type CalView, type Category } from "@/components/learn/calendar/calendarUtils";
import { ViewFilter } from "@/components/learn/calendar/ViewFilter";
import { DayPanel, ItemCard, gregLong, parseKey, shiftKey } from "@/components/learn/calendar/DayPanel";
import { EventDialog } from "@/components/learn/calendar/EventDialog";
import { addDays, formatHijri, hijriMonthLength, hijriMonthName, hijriMonthStart, isUmmAlQura, resetHijriEngine, shiftHijriMonth, toHijri, todayHijri } from "@/lib/learn/hijri";
import { Tabs } from "@/components/learn/Tabs";
import { Icon } from "@/components/learn/Icon";
import { ui } from "@/components/learn/ui";
import { useLearnSession } from "@/lib/learn/session";
import type { EventRow } from "@/components/learn/calendar/useCalendarData";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const GREG_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

type HMonth = { year: number; month: number };
type Cell = { date: Date; hijriDay: number } | null;
type Mode = "month" | "week" | "agenda";
const MODES: { key: Mode; label: string }[] = [
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "agenda", label: "Agenda" },
];
const EMPTY_DIR: Directory = { classes: [], children: [], teachers: [], childClasses: new Map() };
const AGENDA_DAYS = 42;

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
  return `${gregShort(a, a.getFullYear() !== b.getFullYear())} to ${gregShort(b, true)}`;
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

function summary(list: DayItem[]): string {
  const c = countByCategory(list);
  const parts = CATEGORIES.filter((x) => c[x.key]).map((x) => `${c[x.key]} ${x.label.toLowerCase()}`);
  return parts.length ? parts.join(", ") : "nothing scheduled";
}

const HIDDEN_KEY = "tga-calendar-hidden";
type Tab = "month" | "terms";
const TABS: { key: Tab; label: string }[] = [
  { key: "month", label: "Calendar" },
  { key: "terms", label: "Terms and closures" },
];

/**
 * The school calendar (owner feedback 11 Nov 2026, item 4). Every item has a
 * category with its own colour: lessons, assessments, homework and deadlines,
 * school events, holidays and term dates, Islamic dates, meetings and (staff)
 * admissions. The category chips are the legend and the filter. Month (the
 * Hijri month, Gregorian dates small), Week and Agenda (the next six weeks)
 * views; picking a day opens everything on it beside the calendar (a sheet on
 * phones). Staff add entries in a dialog that fits the screen. Arrow keys move
 * between days in the month; Page Up and Page Down change month.
 */
export function CalendarView({ scope, canManageTerms = false }: { scope: CalendarScope | null; canManageTerms?: boolean }) {
  const { roles, session } = useLearnSession();
  const me = session && session !== "loading" ? session.user.id : null;
  const roleNames = roles.map((r) => r.role as string);
  const office = roleNames.some((r) => r === "head_teacher" || r === "admin" || r === "admissions");
  const staff = scope?.kind === "staff" || scope?.kind === "teacher";
  const [ver, setVer] = useState(0); // bumped by "Sync Islamic dates" and after an edit
  const [tab, setTab] = useState<Tab>(() => {
    const t = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("tab");
    return canManageTerms && (t === "terms" || t === "dates") ? "terms" : "month";
  });
  const [mode, setMode] = useState<Mode>("month");
  const [hm, setHm] = useState<HMonth>(() => {
    const t = todayHijri();
    return { year: t.year, month: t.month };
  });
  const [selected, setSelected] = useState(() => ukToday());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [view, setView] = useState<CalView>({ kind: "all" });
  const [hidden, setHidden] = useState<Set<Category>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]") as Category[]);
    } catch {
      return new Set();
    }
  });
  const [editing, setEditing] = useState<{ row: EventRow | null; date: string } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const isDesktop = useIsDesktop();
  const { terms, years, closures, reload } = useCalendarTerms();

  const todayKey = ukToday(new Date());
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ver forces a recompute
  const grid = useMemo(() => hijriGrid(hm), [hm, ver]);
  // The visible month, a week either side, and the agenda's six weeks from the chosen day.
  const rangeFrom = localDateKey(addDays(grid.first, -7));
  const agendaEnd = localDateKey(addDays(parseKey(selected), AGENDA_DAYS));
  const monthEnd = localDateKey(addDays(grid.last, 7));
  const rangeTo = mode === "agenda" && agendaEnd > monthEnd ? agendaEnd : monthEnd;
  const { data, loading } = useCalendarData(scope, `${rangeFrom}`, `${rangeTo}`, ver);
  const dir = data?.directory || EMPTY_DIR;
  const allItems = useMemo(
    () => [...(data?.items || []), ...termItems(terms, closures, rangeFrom, rangeTo), ...islamicItems(rangeFrom, rangeTo)],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ver: the Hijri engine was reset
    [data, terms, closures, rangeFrom, rangeTo, ver],
  );
  const viewed = useMemo(() => applyView(allItems, view, dir), [allItems, view, dir]);
  const counts = useMemo(() => countByCategory(viewed), [viewed]);
  const items = useMemo(() => viewed.filter((i) => !hidden.has(i.category)), [viewed, hidden]);
  const byDay = useMemo(() => groupByDate(items), [items]);
  const umalqura = isUmmAlQura();
  const role = scope?.kind === "parent" ? "parent" : scope?.kind === "teacher" ? "teacher" : scope?.kind === "staff" ? "staff" : null;
  const shownCats = CATEGORIES.filter((c) => !c.staffOnly || staff);

  const toggleCat = (c: Category) =>
    setHidden((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...n]));
      } catch {
        /* private mode: the choice lasts this visit */
      }
      return n;
    });

  // Bottom sheet: Escape closes, focus moves in, page behind doesn't scroll.
  const sheetShown = sheetOpen && !isDesktop && mode !== "agenda" && tab === "month";
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
  const step = (dir1: number) => (mode === "month" ? shiftMonth(dir1) : select(shiftKey(selected, dir1 * (mode === "week" ? 7 : AGENDA_DAYS))));
  const goToday = () => select(todayKey);
  const sync = () => {
    resetHijriEngine();
    setVer((v) => v + 1);
  };

  const onCellKey = (e: ReactKeyEvent, key: string) => {
    if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      shiftMonth(e.key === "PageUp" ? -1 : 1);
      return;
    }
    const d = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -7 : e.key === "ArrowDown" ? 7 : 0;
    if (!d) return;
    e.preventDefault();
    const next = shiftKey(key, d);
    select(next);
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus(), 30);
  };

  // Your own entries, or any entry for the office (the database checks the same).
  const canEdit = (i: DayItem) => !!i.event && staff && (office || i.event.created_by === me);
  const addOn = (date: string) => setEditing({ row: null, date });
  // Teachers see (and may add entries for) their own classes; the office every class.
  const editClasses = dir.classes.map((c) => ({ id: c.id, name: c.name }));

  const panel = (onClose?: () => void) => (
    <DayPanel
      dateKey={selected}
      items={byDay.get(selected) || []}
      loading={loading && !data}
      terms={terms}
      closures={closures}
      isToday={selected === todayKey}
      onShift={(n) => select(shiftKey(selected, n))}
      onToday={goToday}
      onClose={onClose}
      onAdd={staff ? () => addOn(selected) : undefined}
      canEdit={canEdit}
      onEdit={(i) => i.event && setEditing({ row: i.event, date: i.event.starts_on })}
      headingId={headingId}
    />
  );

  // Week (Mon-Sun) containing the selected date.
  const weekDays = useMemo(() => {
    const d = parseKey(selected);
    const start = addDays(d, -((d.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selected]);

  const agendaDays = useMemo(() => {
    const out: { key: string; list: DayItem[] }[] = [];
    for (let i = 0; i < AGENDA_DAYS; i++) {
      const k = shiftKey(selected, i);
      const list = byDay.get(k);
      if (list && list.length) out.push({ key: k, list: sortDay(list) });
    }
    return out;
  }, [byDay, selected]);

  const heading =
    mode === "month"
      ? { title: `${hijriMonthName(hm.month)} ${hm.year} AH`, sub: gregSpan(grid.first, grid.last) }
      : mode === "week"
        ? { title: `Week of ${gregShort(weekDays[0], true)}`, sub: `${formatHijri(toHijri(weekDays[0]), false)} to ${formatHijri(toHijri(weekDays[6]))}` }
        : { title: `From ${gregShort(parseKey(selected), true)}`, sub: `The next six weeks · ${formatHijri(toHijri(parseKey(selected)))}` };

  return (
    <div className="space-y-4">
      {canManageTerms && (
        <Tabs variant="switch" items={TABS} value={tab} onChange={setTab} label="Calendar sections" guide="calendar-sections" />
      )}

      {tab === "month" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-auto min-w-0">
              <h2 className="t-section text-base">{heading.title}</h2>
              <p className="t-meta">{heading.sub}</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => step(-1)} aria-label={mode === "month" ? "Previous month" : mode === "week" ? "Previous week" : "Earlier"} className={ui.btnIcon}>
                <Icon name="chevronLeft" />
              </button>
              <button type="button" onClick={goToday} className={`${ui.btnSecondary} ${ui.sm}`}>
                Today
              </button>
              <button type="button" onClick={() => step(1)} aria-label={mode === "month" ? "Next month" : mode === "week" ? "Next week" : "Later"} className={ui.btnIcon}>
                <Icon name="chevronRight" />
              </button>
            </div>
            <Tabs variant="switch" items={MODES} value={mode} onChange={(m) => { setMode(m); setSheetOpen(false); }} label="Calendar view" guide="calendar-views" />
            {staff && (
              <button type="button" onClick={() => addOn(selected)} className={ui.btnPrimary}>
                <Icon name="plus" size="sm" /> Add to calendar
              </button>
            )}
          </div>

          <div data-guide="calendar-categories" role="group" aria-label="Show categories (also the colour key)" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            {shownCats.map((c) => {
              const on = !hidden.has(c.key);
              return (
                <button key={c.key} type="button" aria-pressed={on} onClick={() => toggleCat(c.key)} className={`${on ? ui.chip : `${ui.chip} opacity-60`} min-h-9 shrink-0 sm:min-h-7`}>
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={on ? { backgroundColor: c.colour } : { boxShadow: `inset 0 0 0 1.5px ${c.colour}` }} />
                  <span className={on ? "" : "line-through decoration-ink/40"}>{c.label}</span>
                  {counts[c.key] > 0 && <span className="tabular-nums text-ink-500">{counts[c.key]}</span>}
                </button>
              );
            })}
            {hidden.size > 0 && (
              <button type="button" onClick={() => { setHidden(new Set()); try { localStorage.removeItem(HIDDEN_KEY); } catch { /* ignore */ } }} className={`${ui.btnLink} text-xs`}>
                Show all
              </button>
            )}
          </div>
          {role && data && <ViewFilter role={role} directory={dir} view={view} onChange={setView} />}

          <div className={mode === "month" ? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]" : ""}>
            <section className="min-w-0 overflow-hidden rounded-[10px] border border-gold-light bg-[var(--portal-surface)]">
              {mode === "month" && (
                <>
                  <div className="grid grid-cols-7 border-b border-gold-light text-center">
                    {WEEKDAYS.map((d) => (
                      <div key={d} className="t-eyebrow py-2">
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7" role="grid" aria-label={`${hijriMonthName(hm.month)} ${hm.year} AH`}>
                    {grid.cells.map((c, i) => {
                      if (!c) return <div key={`pad-${i}`} className="min-h-[64px] border-b border-r border-gold-light bg-[var(--portal-canvas)] sm:min-h-[104px]" />;
                      const key = localDateKey(c.date);
                      const list = sortDay(byDay.get(key) || []);
                      const isToday = key === todayKey;
                      const isSelected = key === selected;
                      const firstOfGreg = c.date.getDate() === 1;
                      const info = dayInfo(key, terms, closures);
                      const offDay = info.closure.length > 0 || info.halfTerm;
                      return (
                        <button
                          key={key}
                          type="button"
                          data-day={key}
                          onClick={() => select(key, true)}
                          onKeyDown={(e) => onCellKey(e, key)}
                          aria-pressed={isSelected}
                          tabIndex={isSelected ? 0 : -1}
                          aria-label={`${gregLong(c.date)}, ${c.hijriDay} ${hijriMonthName(hm.month)}, ${summary(list)}`}
                          className={`relative min-h-[64px] border-b border-r border-gold-light p-1 text-left align-top transition-colors focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-forest-700 sm:min-h-[104px] sm:p-1.5 ${
                            isSelected ? "z-10 bg-forest-50 shadow-[inset_0_0_0_2px_var(--color-forest-700)]" : offDay ? "bg-[var(--portal-canvas)] hover:bg-[var(--portal-hover)]" : "hover:bg-[var(--portal-hover)]"
                          }`}
                        >
                          <span className="flex items-start justify-between gap-1">
                            <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-semibold tabular-nums ${isToday ? "bg-forest-700 text-white" : "text-ink"}`}>{c.hijriDay}</span>
                            <span className={`pt-0.5 text-[10px] tabular-nums sm:text-[11px] ${firstOfGreg ? "font-semibold text-ink-700" : "text-ink-500"}`}>{firstOfGreg ? gregShort(c.date) : c.date.getDate()}</span>
                          </span>
                          {/* Phones: a dot per category; wider: up to three named bars. */}
                          {list.length > 0 && (
                            <>
                              <span className="mt-1 flex flex-wrap gap-0.5 sm:hidden" aria-hidden="true">
                                {[...new Set(list.map((x) => x.category))].slice(0, 4).map((cat) => (
                                  <span key={cat} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CAT[cat].colour }} />
                                ))}
                              </span>
                              <span className="mt-1 hidden space-y-0.5 sm:block" aria-hidden="true">
                                {list.slice(0, 3).map((x) => (
                                  <span key={x.id} className="block truncate rounded-[4px] py-px pl-1.5 pr-1 text-[11px] leading-4 text-ink" style={{ boxShadow: `inset 3px 0 0 ${itemColour(x)}`, backgroundColor: `color-mix(in oklab, ${itemColour(x)} 9%, transparent)` }}>
                                    {x.time && x.kind !== "lesson" ? `${x.time} ` : ""}
                                    {x.title}
                                  </span>
                                ))}
                                {list.length > 3 && <span className="block pl-1.5 text-[11px] font-medium text-ink-500">{list.length - 3} more</span>}
                              </span>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {mode === "week" && (
                <WeekGrid days={weekDays} byDay={byDay} selected={selected} todayKey={todayKey} onPick={(k) => select(k, true)} />
              )}
              {mode === "week" && (
                <ul className="divide-y divide-gold-light lg:hidden">
                  {weekDays.map((d) => {
                    const key = localDateKey(d);
                    const list = sortDay(byDay.get(key) || []);
                    const isSelected = key === selected;
                    return (
                      <li key={key} className={`min-w-0 ${isSelected ? "bg-forest-50" : ""}`}>
                        <button type="button" data-day={key} onClick={() => select(key, true)} aria-pressed={isSelected} className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-[var(--portal-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest-700">
                          <span className="w-14 shrink-0">
                            <span className="t-eyebrow block">{WEEKDAYS[(d.getDay() + 6) % 7]}</span>
                            <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-base font-semibold tabular-nums ${key === todayKey ? "bg-forest-700 text-white" : "text-ink"}`}>{toHijri(d).day}</span>
                            <span className="ml-1 text-[11px] text-ink-500">{gregShort(d)}</span>
                          </span>
                          <span className="min-w-0 flex-1 space-y-1 lg:block">
                            {list.length === 0 ? (
                              <span className="text-xs text-ink-500">Nothing on</span>
                            ) : (
                              list.map((x) => (
                                <span key={x.id} className="block rounded-[5px] py-1 pl-2 pr-1 text-xs leading-snug text-ink" style={{ boxShadow: `inset 3px 0 0 ${itemColour(x)}`, backgroundColor: `color-mix(in oklab, ${itemColour(x)} 8%, transparent)` }}>
                                  {x.time && <span className="block text-[11px] text-ink-500">{x.time}{x.endTime ? ` to ${x.endTime}` : ""}</span>}
                                  <span className="line-clamp-2 font-medium">{x.kind === "homework" ? `Due: ${x.title}` : x.title}</span>
                                  {x.childName && <span className="block text-[11px] text-ink-500">{x.childName}</span>}
                                </span>
                              ))
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {mode === "agenda" && (
                <div>
                  {loading && !data ? (
                    <Loading label="Loading the calendar" bare />
                  ) : agendaDays.length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-ink-500">Nothing in the next six weeks{hidden.size ? " in the categories shown" : ""}.</p>
                  ) : (
                    <ol className="divide-y divide-gold-light">
                      {agendaDays.map(({ key, list }) => {
                        const d = parseKey(key);
                        return (
                          <li key={key} className="grid gap-2 px-3 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:px-4">
                            <div>
                              <p className={`text-sm font-semibold ${key === todayKey ? "text-forest-700" : "text-ink"}`}>
                                {key === todayKey ? "Today" : d.toLocaleDateString("en-GB", { weekday: "long" })}
                              </p>
                              <p className="t-meta">
                                {gregShort(d, true)} · {formatHijri(toHijri(d), false)}
                              </p>
                            </div>
                            <ul className="space-y-2">
                              {list.map((x) => (
                                <ItemCard key={x.id} item={x} onEdit={canEdit(x) ? (i) => i.event && setEditing({ row: i.event, date: i.event.starts_on }) : undefined} />
                              ))}
                            </ul>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              )}

              <p className="flex flex-wrap items-center gap-x-3 border-t border-gold-light px-4 py-2 text-[11px] text-ink-500">
                <span>Hijri dates: {umalqura ? "Umm al-Qura" : "civil Islamic calendar (your browser lacks Umm al-Qura; a day may differ)"}. Islamic days depend on the moon sighting.</span>
                <button type="button" onClick={sync} className="underline-offset-2 hover:text-forest-700 hover:underline">
                  Refresh Islamic dates
                </button>
                {loading && data ? <span>Updating</span> : null}
              </p>
            </section>

            {mode === "month" && isDesktop && (
              <aside aria-labelledby={headingId} className="flex flex-col overflow-hidden rounded-[10px] border border-gold-light bg-[var(--portal-surface)] xl:sticky xl:top-[76px] xl:max-h-[calc(100vh-6rem)] xl:self-start">
                {panel()}
              </aside>
            )}
          </div>

          {sheetShown && (
            <div className="portal fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-labelledby={headingId}>
              <button type="button" aria-label="Close day details" tabIndex={-1} onClick={() => setSheetOpen(false)} className="portal-scrim absolute inset-0 bg-ink/40" />
              <div ref={sheetRef} tabIndex={-1} className="portal-sheet relative flex max-h-[82dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl outline-none">
                <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ink/20" />
                {panel(() => setSheetOpen(false))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "month" && mode === "week" && isDesktop && sheetOpen && (
        <SidePanel title={gregLong(parseKey(selected))} eyebrow="Day" onClose={() => setSheetOpen(false)} label="Day details">
          <div className="-mx-5 -my-4 flex min-h-full flex-col">{panel()}</div>
        </SidePanel>
      )}

      {tab === "terms" && <TermsManager terms={terms} years={years} closures={closures} canManage={canManageTerms} reload={reload} />}

      {editing && (
        <EventDialog
          initial={editing.row}
          date={editing.date}
          office={office}
          classes={editClasses}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setVer((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}

const HOUR_PX = 52;
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

/**
 * The week as a timetable grid on wide screens (owner feedback 3: SchoolMS's full-week grid): a time rail on the
 * left, a column per school day (Saturday and Sunday only when something is on), all-day items in a strip at the top,
 * and timed items placed by their start and end like period cards. Phones keep the day-by-day list.
 */
function WeekGrid({ days, byDay, selected, todayKey, onPick }: { days: Date[]; byDay: Map<string, DayItem[]>; selected: string; todayKey: string; onPick: (key: string) => void }) {
  const cols = days.filter((d, i) => i < 5 || (byDay.get(localDateKey(d)) || []).length > 0);
  const lists = cols.map((d) => sortDay(byDay.get(localDateKey(d)) || []));
  const timed = lists.flat().filter((x) => x.time);
  let startH = 8;
  let endH = 17;
  for (const x of timed) {
    startH = Math.min(startH, Math.floor(toMin(x.time!) / 60));
    endH = Math.max(endH, Math.ceil(toMin(x.endTime || x.time!) / 60) + (x.endTime ? 0 : 1));
  }
  endH = Math.min(24, endH);
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
  const tpl = { gridTemplateColumns: `3.5rem repeat(${cols.length}, minmax(0, 1fr))` };
  const hasAllDay = lists.some((l) => l.some((x) => !x.time));
  return (
    <div className="hidden lg:block">
      <div className="grid border-b border-gold-light" style={tpl}>
        <div />
        {cols.map((d) => {
          const key = localDateKey(d);
          return (
            <button key={key} type="button" data-day={key} onClick={() => onPick(key)} aria-pressed={key === selected} className={`border-l border-gold-light px-2 py-2 text-left hover:bg-[var(--portal-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest-700 ${key === selected ? "bg-forest-50" : ""}`}>
              <span className="t-eyebrow block">{d.toLocaleDateString("en-GB", { weekday: "short" })}</span>
              <span className="flex items-baseline gap-1.5">
                <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-base font-semibold tabular-nums ${key === todayKey ? "bg-forest-700 text-white" : "text-ink"}`}>{d.getDate()}</span>
                <span className="text-[11px] text-ink-500">{GREG_MONTHS[d.getMonth()]}</span>
              </span>
              <span className="block truncate text-[11px] text-ink-500" title={formatHijri(toHijri(d))}>
                {toHijri(d).day} {hijriMonthName(toHijri(d).month)}
              </span>
            </button>
          );
        })}
      </div>
      {hasAllDay && (
        <div className="grid border-b border-gold-light bg-[var(--portal-canvas)]" style={tpl}>
          <div className="t-eyebrow px-2 py-2 text-right">All day</div>
          {lists.map((l, i) => (
            <div key={i} className="min-w-0 space-y-1 border-l border-gold-light p-1">
              {l.filter((x) => !x.time).map((x) => (
                <button key={x.id} type="button" onClick={() => onPick(x.date)} className="block w-full truncate rounded-[5px] px-1.5 py-0.5 text-left text-[11px] font-medium text-ink" style={{ boxShadow: `inset 3px 0 0 ${itemColour(x)}`, backgroundColor: `color-mix(in oklab, ${itemColour(x)} 10%, var(--portal-surface))` }} title={`${CAT[x.category].short}: ${x.title}`}>
                  {x.kind === "homework" ? `Due: ${x.title}` : x.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="max-h-[min(70vh,720px)] overflow-y-auto">
        <div className="relative grid" style={tpl}>
          <div>
            {hours.map((h) => (
              <div key={h} className="relative border-t border-gold-light/60 pr-2 text-right text-[11px] tabular-nums text-ink-500" style={{ height: HOUR_PX }}>
                <span className="relative top-0.5">{String(h).padStart(2, "0")}:00</span>
              </div>
            ))}
          </div>
          {lists.map((l, ci) => (
            <div key={ci} className="relative border-l border-gold-light" style={{ height: hours.length * HOUR_PX }}>
              {hours.map((h) => (
                <div key={h} className="border-t border-gold-light/60" style={{ height: HOUR_PX }} />
              ))}
              {(() => {
                // Side by side when items overlap: each takes a lane.
                const items = l.filter((x) => x.time);
                const lanes: number[] = [];
                const placed = items.map((x) => {
                  const s = toMin(x.time!);
                  const e = x.endTime ? Math.max(toMin(x.endTime), s + 30) : s + 40;
                  let lane = lanes.findIndex((end) => end <= s);
                  if (lane < 0) lane = lanes.length;
                  lanes[lane] = e;
                  return { x, s, e, lane };
                });
                const n = Math.max(1, lanes.length);
                return placed.map(({ x, s, e, lane }) => (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => onPick(x.date)}
                    title={`${x.time}${x.endTime ? ` to ${x.endTime}` : ""} · ${CAT[x.category].short}: ${x.title}`}
                    className="absolute overflow-hidden rounded-[6px] border border-gold-light px-1.5 py-1 text-left text-[11px] leading-tight text-ink hover:z-10 hover:shadow-[var(--portal-shadow-pop)] focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest-700"
                    style={{
                      top: ((s - startH * 60) / 60) * HOUR_PX + 1,
                      height: Math.max(22, ((e - s) / 60) * HOUR_PX - 2),
                      left: `calc(${(lane / n) * 100}% + 2px)`,
                      width: `calc(${100 / n}% - 4px)`,
                      boxShadow: `inset 3px 0 0 ${itemColour(x)}`,
                      backgroundColor: `color-mix(in oklab, ${itemColour(x)} 9%, var(--portal-surface))`,
                    }}
                  >
                    <span className="block truncate font-semibold">{x.kind === "homework" ? `Due: ${x.title}` : x.title}</span>
                    <span className="block truncate tabular-nums text-ink-500">
                      {x.time}
                      {x.endTime ? `-${x.endTime}` : ""}
                      {x.childName ? ` · ${x.childName}` : x.room ? ` · ${x.room}` : ""}
                    </span>
                  </button>
                ));
              })()}
            </div>
          ))}
        </div>
      </div>
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
  // "Today" as the school sees it (UK), whatever zone the viewer is in.
  const todayKey = ukToday(today);

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
              <span aria-hidden="true" className={`text-[10px] leading-3 tabular-nums ${key === todayKey ? "font-semibold text-teal-700" : "text-ink/65"}`}>
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
