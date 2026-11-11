"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/learn/Icon";
import { Select } from "@/components/ui/Dropdown";
import { ui } from "@/components/learn/ui";

/**
 * The portal's date field, in place of the browser's own date input.
 *
 * Three boxes (Day, Month, Year), the pattern UK public services use for dates
 * of birth because it is the quickest to type and works the same in every
 * browser, plus a calendar button for anyone who prefers to pick. The calendar
 * is fully keyboard-driven: arrow keys move a day or a week, Page Up / Page Down
 * a month (with Shift, a year), Home / End the start or end of the week, Enter
 * picks, Escape closes. Weeks start on Monday.
 *
 * `value` and `onChange` use "YYYY-MM-DD" ("" when empty or not a real date).
 */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type Ymd = { y: number; m: number; d: number }; // m: 1 to 12

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (p: Ymd) => `${String(p.y).padStart(4, "0")}-${pad(p.m)}-${pad(p.d)}`;
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function fromIso(v: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
  if (!m) return null;
  const p = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  return p.m >= 1 && p.m <= 12 && p.d >= 1 && p.d <= daysIn(p.y, p.m) ? p : null;
}

function addDays(p: Ymd, n: number): Ymd {
  const dt = new Date(p.y, p.m - 1, p.d + n);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

function addMonths(p: Ymd, n: number): Ymd {
  const total = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m, d: Math.min(p.d, daysIn(y, m)) };
}

/** 0 = Monday. */
const weekday = (p: Ymd) => (new Date(p.y, p.m - 1, p.d).getDay() + 6) % 7;

export function formatLongDate(v: string): string {
  const p = fromIso(v);
  return p ? `${DAYS_LONG[weekday(p)]} ${p.d} ${MONTHS[p.m - 1]} ${p.y}` : "";
}

