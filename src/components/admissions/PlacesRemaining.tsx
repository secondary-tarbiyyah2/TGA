"use client";

import { useEffect, useState } from "react";
import { Container } from "@/components/Container";
import { getSupabaseClient } from "@/lib/supabase/client";

type Row = { year_group_id: string; name: string; sort_order: number; capacity: number | null; places_remaining: number | null };

/**
 * Reads public.year_group_places (migration 0019) · a view, not a typed
 * number anywhere in this component, so there is nothing here to keep in
 * sync by hand. Only year groups an admin has actually set a capacity for
 * appear at all; this never shows a placeholder or "spaces available"
 * for one that's unset.
 */
export function PlacesRemaining() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("year_group_places")
      .select("year_group_id, name, sort_order, capacity, places_remaining")
      .not("capacity", "is", null)
      .order("sort_order")
      .then(({ data }) => setRows((data as Row[]) || []));
  }, []);

  if (!rows || rows.length === 0) return null;

  return (
    <section className="pb-14 sm:pb-20" aria-labelledby="places-remaining-heading">
      <Container>
        <h2 id="places-remaining-heading" className="text-h3 font-serif font-semibold text-ink">
          Places remaining
        </h2>
        <p className="mt-2 text-sm text-ink/70">Updated in real time as places are confirmed.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <div key={r.year_group_id} className="rounded-xl border border-gold-light/50 bg-white p-4">
              <p className="font-medium text-ink">{r.name}</p>
              {r.places_remaining === 0 ? (
                <p className="mt-1 text-sm text-red-700">
                  This year group is full.{" "}
                  <a href="/contact" className="underline">Contact us</a>.
                </p>
              ) : (
                <p className="mt-1 text-sm text-ink/70">
                  {r.places_remaining} place{r.places_remaining === 1 ? "" : "s"} left of {r.capacity}
                </p>
              )}
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
