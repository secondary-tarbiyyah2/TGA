"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export type TermRow = {
  id: string;
  academic_year_id: string | null;
  name: string;
  starts_on: string;
  ends_on: string;
  half_term_starts_on: string | null;
  half_term_ends_on: string | null;
  source: "portal" | "sanity";
};
export type YearRow = { id: string; label: string; starts_on: string; ends_on: string };
export type ClosureKind = "inset" | "holiday" | "closure";
export type ClosureRow = { id: string; academic_year_id: string | null; kind: ClosureKind; name: string; starts_on: string; ends_on: string; notes: string | null };

export const CLOSURE_LABEL: Record<ClosureKind, string> = { inset: "INSET day", holiday: "Holiday", closure: "School closure" };

/** Terms, academic years and closures, with a reload() after edits. Tolerates migration 0052 not being applied yet. */
export function useCalendarTerms() {
  const [terms, setTerms] = useState<TermRow[] | null>(null);
  const [years, setYears] = useState<YearRow[]>([]);
  const [closures, setClosures] = useState<ClosureRow[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      let t = await supabase
        .from("terms")
        .select("id, academic_year_id, name, starts_on, ends_on, half_term_starts_on, half_term_ends_on, source")
        .order("starts_on");
      if (t.error) {
        // Migration 0052 not applied yet: fall back to the original columns.
        t = (await supabase.from("terms").select("id, academic_year_id, name, starts_on, ends_on").order("starts_on")) as typeof t;
      }
      const y = await supabase.from("academic_years").select("id, label, starts_on, ends_on").order("starts_on", { ascending: false });
      const c = await supabase.from("school_closures").select("id, academic_year_id, kind, name, starts_on, ends_on, notes").order("starts_on");
      if (cancelled) return;
      const rows = ((t.data as Partial<TermRow>[] | null) || []).map((r) => ({
        half_term_starts_on: null,
        half_term_ends_on: null,
        source: "sanity" as const,
        ...r,
      })) as TermRow[];
      setTerms(rows);
      setYears((y.data as YearRow[] | null) || []);
      setClosures((c.data as ClosureRow[] | null) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { terms, years, closures, reload };
}

/** What the school calendar says about one YYYY-MM-DD day. */
export function dayInfo(key: string, terms: TermRow[] | null, closures: ClosureRow[]) {
  const term = (terms || []).find((t) => t.starts_on <= key && key <= t.ends_on) || null;
  const halfTerm = !!term && !!term.half_term_starts_on && !!term.half_term_ends_on && term.half_term_starts_on <= key && key <= term.half_term_ends_on;
  const closure = closures.filter((c) => c.starts_on <= key && key <= c.ends_on);
  const boundary = (terms || []).find((t) => t.starts_on === key || t.ends_on === key);
  const boundaryLabel = boundary ? (boundary.starts_on === key ? `${boundary.name} starts` : `${boundary.name} ends`) : null;
  return { term, halfTerm, closure, boundaryLabel };
}
