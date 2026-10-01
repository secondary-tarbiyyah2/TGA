"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/** A dashboard card linking to the enrichment register, shown only to a member of staff who supervises an enrichment block. */
export function EnrichmentSupervisorLink() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      // Errors (for example before migration 0069 is applied) simply hide the card.
      const { count: n } = await supabase
        .from("timetable_periods")
        .select("id", { count: "exact", head: true })
        .eq("kind", "enrichment")
        .eq("active", true)
        .eq("supervisor_user_id", user.id);
      if (alive) setCount(n || 0);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (count === 0) return null;
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-green-200 bg-green-50 px-5 py-4">
      <div>
        <h2 className="font-serif text-h3 font-semibold text-ink">Enrichment you supervise</h2>
        <p className="text-sm text-ink/70">
          You supervise {count} enrichment block{count === 1 ? "" : "s"}. Tick who joined.
        </p>
      </div>
      <Link href="/teach/enrichment" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900">
        Open the register
      </Link>
    </section>
  );
}
