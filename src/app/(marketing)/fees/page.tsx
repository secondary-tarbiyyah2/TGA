import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import Link from "next/link";
import { getFeeBands, getSiteSettings } from "@/lib/content";
import { formatGBP } from "@/lib/format";
import { computeFeeSchedule, describePlan, roundingNote, FEE_DEFAULTS, FEE_POLICY_DEFAULTS } from "@/lib/fees";
import { FeeCalculatorPanel } from "@/components/FeeCalculatorPanel";
import { PayOnline } from "@/components/PayOnline";

export const metadata: Metadata = pageMetadata({
  title: "Fees & Payment Plans",
  description: "Full, transparent fee table for every year group band, plus the application fee and payment dates.",
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
      <section className="geo-texture bg-cream hero-pad">
        <Container>
          <Kicker>Fees &amp; payment plans</Kicker>
          <h1 className="text-h1 font-serif font-semibold text-ink">Fees for January to July 2027.</h1>
          <p className="mt-5 max-w-2xl text-lg text-ink/75">
            Every figure is published here, nothing shared only on enquiry. Live lessons start in January 2027, so these
            fees cover the shortened first year. Pay annually, in {terms} payments or monthly ({instalments} payments).
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink/70" aria-label="Good to know">
            {["All fees include VAT", settings.applicationFee != null ? `Application fee £${settings.applicationFee}, no registration fee` : "No registration fee", "Exam entry fees are paid to the exam centre"].map((fact) => (
              <li key={fact} className="flex items-center gap-2">
                <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
                {fact}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <FeeCalculatorPanel
              feeBands={feeBands}
              siblingDiscountPercent={settings.siblingDiscountPercent}
              siblingDiscountNote={settings.siblingDiscountNote}
              discounts={settings.discounts}
              annualDiscountPercent={discountPercent}
              applicationFee={settings.applicationFee}
            />
          </div>
        </Container>
      </section>

      <section className="section-pad">
        <Container>
          {/* Phones: one card per year group, so nothing is hidden off the edge of a wide table. */}
          <ul className="space-y-3 md:hidden">
            {rows.map(({ band: f, termly, monthly }) => (
              <li key={f._id} className="rounded-2xl border border-gold-light/50 bg-white p-4">
                <p className="font-semibold text-ink">{f.yearGroupRange}</p>
                {f.notes && <p className="mt-1 text-xs text-ink/70">{f.notes}</p>}
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-ink/70">Annual (Jan–Jul 2027)</dt>
                  <dd className="font-semibold text-gold-700">{formatGBP(f.annualFee)}</dd>
                  <dt className="text-ink/70">{terms} payments</dt>
                  <dd><span className="font-medium text-ink">{termly.headline}</span><span className="block text-xs text-ink/70">{termly.detail}</span></dd>
                  <dt className="text-ink/70">Monthly ({instalments})</dt>
                  <dd><span className="font-medium text-ink">{monthly.headline}</span><span className="block text-xs text-ink/70">{monthly.detail}</span></dd>
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-2xl border border-gold-light/50 md:block">
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
                    <td className="px-4 py-3 font-semibold text-gold-700">{formatGBP(f.annualFee)}</td>
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
            added to the final instalment. Under every plan the first payment is due when you accept your place. A{" "}
            {discountPercent}% discount applies when the annual option is chosen and paid in full on acceptance (by 8
            January 2027 at the latest).
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
              <p className="mt-1 text-sm text-ink/70">Non-refundable. We email the payment details after you apply, and it must be paid before a place is confirmed. It covers the entry assessment and the review of your application.</p>
            </div>
            <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-gold-700">Securing your place</p>
              <p className="mt-1 font-serif text-3xl font-bold text-ink">On acceptance</p>
              <p className="mt-1 text-sm text-ink/70">Your first fee payment is due when you accept your place, within five working days of your offer and no later than 8 January 2027. Your child&apos;s place is held once it is paid; the remaining payments then follow the dates below. The application fee is the only admissions fee.</p>
            </div>
            {settings.siblingDiscountPercent != null && (
              <div className="rounded-2xl border border-gold-light/50 bg-white p-6 sm:col-span-2">
                <p className="text-sm font-semibold uppercase tracking-wide text-gold-700">Sibling discount</p>
                <p className="mt-1 font-serif text-3xl font-bold text-ink">{settings.siblingDiscountPercent}%</p>
                {settings.siblingDiscountNote && <p className="mt-1 text-sm text-ink/70">{settings.siblingDiscountNote}</p>}
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
              <h2 className="font-serif text-lg font-semibold text-ink">Payment dates</h2>
              <p className="mt-2 text-sm text-ink/70">{scheduleText}</p>
            </div>
            <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
              <h2 className="font-serif text-lg font-semibold text-ink">How to pay</h2>
              <p className="mt-2 text-sm text-ink/70">
                Online, by debit or credit card or straight from your bank app, on our secure payment page, with your child&apos;s full name as the reference. The link comes with your offer, after the assessment and interview, and is on the Fees page of the Parent Portal.
              </p>
              <PayOnline url={settings.onlinePaymentUrl} className="mt-4" />
            </div>
          </div>
          <p className="mt-6 text-sm text-ink/70">
            Please read the{" "}
            <Link href="/policies/25-fees" className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900">Fees Policy</Link>{" "}
            before enrolling. It covers payment terms, refunds and what happens if a payment is missed.
          </p>
          <p className="mt-3 text-sm text-ink/70">
            Want a figure for your family?{" "}
            <a href="#calculator" className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900">Work out your fees</a>.
          </p>
        </Container>
      </section>


      <CtaBand heading="Ready to apply?" body="Apply by Friday 18 December 2026 for the founding cohort. The form takes about ten minutes." ctaLabel="Apply now" ctaHref="/admissions/apply" />
    </>
  );
}
