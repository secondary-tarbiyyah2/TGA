import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { ApplyForm } from "@/components/admissions/ApplyForm";
import { FALLBACK_ADMISSIONS_EMAIL, admissionsProcessSteps } from "@/components/admissions/applicationShared";
import { getSiteSettings } from "@/lib/content";
import { formatGBP } from "@/lib/format";

export const metadata: Metadata = {
  title: "Apply online",
  description: "Apply for a place at Tarbiyyah Global Academy — our online application form and what happens next.",
};

export default async function ApplyPage() {
  const settings = await getSiteSettings();
  const email = settings.admissionsEmail || FALLBACK_ADMISSIONS_EMAIL;

  const steps = admissionsProcessSteps({ applicationFee: settings.applicationFee, registrationFee: settings.registrationFee });

  const needs = [
    "Your child's latest school report (PDF, JPG or PNG; you can also email it after applying)",
    "Photo ID for a parent or guardian (passport, driving licence or national ID card), as PDF, JPG or PNG",
    "Your child's passport or birth certificate, as PDF, JPG or PNG",
    "A parent or guardian email address and phone number",
    `Payment is not taken on this form. If we make an offer, you then send proof of payment (screenshot or receipt) for the application fee${settings.applicationFee != null ? ` (${formatGBP(settings.applicationFee)})` : ""} if not yet paid, the registration fee${settings.registrationFee != null ? ` (${formatGBP(settings.registrationFee)})` : ""} and your first payment, to confirm the place`,
  ];

  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Admissions</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Apply online.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            Six steps from application to welcome, including a remote assessment and an interview with you and your child. The form below takes about ten minutes in three short steps.
          </p>
          <p className="mt-4 text-sm text-ink/70">
            <Link href="/admissions" className="font-semibold text-gold-700 underline">Back to admissions</Link>
          </p>
        </Container>
      </section>

      <section className="section-pad">
        <Container>
          <h2 className="font-serif text-2xl font-semibold text-ink">How admissions works</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
            <ApplyForm admissionsEmail={email} applicationFee={settings.applicationFee} registrationFee={settings.registrationFee} />
          </div>
        </Container>
      </section>
    </>
  );
}
