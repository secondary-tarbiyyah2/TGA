"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { classColour } from "@/lib/learn/classes";
import { localDateKey, useCalendarEvents, type CalendarEvent, type CalendarScope } from "@/lib/learn/calendar";
import { TermsManager } from "@/components/learn/calendar/TermsManager";
import { CLOSURE_LABEL, dayInfo, useCalendarTerms } from "@/components/learn/calendar/useCalendarTerms";
import { addDays, formatHijri, hijriMonthLength, hijriMonthName, hijriMonthStart, isUmmAlQura, resetHijriEngine, shiftHijriMonth, toHijri, todayHijri } from "@/lib/learn/hijri";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const GREG_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

type HMonth = { year: number; month: number };
type Cell = { date: Date; hijriDay: number } | null;

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

function gregLong(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function parseKey(k: string): Date {
  return new Date(`${k}T12:00:00`);
}

function bothDates(k: string): string {
  const d = parseKey(k);
  return `${formatHijri(toHijri(d))} · ${gregShort(d, true)}`;
}

function groupByDay(events: CalendarEvent[] | null): Map<string, CalendarEvent[]> {
  const m = new Map<string, CalendarEvent[]>();
  for (const e of events || []) m.set(e.date, [...(m.get(e.date) || []), e]);
  return m;
}

function EventLine({ e }: { e: CalendarEvent }) {
  return (
    <Link href={e.href} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-cream">
      <span aria-hidden="true" className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: classColour(e.classId) }} />
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink/45">{e.kind === "lesson" ? "Live lesson" : "Homework due"}</span>
        <span className="block truncate text-sm font-medium text-ink">{e.title}</span>
        <span className="block truncate text-xs text-ink/55">
          {e.time}
          {e.kind === "homework" ? ` · ${e.className}` : ""}
          {e.who ? ` · ${e.who}` : ""}
        </span>
      </span>
    </Link>
  );
}

const navBtn = "rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream";
type Tab = "month" | "dates" | "terms";
const TABS: { id: Tab; label: string }[] = [
  { id: "month", label: "Month view" },
  { id: "dates", label: "Dates & overrides" },
  { id: "terms", label: "Terms" },
];

/**
 * Academic calendar, Hijri-first (Umm al-Qura via the browser's Intl): the
 * month grid is a Hijri month, each cell shows the Hijri day big and the
 * Gregorian day small, with lessons and homework deadlines as entries.
 */
