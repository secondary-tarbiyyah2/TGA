"use client";

import { useState } from "react";
import { STATUS_LABELS, type ApplicationRow } from "@/components/admissions/applicationShared";
import { bandForYearGroup, gbp } from "@/components/learn/admissions/paymentCalc";
import type { AdmissionsContext } from "@/components/learn/admissions/useAdmissionsContext";
import { FEE_DEFAULTS, FEE_POLICY_DEFAULTS, estimateFamilyFees } from "@/lib/fees";

const fullName = (a: Pick<ApplicationRow, "child_first_name" | "child_last_name">) => `${a.child_first_name} ${a.child_last_name}`.trim();

/** "Sibling of Aisha Khan" for any child after the first, else "Family of 3". Null for a child applying alone. */
export function siblingBadgeText(app: ApplicationRow, family: ApplicationRow[]): string | null {
  if (!app.family_id || family.length < 2) return null;
  const lead = family[0];
  return lead.id === app.id ? `Family of ${family.length}` : `Sibling of ${fullName(lead)}`;
}

/**
 * Linked applications (one family, one form), with one-click jumps between them,
 * the sibling discount worked out with the same estimator the public form uses,
 * and who the legal parent or guardian is for this child.
 */
export function FamilyPanel({
  app,
  family,
  ctx,
  onOpen,
}: {
  app: ApplicationRow;
  family: ApplicationRow[];
  ctx: AdmissionsContext;
  onOpen: (id: string) => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!app.family_id || family.length < 2) return null;

  const settings = ctx.settings;
  const sibPct = settings?.sibling_discount_percent && settings.sibling_discount_percent > 0 ? settings.sibling_discount_percent : 0;
  const estimate = estimateFamilyFees({
    children: family.map((f) => ({ label: fullName(f), annual: bandForYearGroup(f.year_group_applying, ctx.bands)?.annual_fee ?? 0 })),
    plan: ctx.fees.activePlan ?? "monthly",
    terms: settings?.fee_terms ?? FEE_DEFAULTS.terms,
    instalments: settings?.fee_instalments ?? FEE_DEFAULTS.instalments,
    annualDiscountPercent: settings?.annual_discount_percent ?? FEE_POLICY_DEFAULTS.annualDiscountPercent,
    siblingDiscountPercent: sibPct > 0 ? sibPct : undefined,
    applicationFee: ctx.fees.applicationFee,
  });
  const myIndex = family.findIndex((f) => f.id === app.id);
  const mine = estimate.perChild[myIndex];
  const lead = family[0];

  async function applyDiscount() {
    if (!mine || mine.gross <= 0) return;
    setSaving(true);
    setMsg(null);
    const ok = await ctx.saveDetails({ annual_fee_override: mine.net });
    setSaving(false);
    setMsg(ok ? `Annual fee for ${app.child_first_name} set to ${gbp(mine.net)}. The Payments tab and offer email now use it.` : "Couldn't save the annual fee. Please try again.");
  }

  return (
    <section aria-label="Family" className="rounded-xl border border-gold-light/50 bg-cream/50 p-4">
      <h3 className="font-serif text-lg font-semibold text-ink">Family</h3>
      <p className="mt-1 text-xs text-ink/65">
        {family.length} applications were submitted together by {lead.parent_name} ({lead.parent_email}). Each child is a separate application; the contact details are shared.
      </p>
      <ul className="mt-3 divide-y divide-gold-light/40 rounded-lg border border-gold-light/50 bg-white">
        {family.map((f, i) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-medium text-ink">{fullName(f)}</span>
              <span className="block text-xs text-ink/65">
                {f.year_group_applying} · {f.reference || "No reference"} · {STATUS_LABELS[f.status]}
                {i === 0 ? " · first child (parent ID)" : ""}
              </span>
            </span>
            {f.id === app.id ? (
              <span className="rounded-full bg-teal-700 px-2.5 py-0.5 text-xs font-semibold text-white">This application</span>
            ) : (
              <button type="button" onClick={() => onOpen(f.id)} className="rounded-lg border border-gold-light px-3 py-1 text-xs font-semibold text-ink/80 hover:bg-white">
                Open {f.child_first_name}
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 text-sm text-ink">
        <p className="font-medium">Fees for the family (estimate)</p>
        {sibPct > 0 ? (
          <p className="text-xs text-ink/65">Sibling discount: {sibPct}% off from the second child onwards, in the order they were entered on the form.</p>
        ) : (
          <p className="text-xs text-ink/65">No sibling discount percentage is set in the fee settings, so none is applied.</p>
        )}
        <ul className="mt-2 space-y-1">
          {estimate.perChild.map((c, i) => (
            <li key={family[i].id} className={`flex flex-wrap justify-between gap-x-3 ${family[i].id === app.id ? "font-semibold" : ""}`}>
              <span className="min-w-0 break-words">{c.label}</span>
              <span>
                {c.gross <= 0 ? "fee to be confirmed" : c.siblingDiscount > 0 ? `${gbp(c.gross)} - ${gbp(c.siblingDiscount)} sibling discount = ${gbp(c.net)}` : gbp(c.gross)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex flex-wrap justify-between gap-x-3 border-t border-gold-light/40 pt-1">
          <span>Family total after discounts</span>
          <strong>{gbp(estimate.total)}</strong>
        </p>
        {mine && mine.siblingDiscount > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={applyDiscount} disabled={saving} className="rounded-lg bg-gold-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
              {saving ? "Saving…" : `Apply ${app.child_first_name}'s discount to their fees`}
            </button>
            <span className="text-xs text-ink/65">Sets this child&apos;s annual fee override to {gbp(mine.net)}.</span>
          </div>
        )}
        {msg && <p role="status" className="mt-1 text-xs text-ink/70">{msg}</p>}
      </div>

      <p className="mt-3 text-sm text-ink">
        <span className="font-medium">Legal parent or guardian: </span>
        {app.guardian_is_other
          ? `${app.guardian_name || "Someone else"}${app.guardian_relationship ? ` (${app.guardian_relationship})` : ""}, ${app.guardian_email || "no email"}, ${app.guardian_phone || "no phone"}. Their ID is on this application.`
          : `Same as the family contact${app.sibling_index && app.sibling_index > 1 ? `. The photo ID and proof of address are shared with ${fullName(lead)}'s application.` : "."}`}
      </p>
    </section>
  );
}
