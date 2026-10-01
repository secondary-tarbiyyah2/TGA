import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { ApplyForm } from "@/components/admissions/ApplyForm";
import { FALLBACK_ADMISSIONS_EMAIL } from "@/components/admissions/applicationShared";
import { getSiteSettings } from "@/lib/content";

export const metadata: Metadata = {
  title: "Apply online",
  description: "Apply for a place at Tarbiyyah Global Academy — our online application form and what happens next.",
};

export default async function ApplyPage() {
  const settings = await getSiteSettings();
  const email = settings.admissionsEmail || FALLBACK_ADMISSIONS_EMAIL;

  const steps = [
    {
      title: "Application",
      body: "Complete the online form below and upload your child's latest school report as a PDF (or email it to us afterwards).",
    },
    {
      title: "Assessment & interview",
      body: "Your child takes a short assessment, free of charge, then we have a conversation with you and your child to make sure we are the right fit.",
    },
    {
      title: "Offer, fees & deposit",
      body: (
        <>
          If we offer a place, you confirm it by paying the admin fee and a deposit by the deadline in your offer, and sending ID documents. See our{" "}
          <Link href="/fees" className="font-semibold text-gold-700 underline">fees page</Link> for details.
        </>
      ),
    },
  ];

  const needs = [
    "Your child's latest school report as a PDF (you can also email it after applying)",
    "A parent or guardian email address and phone number",
    "ID documents, which we will ask for later if a place is offered",
    "Admin fee and deposit: not due to apply or sit the assessment. They are requested only if a place is offered, and hold the place once received",
  ];

  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Admissions</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Apply online.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            Three simple steps. The form below takes about ten minutes. You only need your details and your child&apos;s.
          </p>
          <p className="mt-4 text-sm text-ink/70">
            <Link href="/admissions" className="font-semibold text-gold-700 underline">Back to admissions</Link>
          </p>
        </Container>
      </section>

      <section className="section-pad">
        <Container>
          <h2 className="font-serif text-2xl font-semibold text-ink">How admissions works</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4 rounded-2xl border border-gold-light/50 bg-white p-5">
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-500 font-serif text-lg font-bold text-ink-900">{i + 1}</span>
                <div>
                  <h3 className="font-semibold text-ink">{s.title}</h3>
                  <p className="mt-1 text-sm text-ink/70">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-6 rounded-2xl bg-cream p-5">
            <h3 className="font-semibold text-ink">What you&apos;ll need</h3>
            <ul className="mt-2 space-y-1 text-sm text-ink/80">
              {needs.map((n) => (
                <li key={n} className="flex gap-2">
                  <span aria-hidden="true" className="text-gold-700">&#10003;</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <section className="geo-texture bg-cream section-pad" id="application-form">
        <Container className="max-w-3xl">
          <Kicker>Step 1 · Application</Kicker>
          <h2 className="font-serif text-3xl font-semibold text-ink">Your child&apos;s application.</h2>
          <div className="mt-8">
            <ApplyForm admissionsEmail={email} />
          </div>
        </Container>
      </section>
    </>
  );
}
