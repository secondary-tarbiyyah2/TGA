import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { ApplicationForm } from "@/components/ApplicationForm";
import { PlacesRemaining } from "@/components/admissions/PlacesRemaining";
import { getSiteSettings } from "@/lib/content";

export const metadata: Metadata = {
  title: "Admissions",
  description: "How to apply to Tarbiyyah Global Academy — process, entry assessment, key dates, and the application form.",
};

const steps = [
  { title: "Register your interest", body: "Tell us a little about your child — no obligation." },
  { title: "Complete the application", body: "The full multi-step application form below, including your child's year group." },
  { title: "Entry assessment", body: "A short, age-appropriate assessment so we understand how best to support your child." },
  { title: "Offer & registration", body: "Places are offered subject to assessment and availability, and confirmed with a one-time registration fee." },
];

export default async function AdmissionsPage() {
  const settings = await getSiteSettings();
  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Admissions</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">How to apply.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            A straightforward, four-step process. Applications for the January 2027 launch are open now.
          </p>
          <p className="mt-4 max-w-2xl text-sm text-ink/70">
            Not sure it&apos;s the right fit yet?{" "}
            <Link href="/eligibility" className="font-semibold text-gold-700 underline">Take our 2-minute fit quiz</Link>{" "}
            for a personalised recommendation before you apply.
          </p>
        </Container>
      </section>

      <section className="section-pad">
        <Container className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.title} className="rounded-2xl border border-gold-light/50 bg-white p-6">
              <span className="font-serif text-2xl font-bold text-gold">{i + 1}</span>
              <h2 className="mt-2 font-semibold text-ink">{s.title}</h2>
              <p className="mt-1 text-sm text-ink/70">{s.body}</p>
            </div>
          ))}
        </Container>
      </section>

      <PlacesRemaining />

      <section className="geo-texture bg-cream section-pad">
        <Container className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-white p-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-gold-700">Application fee</p>
            <p className="mt-1 font-serif text-3xl font-bold text-ink">£{settings.applicationFee}</p>
            <p className="mt-1 text-sm text-ink/60">Non-refundable, covers processing and assessment.</p>
          </div>
          <div className="rounded-2xl bg-white p-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-gold-700">Registration fee</p>
            <p className="mt-1 font-serif text-3xl font-bold text-ink">£{settings.registrationFee}</p>
            <p className="mt-1 text-sm text-ink/60">One-time, paid once a place is offered and accepted.</p>
          </div>
        </Container>
      </section>

      <section className="section-pad" id="apply">
        <Container className="max-w-2xl">
          <Kicker>Application form</Kicker>
          <h2 className="font-serif text-3xl font-semibold text-ink">Start your child&apos;s application.</h2>
          <p className="mt-3 text-ink/70">Three short steps. You can always follow up by email if you need to pause.</p>
          <div className="mt-8">
            <ApplicationForm />
          </div>
          <p className="mt-4 text-xs text-ink/70">
            Key admissions dates for the January 2027 launch will be published on our{" "}
            <a href="/term-dates" className="underline">Term Dates</a> page once confirmed.
          </p>
        </Container>
      </section>
    </>
  );
}
