"use client";

import { useEffect, useMemo, useState } from "react";
import { FALLBACK_PERIODS } from "@/lib/learn/timetable";
import { PlacePicker } from "@/components/booking/PlacePicker";
import { initialPlace, savePlace, type Place } from "@/lib/place";

// A real, non-DST-ambiguous reference date (mid-March, before the UK's
// clock change) used purely to anchor the UK wall-clock times below to an
// actual instant so Intl can convert them, the times themselves (from
// FALLBACK_PERIODS, the scheduling engine's built-in school day) are real, not invented.
function ukTimeOnRefDate(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2027, 2, 1, h, m));
}

function formatInZone(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(d);
}

/**
 * Converts the school day (FALLBACK_PERIODS, the built-in prospectus day in
 * src/lib/learn/timetable.ts: Monday-Thursday 09:00-15:00, Friday
 * 09:00-12:00 then Jumu'ah) into a chosen home timezone with real Intl
 * timezone math, so a family can see whether our lesson times work for
 * where they live.
 */
export function TimezoneConverter() {
  // Server render shows the UK; the visitor's own place (saved, or from their device) replaces it on load.
  const [place, setPlace] = useState<Place>({ country: "GB", tz: "Europe/London", source: "device" });
  // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage and the device's zone only exist after mount (static page)
  useEffect(() => setPlace(initialPlace()), []);
  const tz = place.tz;

  const bands = useMemo(() => {
    const span = (weekday: number) => {
      const day = FALLBACK_PERIODS.filter((p) => p.weekdays.includes(weekday));
      return { start: day.reduce((m, p) => (p.start_time < m ? p.start_time : m), "23:59"), end: day.reduce((m, p) => (p.end_time > m ? p.end_time : m), "00:00") };
    };
    const grouped = [
      { band: "Monday to Thursday", ...span(1) },
      { band: "Friday", ...span(5) },
    ];
    return grouped.map((g) => ({
      ...g,
      localStart: formatInZone(ukTimeOnRefDate(g.start), tz),
      localEnd: formatInZone(ukTimeOnRefDate(g.end), tz),
    }));
  }, [tz]);

  return (
    <div className="rounded-3xl border-2 border-gold-300 bg-white p-8 shadow-warm">
      <PlacePicker
        country={place.country}
        tz={tz}
        fromDevice={place.source === "device"}
        onChange={(country, next) => {
          setPlace({ country, tz: next, source: "saved" });
          savePlace(country, next);
        }}
        title="Where's home?"
        compact
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {bands.map((b) => (
          <div key={b.band} className="rounded-2xl bg-cream p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">{b.band}</p>
            <p className="mt-1 font-serif text-2xl font-semibold text-ink">
              {b.localStart}–{b.localEnd}
            </p>
            <p className="mt-1 text-xs text-ink/70">
              {b.start}–{b.end} UK time
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-ink/70">
        All live lessons run in this UK school day. To check whether it suits your timezone, see our{" "}
        <a href="/eligibility" className="font-semibold text-gold-700 underline">Is it right for us?</a> or book an admissions
        call to talk it through.
      </p>
    </div>
  );
}
