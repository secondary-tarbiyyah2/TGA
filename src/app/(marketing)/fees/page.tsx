import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { AdmissionsStrip } from "@/components/AdmissionsStrip";
import Link from "next/link";
import { getFeeBands, getSiteSettings } from "@/lib/content";
import { formatGBP } from "@/lib/format";
import { computeFeeSchedule, describePlan, roundingNote, FEE_DEFAULTS, FEE_POLICY_DEFAULTS } from "@/lib/fees";
import { FeeEstimator } from "@/components/FeeEstimator";

export const metadata: Metadata = pageMetadata({
  title: "Fees & Payment Plans",
  description: "Full, transparent fee table for every year group band, plus application and registration fees.",
  path: "/fees",
});

export default async function FeesPage() {
  const [feeBands, settings] = await Promise.all([getFeeBands(), getSiteSettings()]);
  const feeSettings = { terms: settings.feeTerms, instalments: settings.feeInstalments };
  const rows = feeBands.map((f) => {
    const sched = f.schedule ?? computeFeeSchedule(f.annualFee, feeSettings);
    return { band: f, sched, termly: describePlan(sched.termly, "term"), monthly: describePlan(sched.monthly, "month") };
  });
  const terms = rows[0]?.sched.terms ?? settings.feeTerms ?? FEE_DEFAULTS.terms;
  const discountPercent = settings.annualDiscountPercent ?? FEE_POLICY_DEFAULTS.annualDiscountPercent;
  const scheduleText = settings.paymentScheduleText || FEE_POLICY_DEFAULTS.paymentScheduleText;
  const instalments = rows[0]?.sched.instalments ?? settings.feeInstalments ?? FEE_DEFAULTS.instalments;

  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Fees &amp; Payment Plans</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Transparent fees, no surprises.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            Every figure is published here — nothing shared only on enquiry. Choose to pay annually, in two payments
            or monthly for any year group.
          </p>
          <p className="mt-3 max-w-2xl text-sm text-ink/70">
            Live lessons launch in January 2027, so the fees below are for the shortened January–July 2027 period.
            Choose to pay annually, in {terms} payments or monthly ({instalments} payments). All fees are
            inclusive of VAT. Examination fees are not included and are paid directly to the examination centre.
          </p>
          <p className="mt-3 max-w-2xl text-sm text-ink/70">
            Read the full{" "}
            <Link href="/policies" className="font-semibold text-gold-700 underline">Fees Policy</Link>{" "}
            before enrolling — it covers payment terms, refunds and what happens if a payment is missed.
          </p>
        </Container>
      </section>

      <section className="section-pad">
        <Container>
          <div className="overflow-x-auto rounded-2xl border border-gold-light/50">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">Tuition fees by year group: annual total, {terms} payments and monthly instalments</caption>
              <thead className="bg-cream text-ink/70">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Year group</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Annual (Jan–Jul 2027)</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{terms} payments</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Monthly ({instalments} payments)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ band: f, termly, monthly }) => (
                  <tr key={f._id} className="border-t border-gold-light/40 bg-white align-top">
                    <th scope="row" className="px-4 py-3 text-left font-medium text-ink">
                      {f.yearGroupRange}
                      {f.notes && <span className="mt-1 block text-xs font-normal text-ink/70">{f.notes}</span>}
                    </th>
                    <td className="px-4 py-3 font-semibold text-gold-700">
                      {formatGBP(f.annualFee)}
                      <span className="block text-xs font-normal text-ink/70">Total {formatGBP(f.annualFee)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {termly.headline}
                      <span className="block text-xs text-ink/70">{termly.detail}</span>
                    </td>
                    <td className="px-4 py-3">
                      {monthly.headline}
                      <span className="block text-xs text-ink/70">{monthly.detail}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink/70">
            Every payment plan adds up to exactly the annual total: each instalment is the annual fee divided by{" "}
            {terms} payments or {instalments} monthly payments, and if the division leaves a few pence over they are
            added to the final instalment. A {discountPercent}% discount applies when the annual option is chosen and
            paid in full by 8 January 2027.
          </p>
          {rows.some((r) => roundingNote(r.sched.monthly)) && (
            <p className="mt-1 text-xs text-ink/70">
              Monthly figures are rounded to the penny, so the final payment may be a penny or two different from the others.
            </p>
          )}

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-gold-700">Application fee</p>
              <p className="mt-1 font-serif text-3xl font-bold text-ink">£{settings.applicationFee}</p>
              <p className="mt-1 text-sm text-ink/70">Non-refundable. Covers the baseline assessment and administrative review. If not yet paid, send proof of payment with your offer acceptance.</p>
            </div>
            <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-gold-700">Registration fee</p>
              <p className="mt-1 font-serif text-3xl font-bold text-ink">£{settings.registrationFee}</p>
              <p className="mt-1 text-sm text-ink/70">One-off, due on acceptance of a place and no later than 8 January 2027. £125 for each additional sibling. Refundable only within the 14-day cancellation period.</p>
            </div>
            {settings.siblingDiscountPercent != null && (
              <div className="rounded-2xl border border-gold-light/50 bg-white p-6 sm:col-span-2">
                <p className="text-sm font-semibold uppercase tracking-wide text-gold-700">Sibling discount</p>
                <p className="mt-1 font-serif text-3xl font-bold text-ink">{settings.siblingDiscountPercent}%</p>
                {settings.siblingDiscountNote && <p className="mt-1 text-sm text-ink/70">{settings.siblingDiscountNote}</p>}
              </div>
            )}
          </div>

          <div className="mt-10">
            <Kicker>Payment dates</Kicker>
            <p className="mb-8 max-w-2xl text-ink/70">{scheduleText}</p>
            <Kicker>Payment methods</Kicker>
            <p className="text-ink/70">
              Fees can be paid by standing order (preferred for monthly plans), card or bank transfer, using your child&apos;s full name as the reference. Full payment instructions are shared with your offer, after the assessment and interview. You then send proof of payment (a screenshot or receipt) to confirm your place.
            </p>
          </div>
        </Container>
      </section>

      <section id="estimator" className="bg-cream py-16">
        <Container>
          <Kicker>Estimate your fees</Kicker>
          <h2 className="font-serif text-2xl font-semibold text-ink sm:text-3xl">See a personalised estimate</h2>
          <p className="mt-2 max-w-2xl text-ink/70">
            Choose how many children, each child&apos;s year group and your payment plan. We show a line for each child, the discounts that apply, your total and what you pay to secure a place.
          </p>
          <div className="mt-6 max-w-2xl">
            <FeeEstimator
              feeBands={feeBands}
              siblingDiscountPercent={settings.siblingDiscountPercent}
              siblingDiscountNote={settings.siblingDiscountNote}
              discounts={settings.discounts}
              annualDiscountPercent={discountPercent}
              applicationFee={settings.applicationFee}
              registrationFee={settings.registrationFee}
            />
          </div>
        </Container>
      </section>

      <AdmissionsStrip />

      <CtaBand heading="Have a question about fees?" body="Our FAQs cover payment plans, bursaries and what's included." ctaLabel="Read the FAQs" ctaHref="/faqs" />
    </>
  );
}
