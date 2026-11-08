import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Button } from "@/components/Button";
import { Kicker } from "@/components/Section";
import { AdmissionsStepsGrid } from "@/components/admissions/AdmissionsSteps";
import { PlacesRemaining } from "@/components/admissions/PlacesRemaining";
import { admissionsProcessSteps } from "@/components/admissions/applicationShared";
import { getSiteSettings } from "@/lib/content";

// Everything a family might check before applying, each linking to the one
// page that holds it (so this page does not repeat fees, dates or the
// document list, which live on /fees, /term-dates and /admissions/apply).
const BEFORE_YOU_APPLY = [
  { href: "/open-evening", cta: "Book a place", title: "Open evenings & taster morning", body: "Online open evenings on Thursday 26 November (7:30pm) and Sunday 6 December (4pm UK time), and a taster morning on Saturday 12 December." },
  { href: "/eligibility", cta: "Check if it's right for us", title: "Is it right for us?", body: "Eight quick questions for an honest answer: your child's live day in your time zone, what you would need at home, the fees and the next step." },
  { href: "/fees", cta: "See the fees", title: "Fees and payment dates", body: "Every fee, payment plan and due date, with an estimator for your family." },
  { href: "/term-dates", cta: "See term dates", title: "Key dates", body: "Apply by 18 December. Induction day is Friday 1 January, and live lessons begin on Monday 4 January 2027." },
];

export const metadata: Metadata = {
  title: "Admissions",
  description: "How to apply to Tarbiyyah Global Academy, process, entry assessment, key dates, and the application form.",
};

export default async function AdmissionsPage() {
  const settings = await getSiteSettings();
  const steps = admissionsProcessSteps({ applicationFee: settings.applicationFee });
  return (
    <>
      <section className="geo-texture bg-cream hero-pad">
        <Container>
          <Kicker>Admissions</Kicker>
          <h1 className="text-h1 font-serif font-semibold text-ink">How to apply.</h1>
          <p className="mt-5 max-w-2xl text-lg text-ink/75">
            A straightforward, six-step process, from your online application to your child&apos;s first lesson, including a supervised remote assessment and an interview with you and your child. Applications for the January 2027 launch are open now.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Button href="/admissions/apply">Apply now</Button>
            <a href="/prospectus/TGA-Prospectus-2026-27.pdf" className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900" target="_blank" rel="noopener noreferrer">
              Download the prospectus (PDF, 20 pages)<span className="sr-only">, opens in a new tab</span>
            </a>
          </div>
          <p className="mt-4 max-w-2xl text-sm text-ink/70">
            Apply by Friday 18 December 2026 for the founding cohort; later applications are considered while places remain.
          </p>
        </Container>
      </section>

      <section className="section-pad">
        <Container>
          <Kicker>Step by step</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">How admissions works.</h2>
          <AdmissionsStepsGrid steps={steps} />
        </Container>
      </section>

      <PlacesRemaining />

      <section className="geo-texture bg-cream section-pad" aria-labelledby="before-heading">
        <Container>
          <Kicker>Before you apply</Kicker>
          <h2 id="before-heading" className="text-h2 font-serif font-semibold text-ink">Everything else you might want to check.</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BEFORE_YOU_APPLY.map((c) => (
              <li key={c.href}>
                <Link href={c.href} className="group flex h-full flex-col rounded-2xl border border-gold-light/50 bg-white p-5 shadow-sm transition hover:border-gold-500 hover:shadow-md">
                  <h3 className="font-serif text-lg font-semibold text-ink group-hover:text-gold-700">{c.title}</h3>
                  <p className="mt-2 flex-1 text-sm text-ink/70">{c.body}</p>
                  <span aria-hidden="true" className="mt-4 text-sm font-semibold text-gold-700">{c.cta} →</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-gold-light/60 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-ink/75">
              The online form takes about ten minutes, and you can add brothers and sisters to the same form. The application page lists the documents to have ready.
            </p>
            <Button href="/admissions/apply" className="shrink-0">Apply now</Button>
          </div>
        </Container>
      </section>
    </>
  );
}
