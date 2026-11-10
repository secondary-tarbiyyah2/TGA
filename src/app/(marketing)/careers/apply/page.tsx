import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CareerApplyForm } from "@/components/careers/CareerApplyForm";
import { FALLBACK_ADMISSIONS_EMAIL } from "@/components/admissions/applicationShared";
import { getSiteSettings } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Apply for a role",
  description: "Apply online for a teaching or support role at Tarbiyyah Global Academy.",
  path: "/careers/apply",
});

const NEEDS = [
  "Your CV, as a PDF or Word document (up to 10 MB).",
  "Your qualifications, including any ijazah or Islamic study.",
  "Your employment history with dates, and an explanation of any gaps.",
  "Two referees, one of them your current or most recent employer, with their work email addresses.",
  "A supporting statement about why you are right for the role.",
];

export default async function CareersApplyPage() {
  const settings = await getSiteSettings();
  const email = settings.admissionsEmail || FALLBACK_ADMISSIONS_EMAIL;

  return (
    <section className="geo-texture bg-cream pb-16 pt-10 sm:pt-12" aria-labelledby="careers-apply-heading">
      <Container className="max-w-3xl">
        <Kicker>Careers</Kicker>
        <h1 id="careers-apply-heading" className="text-h2 font-serif font-semibold text-ink">Apply for a role</h1>
        <p className="mt-3 text-base text-ink/75">
          Six short steps, about 20 minutes. Answers are saved on this device as you go. Not sure which role suits you? See the{" "}
          <Link href="/careers/#vacancies" className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900">current vacancies</Link>, or choose &ldquo;General application&rdquo; on the first step.
        </p>

        <details className="group mt-5 rounded-2xl border border-gold-light/60 bg-white">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <span>What you&apos;ll need <span className="font-normal text-ink/70">({NEEDS.length} things)</span></span>
            <span aria-hidden="true" className="text-gold-700 transition-transform group-open:rotate-180">&#9662;</span>
          </summary>
          <ul className="grid gap-2 border-t border-gold-light/50 px-5 py-4 text-sm text-ink/80 sm:grid-cols-2 sm:gap-x-6">
            {NEEDS.map((n) => (
              <li key={n} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-0.5 text-gold-700">&#10003;</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </details>

        <div id="application-form" className="mt-6 scroll-mt-24">
          <CareerApplyForm email={email} />
          <p className="mt-6 text-sm text-ink/70">
            Having trouble with the form? Email your CV and a covering letter to{" "}
            <a href={`mailto:${email}`} className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900">{email}</a> instead.
          </p>
        </div>
      </Container>
    </section>
  );
}
