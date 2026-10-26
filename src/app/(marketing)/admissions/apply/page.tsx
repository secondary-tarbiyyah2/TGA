import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { ApplyForm } from "@/components/admissions/ApplyForm";
import { AdmissionsStepsGrid } from "@/components/admissions/AdmissionsSteps";
import { FALLBACK_ADMISSIONS_EMAIL, admissionsProcessSteps } from "@/components/admissions/applicationShared";
import { getFeeBands, getSiteSettings } from "@/lib/content";
import { PRELAUNCH } from "@/lib/prelaunch";
import { formatGBP } from "@/lib/format";

export const metadata: Metadata = {
  title: "Apply online",
  description: "Apply for a place at Tarbiyyah Global Academy — our online application form and what happens next.",
};

export default async function ApplyPage() {
  const [settings, feeBands] = await Promise.all([getSiteSettings(), getFeeBands()]);
  const email = settings.admissionsEmail || FALLBACK_ADMISSIONS_EMAIL;

  const steps = admissionsProcessSteps({ applicationFee: settings.applicationFee, registrationFee: settings.registrationFee });

  const needs = [
    "Each child's latest school report (PDF, JPG or PNG). You can also email it after applying.",
    "Photo ID for a parent or guardian (passport, driving licence or national ID card), as a PDF, JPG or PNG. You only need to upload it once, even for several children.",
    "Proof of identity and address for the pupil: each child's passport or birth certificate, and a recent utility bill, council tax bill, bank statement or tenancy agreement showing your child's home address (PDF, JPG or PNG). If you don't have the proof of address to hand, you can send it after applying.",
    "Your child's home address, and a parent or guardian email address and phone number.",
    `Payment is not taken on this form. If we make an offer, you then send proof of payment (screenshot or receipt) for the application fee${settings.applicationFee != null ? ` (${formatGBP(settings.applicationFee)})` : ""} if not yet paid, the registration fee${settings.registrationFee != null ? ` (${formatGBP(settings.registrationFee)})` : ""} and your first payment, to confirm the place.`,
  ];

  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Admissions</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Apply online.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            Six steps from application to welcome, including a remote assessment and an interview with you and your child. The form below takes about ten minutes in three short steps, and you can apply for several children at once without repeating your own details.
          </p>
          <p className="mt-4 text-sm text-ink/70">
            <Link href={PRELAUNCH ? "/" : "/admissions"} className="font-semibold text-gold-700 underline">{PRELAUNCH ? "Back to the homepage" : "Back to admissions"}</Link>
          </p>
        </Container>
      </section>

      <section className="section-pad">
        <Container>
          <h2 className="font-serif text-2xl font-semibold text-ink">How admissions works</h2>
          <AdmissionsStepsGrid steps={steps} />
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
          <Kicker>Application form</Kicker>
          <h2 className="font-serif text-3xl font-semibold text-ink">Your application.</h2>
          <div className="mt-8">
            <ApplyForm
              admissionsEmail={email}
              applicationFee={settings.applicationFee}
              registrationFee={settings.registrationFee}
              feeBands={feeBands}
              siblingDiscountPercent={settings.siblingDiscountPercent}
              siblingDiscountNote={settings.siblingDiscountNote}
              annualDiscountPercent={settings.annualDiscountPercent}
              feeTerms={settings.feeTerms}
              feeInstalments={settings.feeInstalments}
            />
          </div>
        </Container>
      </section>
    </>
  );
}
