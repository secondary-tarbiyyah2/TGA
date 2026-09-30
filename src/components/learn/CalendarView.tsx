"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { classColour } from "@/lib/learn/classes";
import { localDateKey, useCalendarEvents, type CalendarEvent, type CalendarScope } from "@/lib/learn/calendar";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The 6×7 grid of days (Monday first) covering the given month. */
function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
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

/**
 * Moodle's calendar, month view: a grid of days with each day's lessons
 * and homework deadlines as coloured entries (colour = the class), and the
 * selected day's full list alongside.
 */
export function CalendarView({ scope }: { scope: CalendarScope | null }) {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(localDateKey(today));
  const days = useMemo(() => monthGrid(month), [month]);
  const events = useCalendarEvents(scope, localDateKey(days[0]), localDateKey(days[41]));
  const byDay = useMemo(() => groupByDay(events), [events]);
  const todayKey = localDateKey(today);

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const selectedEvents = byDay.get(selected) || [];
  const selectedLabel = new Date(`${selected}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="overflow-hidden rounded-2xl border border-gold-light bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-gold-light px-4 py-3">
          <h2 className="mr-auto text-lg font-semibold text-ink">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h2>
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="rounded-lg border border-gold-light bg-white px-2.5 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream">
            ‹
          </button>
          <button
            type="button"
            onClick={() => {
              setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
              setSelected(todayKey);
            }}
            className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream"
          >
            Today
          </button>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="rounded-lg border border-gold-light bg-white px-2.5 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream">
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-gold-light bg-cream/60 text-center text-xs font-semibold uppercase tracking-wide text-ink/50">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const key = localDateKey(d);
            const inMonth = d.getMonth() === month.getMonth();
            const list = byDay.get(key) || [];
            const isToday = key === todayKey;
            const isSelected = key === selected;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                aria-pressed={isSelected}
                aria-label={`${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}, ${list.length} event${list.length === 1 ? "" : "s"}`}
                className={`min-h-[92px] border-b border-r border-gold-light/70 p-1.5 text-left align-top transition-colors sm:min-h-[112px] ${
                  inMonth ? "bg-white" : "bg-cream/40 text-ink/35"
                } ${isSelected ? "ring-2 ring-inset ring-teal-500" : "hover:bg-cream/70"}`}
              >
                <span
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold ${
                    isToday ? "bg-teal-700 text-white" : inMonth ? "text-ink/80" : ""
                  }`}
                >
                  {d.getDate()}
                </span>
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
      </section>

      <aside className="rounded-2xl border border-gold-light bg-white xl:self-start">
        <h2 className="border-b border-gold-light px-4 py-3 text-sm font-semibold text-ink">{selectedLabel}</h2>
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
  );
}

/** Small month calendar for the dashboard side panel (Moodle's calendar
 * block): dots on days with something on, links to the full calendar. */
export function MiniCalendar({ scope, href }: { scope: CalendarScope | null; href: string }) {
  const today = new Date();
  const month = new Date(today.getFullYear(), today.getMonth(), 1);
  const days = useMemo(() => monthGrid(month), [month.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const events = useCalendarEvents(scope, localDateKey(days[0]), localDateKey(days[41]));
  const byDay = useMemo(() => groupByDay(events), [events]);
  const todayKey = localDateKey(today);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
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
        {days.map((d) => {
          const key = localDateKey(d);
          const list = byDay.get(key) || [];
          const inMonth = d.getMonth() === month.getMonth();
          return (
            <Link key={key} href={href} className="flex flex-col items-center py-0.5" title={list.map((e) => e.title).join(", ") || undefined}>
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                  key === todayKey ? "bg-teal-700 font-semibold text-white" : inMonth ? "text-ink/80 hover:bg-cream" : "text-ink/25"
                }`}
              >
                {d.getDate()}
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
