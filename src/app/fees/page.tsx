import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker, PlaceholderNote } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { getFeeBands, getSiteSettings } from "@/lib/content";

export const metadata: Metadata = {
  title: "Fees & Payment Plans",
  description: "Full, transparent fee table for every year group band, plus application and registration fees.",
};

export default async function FeesPage() {
  const [feeBands, settings] = await Promise.all([getFeeBands(), getSiteSettings()]);

  return (
    <>
      <section className="geo-texture bg-cream py-16">
        <Container>
          <Kicker>Fees &amp; Payment Plans</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Transparent fees, no surprises.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            Every figure is published here — nothing shared only on enquiry. Choose annual, termly or monthly
            payment for any year group.
          </p>
        </Container>
      </section>

      <section className="py-16">
        <Container>
          <div className="overflow-x-auto rounded-2xl border border-gold-light/50">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-cream text-ink/70">
                <tr>
                  <th className="px-4 py-3 font-semibold">Year group</th>
                  <th className="px-4 py-3 font-semibold">Annual</th>
                  <th className="px-4 py-3 font-semibold">Termly</th>
                  <th className="px-4 py-3 font-semibold">Monthly</th>
                </tr>
              </thead>
              <tbody>
                {feeBands.map((f) => (
                  <tr key={f._id} className="border-t border-gold-light/40 bg-white">
                    <td className="px-4 py-3 font-medium text-ink">{f.yearGroupRange}</td>
                    <td className="px-4 py-3 font-semibold text-maroon">£{f.annualFee.toLocaleString()}</td>
                    <td className="px-4 py-3">£{f.termlyFee.toLocaleString()} / term</td>
                    <td className="px-4 py-3">£{f.monthlyFee.toLocaleString()} / month</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PlaceholderNote>Termly and monthly figures are an even split of the confirmed annual fee, pending the school&apos;s final published payment-plan figures.</PlaceholderNote>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-maroon">Application fee</p>
              <p className="mt-1 font-serif text-3xl font-bold text-ink">£{settings.applicationFee}</p>
              <p className="mt-1 text-sm text-ink/60">Non-refundable, paid when you submit your application.</p>
            </div>
            <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-maroon">Registration fee</p>
              <p className="mt-1 font-serif text-3xl font-bold text-ink">£{settings.registrationFee}</p>
              <p className="mt-1 text-sm text-ink/60">One-time, paid once a place is offered and accepted.</p>
            </div>
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

      <CtaBand heading="Have a question about fees?" body="Our FAQs cover payment plans, bursaries and what's included." ctaLabel="Read the FAQs" ctaHref="/faqs" />
    </>
  );
}
