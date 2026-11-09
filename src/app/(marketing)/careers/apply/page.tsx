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
    <>
      <section className="geo-texture bg-cream hero-pad">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start lg:gap-16">
          <div>
            <Kicker>Careers</Kicker>
            <h1 className="text-h1 font-serif font-semibold text-ink">Apply for a role.</h1>
            <p className="mt-5 max-w-xl text-lg text-ink/75">
              The form has six short steps and takes about 20 minutes. Your answers are saved on this device as you go, so you can come back to it.
            </p>
            <p className="mt-4 max-w-xl text-sm text-ink/70">
              Not sure which role suits you? See the{" "}
              <Link href="/careers/#vacancies" className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900">current vacancies</Link>, or choose &ldquo;General application&rdquo; on the first step.
            </p>
            <a href="#application-form" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold text-ink-900 transition-all hover:brightness-95 lg:hidden">
              Start the form
            </a>
          </div>
          <div className="rounded-2xl border border-gold-light/60 bg-white p-6">
            <h2 className="font-serif text-lg font-semibold text-ink">What you&apos;ll need</h2>
            <ul className="mt-3 space-y-2.5 text-sm text-ink/80">
              {NEEDS.map((n) => (
                <li key={n} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-0.5 text-gold-700">&#10003;</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <section className="section-pad scroll-mt-20" id="application-form" aria-label="Application form">
        <Container className="max-w-3xl">
          <CareerApplyForm email={email} />
          <p className="mt-6 text-sm text-ink/70">
            Having trouble with the form? Email your CV and a covering letter to{" "}
            <a href={`mailto:${email}`} className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900">{email}</a> instead.
          </p>
        </Container>
      </section>
    </>
  );
}
