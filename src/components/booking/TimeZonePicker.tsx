"use client";

import { useId, useMemo, useState } from "react";
import { COMMON_TIME_ZONES, gmtOffsetLabel, otherTimeZones, zoneLabel, type ZoneOption } from "@/lib/timezones";

const MAX_RESULTS = 60;

function matches(z: ZoneOption, q: string): boolean {
  const hay = `${z.label} ${z.tz.replace(/_/g, " ")} ${z.keywords ?? ""}`.toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

/**
 * Shows the time zone the booking times are in, with a "Change" button that
 * opens a searchable list: common zones for our families first, then every
 * zone the browser knows when the visitor searches.
 */
export function TimeZonePicker({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();
  const searchId = useId();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { common: COMMON_TIME_ZONES, other: [] as ZoneOption[] };
    const common = COMMON_TIME_ZONES.filter((z) => matches(z, q));
    const other = otherTimeZones().filter((z) => matches(z, q)).slice(0, Math.max(0, MAX_RESULTS - common.length));
    return { common, other };
  }, [query]);

  const choose = (tz: string) => {
    onChange(tz);
    setOpen(false);
    setQuery("");
  };

  const option = (z: ZoneOption) => {
    const offset = gmtOffsetLabel(z.tz);
    const selected = z.tz === value;
    return (
      <li key={z.tz}>
        <button
          type="button"
          onClick={() => choose(z.tz)}
          aria-current={selected ? "true" : undefined}
          className={`flex w-full min-h-10 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${selected ? "bg-gold-100 font-semibold text-ink" : "text-ink hover:bg-cream"}`}
        >
          <span>{z.label}</span>
          {offset && <span className="shrink-0 text-xs text-ink/65">{offset}</span>}
        </button>
      </li>
    );
  };

  const offset = gmtOffsetLabel(value);
  const none = results.common.length === 0 && results.other.length === 0;

  return (
    <div className="mt-2 text-sm">
      <p className="text-ink/70">
        Times are shown in <span className="font-semibold text-ink">{zoneLabel(value)}</span>
        {offset ? ` (${offset})` : ""}
        {value !== "Europe/London" ? ", with UK time alongside." : "."}{" "}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={listId}
          className="font-semibold text-gold-700 underline"
        >
          {open ? "Close" : "Change time zone"}
        </button>
      </p>
      {open && (
        <div id={listId} className="mt-2 rounded-xl border border-gold-light/60 bg-white p-3">
          <label htmlFor={searchId} className="block text-sm font-medium text-ink">
            Search by city or country
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="For example Dubai, Lahore, Toronto"
            autoComplete="off"
            autoFocus
            className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2"
          />
          <div className="mt-2 max-h-72 overflow-y-auto">
            {results.common.length > 0 && (
              <>
                <p className="px-3 pt-1 text-xs font-semibold uppercase tracking-wide text-ink/60">{query.trim() ? "Common time zones" : "Common time zones (search to see them all)"}</p>
                <ul className="mt-1 space-y-0.5">{results.common.map(option)}</ul>
              </>
            )}
            {results.other.length > 0 && (
              <>
                <p className="mt-2 px-3 pt-1 text-xs font-semibold uppercase tracking-wide text-ink/60">All time zones</p>
                <ul className="mt-1 space-y-0.5">{results.other.map(option)}</ul>
              </>
            )}
            {none && <p className="px-3 py-2 text-ink/65">No time zone matches that. Try the nearest large city.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
