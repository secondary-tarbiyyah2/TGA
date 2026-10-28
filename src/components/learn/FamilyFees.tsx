"use client";

import { useEffect, useState } from "react";
import { getFeeBands, getSiteSettings } from "@/lib/content";
import { matchFeeBand } from "@/lib/learn/fees";
import { estimateFamilyFees, FEE_DEFAULTS } from "@/lib/fees";
import { formatGBP } from "@/lib/format";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { FeeBand } from "@/content/seed";
import { Icon } from "@/components/learn/Icon";

type Child = { id: string; name: string; year_groups?: { name: string } | null };

/**
 * This family's actual billing view, distinct from the public /fees
 * estimator (which is a self-serve, no-data-collected calculator anyone can
 * play with). Here, "siblings enrolled" is read from this family's real
 * `enrolments`, not typed in by hand, so the sibling discount line reflects
 * what's actually true today.
 *
 * Only the sibling discount is computed automatically. The other
 * eligibility-based discounts in Sanity's `discounts` catalogue
 * (bursaries, staff discount, etc.) require an admissions decision per
 * family that no system in this codebase yet records, showing them here
 * as "applied" would be inventing a fact (ground rule 2), so this view
 * simply omits that section rather than guess. See the final report.
 */
export function FamilyFees({ familyChildren }: { familyChildren: Child[] }) {
  const supabase = getSupabaseClient();
  const [feeBands, setFeeBands] = useState<FeeBand[] | null>(null);
  const [siblingDiscountPercent, setSiblingDiscountPercent] = useState<number | undefined>(undefined);
  const [siblingDiscountNote, setSiblingDiscountNote] = useState<string | undefined>(undefined);
  const [enrolledChildIds, setEnrolledChildIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const [bands, settings] = await Promise.all([getFeeBands(), getSiteSettings()]);
      setFeeBands(bands);
      setSiblingDiscountPercent(settings.siblingDiscountPercent);
      setSiblingDiscountNote(settings.siblingDiscountNote);
    })();
  }, []);

  useEffect(() => {
    if (!supabase || familyChildren.length === 0) return;
    supabase
      .from("enrolments")
      .select("child_id")
      .in(
        "child_id",
        familyChildren.map((c) => c.id),
      )
      .then(({ data }) => setEnrolledChildIds(new Set((data || []).map((e) => e.child_id as string))));
  }, [supabase, familyChildren]);

  if (!feeBands) return null;

  const enrolledCount = familyChildren.filter((c) => enrolledChildIds.has(c.id)).length;
  const rows = familyChildren.map((child) => ({ child, band: matchFeeBand(child.year_groups?.name, feeBands) })).filter((r): r is { child: Child; band: FeeBand } => r.band !== null);

  if (rows.length === 0) return null;

  const hasSiblingDiscount = (siblingDiscountPercent ?? 0) > 0 && enrolledCount >= 2;
  // Prospectus p.18 / Fees Policy: the discount is on the younger siblings' tuition
  // (5% second child, 10% third and later), never on the first child.
  const sibling = hasSiblingDiscount
    ? estimateFamilyFees({
        children: rows.map((r) => ({ label: r.child.name, annual: r.band.annualFee })),
        plan: "annual",
        terms: FEE_DEFAULTS.terms,
        instalments: FEE_DEFAULTS.instalments,
        annualDiscountPercent: 0,
        siblingDiscountPercent,
        applicationFee: 0,
      }).perChild
    : null;

  return (
    <details className="group mt-6 rounded-2xl border border-gold-light bg-white">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3">
        <span>
          <span className="block font-semibold text-ink">Published fees for your children</span>
          <span className="block text-sm text-ink/65">Annual fee for each child&apos;s year group, for reference.</span>
        </span>
        <Icon name="chevronDown" className="h-4 w-4 shrink-0 text-ink/65 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-gold-light p-5">
        <div className="space-y-3">
          {rows.map(({ child, band }, i) => {
            const discount = sibling?.[i]?.siblingDiscount ?? 0;
            return (
              <div key={child.id} className="rounded-xl bg-cream p-4">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-medium text-ink">{child.name}</span>
                  <span className="text-xs text-ink/65">{band.yearGroupRange}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-ink/70">Annual fee</span>
                  <span className="font-medium text-ink">{formatGBP(band.annualFee)}</span>
                </div>
                {discount > 0 && (
                  <div className="mt-1 flex items-center justify-between text-sm text-gold-700">
                    <span>Sibling discount{siblingDiscountNote ? ` (${siblingDiscountNote})` : ""}</span>
                    <span>−{formatGBP(discount)}</span>
                  </div>
                )}
                {band.notes && <p className="mt-2 text-xs text-ink/65">{band.notes}</p>}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-ink/65">
          See the{" "}
          <a href="https://globalacademy.tarbiyyah.co.uk/fees/" target="_blank" rel="noopener noreferrer" className="underline">
            full published fee table and payment options
          </a>
          . Contact the school office for a binding invoice or to query billing.
        </p>
      </div>
    </details>
  );
}
