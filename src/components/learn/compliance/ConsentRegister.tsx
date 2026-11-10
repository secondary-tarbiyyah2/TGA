"use client";

import { Loading } from "@/components/learn/kit";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type ConsentRow = { id: number; category: string; given: boolean; wording_snapshot: string; given_at: string; children?: { name: string } | null };

/**
 * Staff-facing view of the consent register (0015_compliance.sql) · every
 * category (recording/marketing/photos), with the EXACT wording shown at
 * the time, not just a current boolean. Recording-consent rows here are
 * appended automatically by a trigger on recording_consents (Phase B), 
 * this table doesn't duplicate that concept, it's the append-only ledger
 * for it plus the two new categories.
 */
export function ConsentRegister() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<ConsentRow[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("consent_register")
      .select("id, category, given, wording_snapshot, given_at, children(name)")
      .order("given_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setRows((data as unknown as ConsentRow[]) || []));
  }, [supabase]);

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Consent register</h2>
      <p className="mt-1 text-xs text-ink/65">Recordings, marketing and photos, each entry keeps the exact wording shown at the time, even if the current wording later changes.</p>
      <ul className="mt-3 space-y-2">
        {rows === null && <Loading label="Loading…" bare />}
        {(rows || []).map((r) => (
          <li key={r.id} className="rounded-lg border border-gold-light/40 p-3 text-sm">
            <p className="font-semibold capitalize">{r.category} · {r.given ? "consent given" : "consent withdrawn"} {r.children?.name ? `(${r.children.name})` : ""}</p>
            <p className="mt-1 text-xs italic text-ink/65">&ldquo;{r.wording_snapshot}&rdquo;</p>
            <p className="mt-1 text-xs text-ink/65">{new Date(r.given_at).toLocaleString("en-GB")}</p>
          </li>
        ))}
        {rows?.length === 0 && <p className="text-sm text-ink/65">No consent decisions recorded yet.</p>}
      </ul>
    </div>
  );
}
