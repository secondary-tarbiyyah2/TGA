import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { PrelaunchPageHead, PrelaunchRegisterBand } from "@/components/prelaunch/PrelaunchPageHead";
import { getFeeBands, getSiteSettings } from "@/lib/content";
import { formatGBP } from "@/lib/format";
import { applyAnnualDiscount, computeFeeSchedule, FEE_DEFAULTS, FEE_POLICY_DEFAULTS } from "@/lib/fees";

// Public at /fees/ while the site is in pre-launch (public/.htaccess).
export const metadata: Metadata = pageMetadata({
  title: "Fees",
  description: "Tuition fees for Tarbiyyah Global Academy's founding year, January to July 2027, with payment options.",
  path: "/fees",
});

export default async function HoldingFeesPage() {
  const [bands, settings] = await Promise.all([getFeeBands(), getSiteSettings()]);
  const feeSettings = { terms: settings.feeTerms ?? FEE_DEFAULTS.terms, instalments: settings.feeInstalments ?? FEE_DEFAULTS.instalments };
  const discount = settings.annualDiscountPercent ?? FEE_POLICY_DEFAULTS.annualDiscountPercent;
  const rows = bands.map((b) => {
    const s = b.schedule ?? computeFeeSchedule(b.annualFee, feeSettings);
    return { band: b, s, full: applyAnnualDiscount(b.annualFee, discount).total };
  });
  const terms = rows[0]?.s.terms ?? feeSettings.terms;
  const instalments = rows[0]?.s.instalments ?? feeSettings.instalments;
  const schedule = settings.paymentScheduleText || FEE_POLICY_DEFAULTS.paymentScheduleText;

  return (
    <>
      <PrelaunchPageHead kicker="Founding year 2026–27" title="Fees">
        Fees for the founding year cover January to July 2027 and include VAT. Pay in full, in {terms} payments or in {instalments} monthly payments.
      </PrelaunchPageHead>
      <section className="pt-10">
        <Container className="max-w-4xl">
          {/* Phones: one card per year group. */}
          <ul className="space-y-4 sm:hidden">
            {rows.map(({ band, s, full }) => (
              <li key={band._id} className="rounded-2xl border border-gold-light/50 bg-white p-5">
                <p className="font-serif text-xl font-semibold text-ink">{band.yearGroupRange}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-ink/65">Year total</dt><dd className="text-right tabular-nums">{formatGBP(band.annualFee)}</dd>
                  <dt className="text-ink/65">Paid in full{discount ? ` (${discount}% off)` : ""}</dt><dd className="text-right font-semibold tabular-nums text-ink">{formatGBP(full)}</dd>
                  <dt className="text-ink/65">{terms} payments of</dt><dd className="text-right tabular-nums">{formatGBP(s.termly[0])}</dd>
                  <dt className="text-ink/65">{instalments} monthly payments of</dt><dd className="text-right tabular-nums">{formatGBP(s.monthly[0])}</dd>
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-2xl border border-gold-light/50 bg-white sm:block">
            <table className="w-full min-w-[600px] text-left text-sm">
              <caption className="sr-only">Tuition fees by year group</caption>
              <thead className="bg-ink text-white">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Year group</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Year total</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Paid in full{discount ? ` (${discount}% off)` : ""}</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">{terms} payments</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">{instalments} monthly</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold-light/40">
                {rows.map(({ band, s, full }) => (
                  <tr key={band._id} className="even:bg-gold-50">
                    <th scope="row" className="px-4 py-3 font-semibold text-ink">{band.yearGroupRange}</th>
                    <td className="px-4 py-3 text-right tabular-nums">{formatGBP(band.annualFee)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">{formatGBP(full)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatGBP(s.termly[0])}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatGBP(s.monthly[0])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-ink/65">
            Instalments add up exactly to the year total; where the split leaves a few pence, the last payment is adjusted. Examination fees are not included.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            <div className="rounded-2xl border border-gold-light/50 bg-white p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-gold-700">Application fee</p>
              <p className="mt-1 font-serif text-3xl font-semibold text-ink">{formatGBP(settings.applicationFee ?? FEE_POLICY_DEFAULTS.applicationFee).replace(".00", "")}</p>
              <p className="mt-1 text-sm text-ink/70">Non-refundable, paid when you apply.</p>
            </div>
            <div className="rounded-2xl border border-gold-light/50 bg-white p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-gold-700">Registration fee</p>
              <p className="mt-1 font-serif text-3xl font-semibold text-ink">{formatGBP(settings.registrationFee ?? FEE_POLICY_DEFAULTS.registrationFee).replace(".00", "")}</p>
              <p className="mt-1 text-sm text-ink/70">One-off, on accepting a place; half for each additional sibling.</p>
            </div>
            <div className="rounded-2xl border border-gold-light/50 bg-white p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-gold-700">Sibling discount</p>
              <p className="mt-1 font-serif text-3xl font-semibold text-ink">5–10%</p>
              <p className="mt-1 text-sm text-ink/70">5% off the second child&apos;s tuition, 10% off the third and later.</p>
            </div>
          </div>

          <h2 className="mt-12 font-serif text-2xl font-semibold text-ink">Payment dates</h2>
          <p className="mt-3 text-ink/75">{schedule}</p>
        </Container>
      </section>
      <PrelaunchRegisterBand />
    </>
  );
}
