"use client";

import { Loading } from "@/components/learn/kit";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export type SafeguardingLead = { full_name: string; kind: "safeguarding_lead" | "head_teacher"; role_label: string };

/** Who receives a reported concern: safeguarding_contacts() (0086) returns names and job roles only. null while loading / on error. */
export function useSafeguardingLeads(): SafeguardingLead[] | null {
  const [leads, setLeads] = useState<SafeguardingLead[] | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    supabase.rpc("safeguarding_contacts").then(({ data, error }) => {
      if (cancelled || error) return;
      setLeads((data as SafeguardingLead[] | null) || []);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return leads;
}

/** "A, B and C" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Prominent card for the safeguarding/compliance page: who the Designated Safeguarding Lead(s) are. */
export function SafeguardingLeadsBanner({ canManage = false }: { canManage?: boolean }) {
  const leads = useSafeguardingLeads();
  const dsl = (leads || []).filter((l) => l.kind === "safeguarding_lead").map((l) => l.full_name);
  const heads = (leads || []).filter((l) => l.kind === "head_teacher").map((l) => l.full_name);
  return (
    <section aria-label="Designated Safeguarding Lead" className="rounded-2xl border-2 border-teal-200 bg-teal-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-teal-900/70">Designated Safeguarding Lead</p>
      {leads === null ? (
        <Loading label="Loading…" bare className="mt-1" />
      ) : dsl.length > 0 ? (
        <p className="mt-1 font-serif text-h3 font-semibold text-ink">{joinNames(dsl)}</p>
      ) : (
        <p className="mt-1 text-sm font-semibold text-red-800">No Designated Safeguarding Lead has been assigned yet.</p>
      )}
      <p className="mt-1 text-xs text-ink/65">
        Concerns also go to the Headteacher{heads.length > 0 ? ` (${joinNames(heads)})` : ""}.{" "}
        {canManage ? (
          <>
            To change who this is, open <Link href="/admin/staff" className="font-medium text-teal-800 underline">Staff</Link>, choose the person and use the Designated Safeguarding Lead switch.
          </>
        ) : (
          "Only the Headteacher can change this."
        )}
      </p>
    </section>
  );
}
