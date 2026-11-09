"use client";

import { useEffect, useId, useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function daysIn(year: number, month: number): number {
  return new Date(year || 2000, month, 0).getDate();
}

/**
 * Date of birth as Day / Month / Year, in the portal's own dropdowns (owner,
 * Nov 2026: "the date picker needs to be smoother and designed in line with
 * the system's brand"). A browser calendar makes you page back years to reach
 * a child's birthday; three short lists don't. Typing the first letters or
 * digits jumps in each list. Value is "YYYY-MM-DD", or "" until all three are
 * chosen.
 */
export function DateOfBirthField({
  label = "Date of birth",
  value,
  onChange,
  minAge = 3,
  maxAge = 20,
  hint,
}: {
  label?: string;
  value: string;
  onChange: (iso: string) => void;
  minAge?: number;
  maxAge?: number;
  hint?: React.ReactNode;
}) {
  const id = useId();
  const [y0, m0, d0] = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-") : ["", "", ""];
  const [day, setDay] = useState(d0 ? String(Number(d0)) : "");
  const [month, setMonth] = useState(m0 ? String(Number(m0)) : "");
  const [year, setYear] = useState(y0);

  // Follow a value set from outside (e.g. the form being reset).
  useEffect(() => {
    if (value === "") return;
    const [y, m, d] = value.split("-");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors an external value into the three lists
    setDay(String(Number(d)));
    setMonth(String(Number(m)));
    setYear(y);
  }, [value]);

  const emit = (d: string, m: string, y: string) => {
    if (!d || !m || !y) return onChange("");
    const max = daysIn(Number(y), Number(m));
    const dd = Math.min(Number(d), max);
    onChange(`${y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`);
  };

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: maxAge - minAge + 1 }, (_, i) => String(thisYear - minAge - i));
  const maxDay = month ? daysIn(Number(year), Number(month)) : 31;
  const trigger = "min-h-11 rounded-lg border border-gold-light px-3 py-2 text-sm sm:min-h-10";

  return (
    <fieldset className="text-sm">
      <legend id={`${id}-l`} className="mb-1 block font-medium text-ink">
        {label}
      </legend>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_5.5rem] gap-2">
        <Dropdown
          aria-label={`${label}: day`}
          value={day}
          placeholder="Day"
          searchable={false}
          options={Array.from({ length: maxDay }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
          onChange={(v) => {
            setDay(v);
            emit(v, month, year);
          }}
          className={trigger}
        />
        <Dropdown
          aria-label={`${label}: month`}
          value={month}
          placeholder="Month"
          searchable={false}
          options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
          onChange={(v) => {
            setMonth(v);
            emit(day, v, year);
          }}
          className={trigger}
        />
        <Dropdown
          aria-label={`${label}: year`}
          value={year}
          placeholder="Year"
          searchable={false}
          options={years.map((y) => ({ value: y, label: y }))}
          onChange={(v) => {
            setYear(v);
            emit(day, month, v);
          }}
          className={trigger}
        />
      </div>
      {hint && <div className="mt-1 text-xs text-ink/70">{hint}</div>}
    </fieldset>
  );
}
