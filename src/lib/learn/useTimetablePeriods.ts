"use client";

import { useEffect, useState } from "react";
import { fetchTimetablePeriods, type TimetablePeriod } from "@/lib/learn/timetable";

let cache: TimetablePeriod[] | null = null;
let inflight: Promise<TimetablePeriod[]> | null = null;

/**
 * Stored school-day periods (table timetable_periods), loaded once per page.
 * `null` while loading; `[]` when none are stored (callers then use the
 * built-in day via effectivePeriods()).
 */
export function useTimetablePeriods(): TimetablePeriod[] | null {
  const [periods, setPeriods] = useState<TimetablePeriod[] | null>(cache);
  useEffect(() => {
    if (cache) return;
    let alive = true;
    inflight = inflight ?? fetchTimetablePeriods();
    inflight.then((rows) => {
      cache = rows;
      inflight = null;
      if (alive) setPeriods(rows);
    });
    return () => {
      alive = false;
    };
  }, []);
  return periods;
}
