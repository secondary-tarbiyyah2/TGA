import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import Link from "next/link";
import { getFeeBands, getSiteSettings } from "@/lib/content";
import { formatGBP } from "@/lib/format";
import { FeeEstimator } from "@/components/FeeEstimator";

export const metadata: Metadata = {
  title: "Fees & Payment Plans",
  description: "Full, transparent fee table for every year group band, plus application and registration fees.",
};

export default async function FeesPage() {
  const [feeBands, settings] = await Promise.all([getFeeBands(), getSiteSettings()]);

  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Fees &amp; Payment Plans</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Transparent fees, no surprises.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            Every figure is published here — nothing shared only on enquiry. Choose annual, termly or monthly
            payment for any year group.
          </p>
          <p className="mt-3 max-w-2xl text-sm text-ink/60">
            Our first academic year runs January–July 2027 (two terms, since our first cohort starts in January) —
            the figures below are the full fee for that year. All fees are inclusive of 20% VAT.
          </p>
          <p className="mt-3 max-w-2xl text-sm text-ink/60">
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
              <thead className="bg-cream text-ink/70">
                <tr>
                  <th className="px-4 py-3 font-semibold">Year group</th>
                  <th className="px-4 py-3 font-semibold">Total (Jan–Jul 2027)</th>
                  <th className="px-4 py-3 font-semibold">Termly</th>
                  <th className="px-4 py-3 font-semibold">Monthly</th>
                </tr>
              </thead>
              <tbody>
                {feeBands.map((f) => (
                  <tr key={f._id} className="border-t border-gold-light/40 bg-white">
                    <td className="px-4 py-3 font-medium text-ink">{f.yearGroupRange}</td>
                    <td className="px-4 py-3 font-semibold text-gold-700">{formatGBP(f.annualFee)}</td>
                    <td className="px-4 py-3">{formatGBP(f.termlyFee)} / term</td>
                    <td className="px-4 py-3">{formatGBP(f.monthlyFee)} / month</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink/60">
            Term instalments are split evenly across the two terms in this first academic year; monthly instalments
            are spread across the same period.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-gold-700">Application fee</p>
              <p className="mt-1 font-serif text-3xl font-bold text-ink">£{settings.applicationFee}</p>
              <p className="mt-1 text-sm text-ink/60">Non-refundable, paid when you submit your application.</p>
            </div>
            <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-gold-700">Registration fee</p>
              <p className="mt-1 font-serif text-3xl font-bold text-ink">£{settings.registrationFee}</p>
              <p className="mt-1 text-sm text-ink/60">One-time, paid once a place is offered and accepted.</p>
            </div>
            {settings.siblingDiscountPercent != null && (
              <div className="rounded-2xl border border-gold-light/50 bg-white p-6 sm:col-span-2">
                <p className="text-sm font-semibold uppercase tracking-wide text-gold-700">Sibling discount</p>
                <p className="mt-1 font-serif text-3xl font-bold text-ink">{settings.siblingDiscountPercent}%</p>
                {settings.siblingDiscountNote && <p className="mt-1 text-sm text-ink/60">{settings.siblingDiscountNote}</p>}
              </div>
            )}
          </div>

          <div className="mt-10">
            <Kicker>Payment methods</Kicker>
            <p className="text-ink/70">
              Fees can be paid by bank transfer or card. Full payment instructions are shared once a place is
              offered.
            </p>
          </div>
        </Container>
      </section>

      <section id="estimator" className="bg-cream py-16">
        <Container>
          <Kicker>Estimate your fees</Kicker>
          <h2 className="font-serif text-2xl font-semibold text-ink sm:text-3xl">See a personalised estimate</h2>
          <p className="mt-2 max-w-2xl text-ink/70">
            Pick a year group and payment frequency to see the fee, with any discounts you qualify for applied.
          </p>
          <div className="mt-6 max-w-2xl">
            <FeeEstimator
              feeBands={feeBands}
              siblingDiscountPercent={settings.siblingDiscountPercent}
              siblingDiscountNote={settings.siblingDiscountNote}
              discounts={settings.discounts}
            />
          </div>
        </Container>
      </section>

      <CtaBand heading="Have a question about fees?" body="Our FAQs cover payment plans, bursaries and what's included." ctaLabel="Read the FAQs" ctaHref="/faqs" />
    </>
  );
}
