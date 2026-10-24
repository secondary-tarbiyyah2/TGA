import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Button } from "@/components/Button";
import { Kicker } from "@/components/Section";
import { AdmissionsStepsGrid } from "@/components/admissions/AdmissionsSteps";
import { PlacesRemaining } from "@/components/admissions/PlacesRemaining";
import { admissionsProcessSteps } from "@/components/admissions/applicationShared";
import { getSiteSettings } from "@/lib/content";
import { formatGBP } from "@/lib/format";

export const metadata: Metadata = {
  title: "Admissions",
  description: "How to apply to Tarbiyyah Global Academy — process, entry assessment, key dates, and the application form.",
};

export default async function AdmissionsPage() {
  const settings = await getSiteSettings();
  const steps = admissionsProcessSteps({ applicationFee: settings.applicationFee, registrationFee: settings.registrationFee });
  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Admissions</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">How to apply.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            A straightforward, six-step process, from your online application to your child&apos;s first lesson, including a supervised remote assessment and an interview with you and your child. Applications for the December 2026 launch are open now.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button href="/admissions/apply">Apply now</Button>
            <a href="/prospectus/TGA-Prospectus-2026-27.pdf" className="font-semibold text-gold-700 underline" target="_blank" rel="noopener noreferrer">
              Download the prospectus (PDF, 20 pages)<span className="sr-only">, opens in a new tab</span>
            </a>
          </div>
          <p className="mt-4 max-w-2xl text-sm text-ink/70">
            Apply by Friday 27 November 2026 for the founding cohort; later applications are considered while places remain. Come to an{" "}
            <Link href="/open-evening" className="font-semibold text-gold-700 underline">open evening or taster morning</Link> first if you would like to.
          </p>
          <p className="mt-2 max-w-2xl text-sm text-ink/70">
            Not sure it&apos;s the right fit yet?{" "}
            <Link href="/eligibility" className="font-semibold text-gold-700 underline">Take our 2-minute fit quiz</Link>{" "}
            for a personalised recommendation before you apply.
          </p>
        </Container>
      </section>

      <section className="section-pad">
        <Container>
          <h2 className="font-serif text-2xl font-semibold text-ink">How admissions works</h2>
          <AdmissionsStepsGrid steps={steps} />
        </Container>
      </section>

      <PlacesRemaining />

      <section className="geo-texture bg-cream section-pad">
        <Container className="grid gap-4 sm:grid-cols-2">
          {settings.applicationFee != null && (
            <div className="rounded-2xl bg-white p-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-gold-700">Application and assessment fee</p>
              <p className="mt-1 font-serif text-3xl font-bold text-ink">{formatGBP(settings.applicationFee)}</p>
              <p className="mt-1 text-sm text-ink/65">Non-refundable. Covers the baseline assessment and the administrative review. Paid when you apply.</p>
            </div>
          )}
          {settings.registrationFee != null && (
            <div className="rounded-2xl bg-white p-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-gold-700">Registration fee</p>
              <p className="mt-1 font-serif text-3xl font-bold text-ink">{formatGBP(settings.registrationFee)}</p>
              <p className="mt-1 text-sm text-ink/65">One-off, per child, due when you accept an offer. Covers account setup, platform licences and onboarding. Refundable only within the 14-day cancellation period.</p>
            </div>
          )}
          <p className="text-sm text-ink/70 sm:col-span-2">
            Tuition is then paid on the dates in our Fees Policy: the whole year (with {settings.annualDiscountPercent ? `${settings.annualDiscountPercent}% off` : "a discount"}) or the first termly payment by 4 December 2026, or monthly from 28 December 2026. See the{" "}
            <Link href="/fees#estimator" className="font-semibold text-gold-700 underline">fee estimator</Link> for your family&apos;s figures.
          </p>
        </Container>
      </section>

      <section className="section-pad" id="apply">
        <Container className="max-w-2xl">
          <Kicker>Application form</Kicker>
          <h2 className="font-serif text-3xl font-semibold text-ink">Start your application.</h2>
          <p className="mt-3 text-ink/70">
            Our online form takes about ten minutes. Have your details and your child&apos;s to hand, plus a recent school report, photo ID for a parent or guardian, and your child&apos;s passport or birth certificate (PDF, JPG or PNG) ready to upload. Applying for more than one child? Add them all in the same form: you only enter your own details once.
          </p>
          <div className="mt-6">
            <Button href="/admissions/apply">Apply now</Button>
          </div>
          <p className="mt-4 text-xs text-ink/70">
            Key admissions dates for the December 2026 launch will be published on our{" "}
            <a href="/term-dates" className="underline">Term Dates</a> page once confirmed.
          </p>
        </Container>
      </section>
    </>
  );
}
