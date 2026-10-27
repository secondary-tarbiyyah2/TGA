"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { completeness, DETAILS_SELECT, type PupilDetails } from "./data";

type Incomplete = { id: string; name: string; percent: number; missing: string[] };

/**
 * Family dashboard banner: child details are compulsory, so this stays on
 * screen (no dismiss button) until every child's record is complete. Reads
 * only the parent's own children (RLS) and uses the same completeness rules
 * as the form and the database.
 */
export function ChildDetailsBanner() {
  const [rows, setRows] = useState<Incomplete[] | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const [kids, det, cons] = await Promise.all([
        supabase.from("children").select("id, name, dob").order("name"),
        supabase.from("pupil_details").select(DETAILS_SELECT),
        supabase.from("pupil_emergency_contacts").select("child_id"),
      ]);
      if (cancelled || kids.error) return;
      const detailsBy = new Map(((det.data as unknown as PupilDetails[]) || []).map((d) => [d.child_id, d]));
      const countBy = new Map<string, number>();
      for (const c of (cons.data as unknown as { child_id: string }[]) || []) countBy.set(c.child_id, (countBy.get(c.child_id) || 0) + 1);
      const out: Incomplete[] = [];
      for (const k of (kids.data as unknown as { id: string; name: string; dob: string | null }[]) || []) {
        const p = completeness(detailsBy.get(k.id) || null, countBy.get(k.id) || 0, k.dob);
        if (p.percent < 100) out.push({ id: k.id, name: k.name, percent: p.percent, missing: p.items.filter((i) => !i.ok).map((i) => i.label) });
      }
      setRows(out);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rows || rows.length === 0) return null;

  return (
    <section role="alert" aria-label="Child details required" data-onboarding className="print:hidden rounded-2xl border-2 border-red-300 bg-red-50 p-5">
      <h2 className="text-base font-semibold text-red-900">Please complete your child&apos;s details</h2>
      <p className="mt-1 text-sm text-red-900/80">
        The school needs a home address, GP, health details, two emergency contacts and your consents for every pupil.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl bg-white/70 px-3 py-2 text-sm text-ink">
            <span className="font-semibold">{r.name}</span> <span className="text-ink/65">({r.percent}% complete)</span>
            <span className="block text-xs text-red-800">
              Still required: {r.missing.slice(0, 3).join(", ")}
              {r.missing.length > 3 ? ` and ${r.missing.length - 3} more` : ""}
            </span>
          </li>
        ))}
      </ul>
      <Link href="/family/child-details" className="mt-4 inline-block rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">
        Complete details now
      </Link>
    </section>
  );
}
