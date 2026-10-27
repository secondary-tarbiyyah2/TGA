"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { convertSlotToLocal } from "./timezone";

export type SampleWeekSlot = {
  subject: string;
  weekdayName: string;
  startLabel: string;
  endLabel: string;
};

export type SampleWeekState = {
  loading: boolean;
  slots: SampleWeekSlot[] | null; // null = not yet loaded / Supabase unavailable; [] = loaded, genuinely no published sample for this year group
  updatedAt: string | null;
};

const WEEKDAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Reads the REAL published per-year-group sample week from the LMS via
 * public_sample_timetable_week(year_group_name) (0016), converts each slot
 * from its stored base timezone (Europe/London) into the family's own
 * timezone with correct DST handling, and NEVER fabricates a week, an
 * empty array here means genuinely nothing has been published yet for this
 * year group, and the result screen must render the honest fallback, not
 * invent a plausible-looking timetable.
 */
export function useSampleWeek(yearGroupName: string | null, familyTimezone: string | null): SampleWeekState {
  const [state, setState] = useState<SampleWeekState>({ loading: true, slots: null, updatedAt: null });

  useEffect(() => {
    let cancelled = false;
    if (!yearGroupName || !familyTimezone) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load with no external subscription, not a render-cycle sync
      setState({ loading: false, slots: null, updatedAt: null });
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setState({ loading: false, slots: null, updatedAt: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    supabase
      .rpc("public_sample_timetable_week", { p_year_group_name: yearGroupName })
      .then(
        ({ data, error }) => {
          if (cancelled) return;
          if (error || !data) {
            setState({ loading: false, slots: null, updatedAt: null });
            return;
          }
          type Row = { subject: string; weekday: number; start_time: string; end_time: string; sample_updated_at: string | null };
          const rows = data as Row[];
          const converted = rows
            .map((row) => {
              const local = convertSlotToLocal(row.weekday, row.start_time, row.end_time, familyTimezone);
              return { subject: row.subject, weekdayName: local.weekdayName, startLabel: local.startLabel, endLabel: local.endLabel };
            })
            .sort((a, b) => WEEKDAY_ORDER.indexOf(a.weekdayName) - WEEKDAY_ORDER.indexOf(b.weekdayName) || a.startLabel.localeCompare(b.startLabel));
          setState({
            loading: false,
            slots: converted,
            updatedAt: rows[0]?.sample_updated_at ?? null,
          });
        },
        () => {
          if (!cancelled) setState({ loading: false, slots: null, updatedAt: null });
        }
      );
    return () => {
      cancelled = true;
    };
  }, [yearGroupName, familyTimezone]);

  return state;
}