export function CalendarView({ scope, canManageTerms = false }: { scope: CalendarScope | null; canManageTerms?: boolean }) {
  const [ver, setVer] = useState(0); // bumped by "Sync Islamic dates"
  const [tab, setTab] = useState<Tab>("month");
  const [hm, setHm] = useState<HMonth>(() => {
    const t = todayHijri();
    return { year: t.year, month: t.month };
  });
  const [selected, setSelected] = useState(() => localDateKey(new Date()));
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const { terms, years, closures, reload } = useCalendarTerms();

  const today = new Date();
  const todayKey = localDateKey(today);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ver forces a recompute
  const grid = useMemo(() => hijriGrid(hm), [hm, ver]);
  const events = useCalendarEvents(scope, localDateKey(grid.first), localDateKey(grid.last));
  const byDay = useMemo(() => groupByDay(events), [events]);
  const umalqura = isUmmAlQura();

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const shift = (n: number) => setHm(shiftHijriMonth(hm.year, hm.month, n));
  const sync = () => {
    resetHijriEngine();
    setVer((v) => v + 1);
    setToast("Dates synced to Umm al-Qura");
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  };
  const goToday = () => {
    const t = todayHijri();
    setHm({ year: t.year, month: t.month });
    setSelected(todayKey);
  };

  const selectedEvents = byDay.get(selected) || [];
  const todayH = todayHijri();

  const upcoming = useMemo(() => {
    const out: { key: string; date: string; label: string }[] = [];
    for (const t of terms || []) {
      if (t.starts_on >= todayKey) out.push({ key: `s-${t.id}`, date: t.starts_on, label: `${t.name} starts` });
      if (t.ends_on >= todayKey) out.push({ key: `e-${t.id}`, date: t.ends_on, label: `${t.name} ends` });
    }
    for (const t of terms || []) if (t.half_term_starts_on && t.half_term_ends_on && t.half_term_ends_on >= todayKey) out.push({ key: `h-${t.id}`, date: t.half_term_starts_on, label: `${t.name} half-term break` });
    for (const c of closures) if (c.ends_on >= todayKey) out.push({ key: `c-${c.id}`, date: c.starts_on, label: `${c.name} (${CLOSURE_LABEL[c.kind]})` });
    for (const e of events || []) if (e.kind === "homework") out.push({ key: e.id, date: e.date, label: `Homework due: ${e.title} (${e.className})` });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [terms, closures, events, todayKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-serif text-h3 font-semibold text-ink">Academic Calendar</h2>
        <div role="tablist" aria-label="Calendar sections" className="flex gap-1 rounded-xl border border-gold-light bg-cream/60 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium sm:text-sm ${tab === t.id ? "bg-white text-ink shadow-sm" : "text-ink/60 hover:text-ink"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {toast && (
        <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-900">
          {toast}
        </p>
      )}

      {tab === "month" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-2xl border border-gold-light bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-gold-light px-4 py-3">
              <div className="mr-auto min-w-0">
                <h3 className="text-lg font-semibold text-ink">
                  {hijriMonthName(hm.month)} {hm.year} AH
                </h3>
                <p className="text-xs text-ink/55">{gregSpan(grid.first, grid.last)}</p>
              </div>
              <button type="button" onClick={sync} className={navBtn}>
                Sync Islamic dates
              </button>
              <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className={navBtn}>
                ‹
              </button>
              <button type="button" onClick={goToday} className={navBtn}>
                Today
              </button>
              <button type="button" onClick={() => shift(1)} aria-label="Next month" className={navBtn}>
                ›
              </button>
            </div>
            <div className="space-y-1 border-b border-gold-light px-4 py-2 text-xs">
              <p className="font-medium text-green-800">
                {formatHijri(todayH)} · {gregLong(today)}
              </p>
              <p className="flex flex-wrap items-center gap-x-4 text-ink/55">
                <span>
                  <strong className="text-sm text-ink/80">1</strong> Hijri day
                </span>
                <span>
                  <span className="text-[10px]">1</span> Gregorian date
                </span>
              </p>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ink/55">
                <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded border border-green-200 bg-green-50" /> Term</span>
                <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded border border-amber-200 bg-amber-50" /> Half-term</span>
                <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded border border-red-200 bg-red-50" /> INSET / closure</span>
              </p>
              {!umalqura && <p className="text-amber-800">Your browser doesn&apos;t include the Umm al-Qura calendar, so the civil Islamic calendar is shown (a day may differ).</p>}
            </div>

            <div className="grid grid-cols-7 border-b border-gold-light bg-cream/60 text-center text-xs font-semibold uppercase tracking-wide text-ink/50">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {grid.cells.map((c, i) => {
                if (!c) return <div key={`pad-${i}`} className="min-h-[64px] border-b border-r border-gold-light/70 bg-cream/40 sm:min-h-[104px]" />;
                const key = localDateKey(c.date);
                const list = byDay.get(key) || [];
                const isToday = key === todayKey;
                const isSelected = key === selected;
                const firstOfGreg = c.date.getDate() === 1;
                const info = dayInfo(key, terms, closures);
                const closed = info.closure.length > 0;
                const tint = closed ? "bg-red-50" : info.halfTerm ? "bg-amber-50" : info.term ? "bg-green-50/70" : "bg-white";
                const cellTag = closed ? info.closure[0].name : info.halfTerm ? "Half-term" : info.boundaryLabel;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(key)}
                    aria-pressed={isSelected}
                    aria-label={`${c.hijriDay} ${hijriMonthName(hm.month)} ${hm.year} AH, ${gregLong(c.date)}, ${list.length} event${list.length === 1 ? "" : "s"}${cellTag ? `, ${cellTag}` : ""}`}
                    className={`min-h-[64px] border-b border-r border-gold-light/70 ${tint} p-1 text-left align-top transition-colors sm:min-h-[104px] sm:p-1.5 ${
                      isSelected ? "ring-2 ring-inset ring-green-600" : "hover:bg-cream/70"
                    }`}
                  >
                    <span className="flex items-start justify-between gap-1">
                      <span
                        className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-semibold sm:h-7 sm:min-w-7 sm:text-base ${
                          isToday ? "bg-green-700 text-white" : "text-ink/85"
                        }`}
                      >
                        {c.hijriDay}
                      </span>
                      <span className={`pt-0.5 text-[9px] sm:text-[11px] ${firstOfGreg ? "font-semibold text-ink/70" : "text-ink/40"}`}>
                        {firstOfGreg ? gregShort(c.date) : c.date.getDate()}
                      </span>
                    </span>
                    {cellTag && (
                      <span className={`mt-0.5 block truncate text-[9px] font-semibold sm:text-[10px] ${closed ? "text-red-800" : info.halfTerm ? "text-amber-800" : "text-green-800"}`}>{cellTag}</span>
                    )}
                    <span className="mt-1 hidden space-y-0.5 sm:block">
                      {list.slice(0, 3).map((e) => (
                        <span
                          key={e.id}
                          className="block truncate rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
                          style={{ backgroundColor: classColour(e.classId), opacity: e.kind === "homework" ? 0.85 : 1 }}
                        >
                          {e.time ? `${e.time} ` : ""}
                          {e.kind === "homework" ? `Due: ${e.title}` : e.title}
                        </span>
                      ))}
                      {list.length > 3 && <span className="block px-1 text-[11px] font-medium text-ink/55">+{list.length - 3} more</span>}
                    </span>
                    {list.length > 0 && (
                      <span className="mt-1 flex gap-0.5 sm:hidden" aria-hidden="true">
                        {list.slice(0, 4).map((e) => (
                          <span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: classColour(e.classId) }} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="px-4 py-2 text-[10px] text-ink/40">{umalqura ? "Umm al-Qura calendar" : "Islamic civil calendar (fallback)"}</p>
          </section>

          <aside className="rounded-2xl border border-gold-light bg-white xl:self-start">
            <div className="border-b border-gold-light px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">{gregLong(parseKey(selected))}</h3>
              <p className="text-xs text-ink/55">{formatHijri(toHijri(parseKey(selected)))}</p>
            </div>
            {(() => {
              const info = dayInfo(selected, terms, closures);
              const lines = [info.term ? `${info.term.name}${info.halfTerm ? " · half-term break" : ""}` : null, ...info.closure.map((c) => `${c.name} (${CLOSURE_LABEL[c.kind]})`)].filter(Boolean);
              return lines.length ? (
                <ul className="space-y-0.5 border-b border-gold-light bg-cream/40 px-4 py-2 text-xs font-medium text-ink/75">
                  {lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              ) : null;
            })()}
            <div className="p-2">
              {events === null ? (
                <p className="px-2 py-3 text-sm text-ink/55">Loading…</p>
              ) : selectedEvents.length === 0 ? (
                <p className="px-2 py-3 text-sm text-ink/55">Nothing on this day.</p>
              ) : (
                selectedEvents.map((e) => <EventLine key={e.id} e={e} />)
              )}
            </div>
          </aside>
        </div>
      )}

      {tab === "dates" && (
        <section className="rounded-2xl border border-gold-light bg-white">
          <h3 className="border-b border-gold-light px-4 py-3 text-sm font-semibold text-ink">Upcoming term dates and deadlines</h3>
          {terms === null || events === null ? (
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
          <p className="border-t border-gold-light px-4 py-2 text-[11px] text-ink/45">Showing term boundaries and the homework deadlines in {hijriMonthName(hm.month)} {hm.year} AH.</p>
        </section>
      )}

      {tab === "terms" && <TermsManager terms={terms} years={years} closures={closures} canManage={canManageTerms} reload={reload} />}
    </div>
  );
}

/** Small Hijri month calendar for the dashboard side panel: Hijri day
 * numbers (Gregorian small), dots on days with something on, links to the
 * full calendar. */
export function MiniCalendar({ scope, href }: { scope: CalendarScope | null; href: string }) {
  const today = new Date();
  const th = todayHijri();
  const grid = useMemo(() => hijriGrid({ year: th.year, month: th.month }), [th.year, th.month]);
  const events = useCalendarEvents(scope, localDateKey(grid.first), localDateKey(grid.last));
  const byDay = useMemo(() => groupByDay(events), [events]);
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
      <div className="grid grid-cols-7 text-center text-[10px] font-semibold uppercase text-ink/40">
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
            <Link key={key} href={href} className="flex flex-col items-center py-0.5" title={`${gregShort(c.date, true)}${list.length ? `: ${list.map((e) => e.title).join(", ")}` : ""}`}>
              <span
                className={`relative flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                  key === todayKey ? "bg-green-700 font-semibold text-white" : "text-ink/80 hover:bg-cream"
                }`}
              >
                {c.hijriDay}
                <span className={`absolute -right-0.5 -top-0.5 text-[7px] leading-none ${key === todayKey ? "text-green-700" : "text-ink/35"}`}>{c.date.getDate()}</span>
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
