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
    "Each child's latest school report or homeschool progress record, if you have one (PDF, JPG or PNG).",
    "Photo ID for a parent or guardian (passport, driving licence or national ID card), as a PDF, JPG or PNG. You only need to upload it once, even for several children.",
    "Proof of identity and address for the pupil: each child's passport or birth certificate, and a recent utility bill, council tax bill, bank statement or tenancy agreement showing your child's home address (PDF, JPG or PNG). If you don't have the proof of address to hand, we will ask you for it during the review.",
    "Your child's home address, and a parent or guardian email address and phone number.",
    `Payment is not taken on this form. If we make an offer, you then send proof of payment (screenshot or receipt) for the application fee${settings.applicationFee != null ? ` (${formatGBP(settings.applicationFee)})` : ""} if not yet paid and your first fee payment, to confirm the place.`,
  ];

  return (
    <>
      <section className="geo-texture bg-cream hero-pad">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start lg:gap-16">
          <div>
            <Kicker>Admissions</Kicker>
            <h1 className="text-h1 font-serif font-semibold text-ink">Apply online.</h1>
            <p className="mt-5 max-w-xl text-lg text-ink/75">
              The form takes about ten minutes in three short steps, and you can apply for several children at once without repeating your own details.
            </p>
            <p className="mt-4 max-w-xl text-sm text-ink/70">
              Apply by Friday 18 December 2026 for the founding cohort. What happens after you apply is set out in the{" "}
              <Link href="/admissions" className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900">six admissions steps</Link>.
            </p>
            <a href="#application-form" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold text-ink-900 transition-all hover:brightness-95 lg:hidden">
              Start the form
            </a>
          </div>
          <div className="rounded-2xl border border-gold-light/60 bg-white p-6">
            <h2 className="font-serif text-lg font-semibold text-ink">What you&apos;ll need</h2>
            <ul className="mt-3 space-y-2.5 text-sm text-ink/80">
              {needs.map((n) => (
                <li key={n} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-0.5 text-gold-700">&#10003;</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <section className="section-pad scroll-mt-20" id="application-form" aria-labelledby="application-form-heading">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h2 id="application-form-heading" className="text-h2 font-serif font-semibold text-ink">Your application</h2>
            <div className="mt-6">
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
    </>
  );
}