export function DatePicker({
  label,
  value,
  onChange,
  hint,
  min,
  max,
  defaultView,
  required,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  /** Earliest and latest allowed dates, "YYYY-MM-DD". */
  min?: string;
  max?: string;
  /** Where the calendar opens when nothing is entered yet, "YYYY-MM-DD" (default today). */
  defaultView?: string;
  required?: boolean;
  id?: string;
}) {
  const auto = useId().replace(/:/g, "");
  const base = id || `dp-${auto}`;
  const parsed = fromIso(value);
  const [day, setDay] = useState(parsed ? String(parsed.d) : "");
  const [month, setMonth] = useState(parsed ? String(parsed.m) : "");
  const [year, setYear] = useState(parsed ? String(parsed.y) : "");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const boxesIso = (d: string, m: string, y: string) => {
    const p = d && m && /^\d{4}$/.test(y) ? { y: Number(y), m: Number(m), d: Number(d) } : null;
    return p && p.d >= 1 && p.d <= daysIn(p.y, p.m) ? toIso(p) : "";
  };

  // Follow the value when the parent changes it (a reset or a prefill). A
  // half-typed date (which emits "") is left alone.
  const typed = boxesIso(day, month, year);
  if (value !== typed && (value === "" ? typed !== "" : fromIso(value) !== null)) {
    const p = fromIso(value);
    setDay(p ? String(p.d) : "");
    setMonth(p ? String(p.m) : "");
    setYear(p ? String(p.y) : "");
  }

  const emit = (d: string, m: string, y: string) => {
    const iso = boxesIso(d, m, y);
    if (iso !== value) onChange(iso);
  };

  const filled = !!(day && month && year);
  const error = (() => {
    if (!filled) return null;
    if (!/^\d{4}$/.test(year)) return "Enter the year as four digits, for example 2014.";
    const p = { y: Number(year), m: Number(month), d: Number(day) };
    if (p.d < 1 || p.d > daysIn(p.y, p.m)) return `${MONTHS[p.m - 1]} ${p.y} has ${daysIn(p.y, p.m)} days.`;
    const iso = toIso(p);
    if (min && cmp(iso, min) < 0) return `The date must be on or after ${formatLongDate(min)}.`;
    if (max && cmp(iso, max) > 0) return `The date must be on or before ${formatLongDate(max)}.`;
    return null;
  })();

  // Close the calendar on a click outside it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const describedBy = [hint ? `${base}-hint` : "", error ? `${base}-err` : ""].filter(Boolean).join(" ") || undefined;
  const box = `${ui.input} text-center tabular-nums`;

  return (
    <div ref={wrapRef} className="relative">
      <fieldset aria-describedby={describedBy}>
        <legend className={`${ui.label} mb-1`}>
          {label}
          {required && <span className="sr-only"> (required)</span>}
        </legend>
        <div className="flex flex-wrap items-end gap-2">
          <label className="w-14 shrink-0 text-xs text-ink/70">
            Day
            <input
              id={`${base}-d`}
              inputMode="numeric"
              autoComplete="off"
              maxLength={2}
              value={day}
              aria-invalid={!!error}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                setDay(v);
                emit(v, month, year);
              }}
              className={`mt-0.5 ${box} !px-1`}
            />
          </label>
          <div className="min-w-[8.5rem] flex-1 text-xs text-ink/70 sm:max-w-[11rem]">
            <span id={`${base}-mlabel`}>Month</span>
            <div className="mt-0.5">
              <Select
                value={month}
                aria-labelledby={`${base}-mlabel`}
                invalid={!!error}
                placeholder="Month"
                className={ui.select}
                onChange={(e) => {
                  setMonth(e.target.value);
                  emit(day, e.target.value, year);
                }}
              >
                <option value="">Month</option>
                {MONTHS.map((name, i) => (
                  <option key={name} value={String(i + 1)}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <label className="w-20 shrink-0 text-xs text-ink/70">
            Year
            <input
              id={`${base}-y`}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={year}
              aria-invalid={!!error}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                setYear(v);
                emit(day, month, v);
              }}
              className={`mt-0.5 ${box} !px-1`}
            />
          </label>
          <button
            ref={toggleRef}
            type="button"
            aria-label={open ? "Close calendar" : "Choose from a calendar"}
            title="Choose from a calendar"
            aria-expanded={open}
            aria-controls={`${base}-cal`}
            onClick={() => setOpen((o) => !o)}
            className={`${ui.btnIcon} border border-gold-light bg-white ${open ? "!border-teal-700 !text-teal-700" : ""}`}
          >
            <Icon name="calendarDays" />
          </button>
        </div>
      </fieldset>
      {hint && !error && (
        <p id={`${base}-hint`} className={`mt-1 ${ui.hint}`}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${base}-err`} role="alert" className={`mt-1 ${ui.error}`}>
          {error}
        </p>
      )}
      {open && (
        <Calendar
          id={`${base}-cal`}
          value={value}
          start={fromIso(value) || (year.length === 4 && month ? { y: Number(year), m: Number(month), d: Math.min(Number(day) || 1, daysIn(Number(year), Number(month))) } : null) || fromIso(defaultView || "") || todayYmd()}
          min={min}
          max={max}
          onPick={(iso) => {
            const p = fromIso(iso)!;
            setDay(String(p.d));
            setMonth(String(p.m));
            setYear(String(p.y));
            if (iso !== value) onChange(iso);
            setOpen(false);
            toggleRef.current?.focus();
          }}
          onClose={() => {
            setOpen(false);
            toggleRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

function todayYmd(): Ymd {
  const t = new Date();
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
}

function Calendar({ id, value, start, min, max, onPick, onClose }: { id: string; value: string; start: Ymd; min?: string; max?: string; onPick: (iso: string) => void; onClose: () => void }) {
  const [focus, setFocus] = useState<Ymd>(start);
  const gridRef = useRef<HTMLTableElement>(null);
  const today = toIso(todayYmd());
  const titleId = `${id}-title`;

  const allowed = (iso: string) => (!min || cmp(iso, min) >= 0) && (!max || cmp(iso, max) <= 0);

  // Move keyboard focus to the focused day whenever it changes.
  useEffect(() => {
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${toIso(focus)}"]`)?.focus();
  }, [focus]);

  const weeks = useMemo(() => {
    const first: Ymd = { y: focus.y, m: focus.m, d: 1 };
    const lead = weekday(first);
    const cells: (Ymd | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysIn(focus.y, focus.m); d++) cells.push({ y: focus.y, m: focus.m, d });
    while (cells.length % 7) cells.push(null);
    const out: (Ymd | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [focus.y, focus.m]);

  const onKey = (e: KeyboardEvent) => {
    let next: Ymd | null = null;
    switch (e.key) {
      case "ArrowLeft": next = addDays(focus, -1); break;
      case "ArrowRight": next = addDays(focus, 1); break;
      case "ArrowUp": next = addDays(focus, -7); break;
      case "ArrowDown": next = addDays(focus, 7); break;
      case "PageUp": next = addMonths(focus, e.shiftKey ? -12 : -1); break;
      case "PageDown": next = addMonths(focus, e.shiftKey ? 12 : 1); break;
      case "Home": next = addDays(focus, -weekday(focus)); break;
      case "End": next = addDays(focus, 6 - weekday(focus)); break;
      case "Escape":
        e.preventDefault();
        onClose();
        return;
      default:
        return;
    }
    e.preventDefault();
    setFocus(next);
  };

  const nav = (n: number) => setFocus((f) => addMonths(f, n));
  const navBtn = `${ui.btnIcon} !h-9 !w-9`;

  return (
    <div id={id} role="dialog" aria-modal="false" aria-labelledby={titleId} className="absolute left-0 z-30 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] portal-menu rounded-xl border border-gold-light bg-white p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-1">
        <span className="flex">
          <button type="button" className={navBtn} aria-label="Previous year" title="Previous year" onClick={() => nav(-12)}>
            <Icon name="chevronLeft" size="sm" />
            <Icon name="chevronLeft" className="-ml-2.5 h-4 w-4" />
          </button>
          <button type="button" className={navBtn} aria-label="Previous month" title="Previous month" onClick={() => nav(-1)}>
            <Icon name="chevronLeft" size="sm" />
          </button>
        </span>
        <p id={titleId} aria-live="polite" className="text-sm font-semibold text-ink">
          {MONTHS[focus.m - 1]} {focus.y}
        </p>
        <span className="flex">
          <button type="button" className={navBtn} aria-label="Next month" title="Next month" onClick={() => nav(1)}>
            <Icon name="chevronRight" size="sm" />
          </button>
          <button type="button" className={navBtn} aria-label="Next year" title="Next year" onClick={() => nav(12)}>
            <Icon name="chevronRight" size="sm" />
            <Icon name="chevronRight" className="-ml-2.5 h-4 w-4" />
          </button>
        </span>
      </div>
      <table ref={gridRef} role="grid" aria-labelledby={titleId} className="w-full table-fixed border-collapse text-center text-sm" onKeyDown={onKey}>
        <thead>
          <tr>
            {DAYS.map((d, i) => (
              <th key={d} scope="col" abbr={DAYS_LONG[i]} className="pb-1 text-xs font-medium text-ink/65">
                {d.slice(0, 2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((w, wi) => (
            <tr key={wi}>
              {w.map((c, ci) => {
                if (!c) return <td key={ci} />;
                const iso = toIso(c);
                const selected = iso === value;
                const isFocus = c.d === focus.d;
                const ok = allowed(iso);
                return (
                  <td key={ci} role="gridcell" aria-selected={selected} className="p-0.5">
                    <button
                      type="button"
                      data-iso={iso}
                      tabIndex={isFocus ? 0 : -1}
                      disabled={!ok}
                      aria-current={iso === today ? "date" : undefined}
                      aria-label={formatLongDate(iso)}
                      onClick={() => onPick(iso)}
                      className={`h-9 w-full rounded-lg tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-30 ${
                        selected ? "bg-forest-700 font-semibold text-white" : iso === today ? "font-semibold text-forest-700 ring-1 ring-inset ring-forest-200 hover:bg-cream" : "text-ink hover:bg-cream"
                      }`}
                    >
                      {c.d}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-snug text-ink/65">Arrow keys move the day, Page Up and Page Down the month (with Shift, the year). Enter picks.</p>
    </div>
  );
}
