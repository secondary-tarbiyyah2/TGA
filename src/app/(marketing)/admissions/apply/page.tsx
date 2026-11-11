import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { ApplyForm } from "@/components/admissions/ApplyForm";
import { FALLBACK_ADMISSIONS_EMAIL } from "@/components/admissions/applicationShared";
import { getFeeBands, getSiteSettings } from "@/lib/content";
import { formatGBP } from "@/lib/format";

export const metadata: Metadata = {
  title: "Apply online",
  description: "Apply for a place at Tarbiyyah Global Academy, our online application form and what happens next.",
};

export default async function ApplyPage() {
  const [settings, feeBands] = await Promise.all([getSiteSettings(), getFeeBands()]);
  const email = settings.admissionsEmail || FALLBACK_ADMISSIONS_EMAIL;

  const needs = [
    "Each child's latest school report or homeschool record, if you have one.",
    "Photo ID for a parent or guardian (passport, driving licence or national ID). Once, even for several children.",
    "Each child's passport or birth certificate.",
    "Proof of your child's address, such as a recent utility bill or bank statement. You can send this later if needed.",
    "Your child's home address, and your email and phone number.",
  ];
  const paymentNote = `No payment is taken on this form. If we offer a place, you then send proof of payment for the application fee${settings.applicationFee != null ? ` (${formatGBP(settings.applicationFee)})` : ""}, if not yet paid, and your first fee payment, which is due when you accept the place.`;

  return (
    <section className="geo-texture bg-cream pb-16 pt-10 sm:pt-12" aria-labelledby="apply-heading">
      <Container>
        <div className="mx-auto max-w-3xl">
          <Kicker>Admissions</Kicker>
          <h1 id="apply-heading" className="text-h2 font-serif font-semibold text-ink">Apply online</h1>
          <p className="mt-3 text-base text-ink/75">
            About ten minutes. Apply for several children at once without repeating your details. Apply by Friday 18 December 2026 for the founding cohort; what happens next is in the{" "}
            <Link href="/admissions" className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900">six admissions steps</Link>.
          </p>

          <details className="group mt-5 rounded-2xl border border-gold-light/60 bg-white">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
              <span>What you&apos;ll need <span className="font-normal text-ink/70">({needs.length} things, PDF, JPG or PNG)</span></span>
              <span aria-hidden="true" className="text-gold-700 transition-transform group-open:rotate-180">&#9662;</span>
            </summary>
            <div className="border-t border-gold-light/50 px-5 py-4">
              <ul className="grid gap-2 text-sm text-ink/80 sm:grid-cols-2 sm:gap-x-6">
                {needs.map((n) => (
                  <li key={n} className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-0.5 text-gold-700">&#10003;</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink/70">{paymentNote}</p>
            </div>
          </details>

          <div id="application-form" className="mt-6 scroll-mt-24">
            <h2 className="sr-only">Your application</h2>
            <ApplyForm
              admissionsEmail={email}
              applicationFee={settings.applicationFee}
              feeBands={feeBands}
              siblingDiscountPercent={settings.siblingDiscountPercent}
              siblingDiscountNote={settings.siblingDiscountNote}
              annualDiscountPercent={settings.annualDiscountPercent}
              feeTerms={settings.feeTerms}
              feeInstalments={settings.feeInstalments}
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
