import Link from "next/link";
import { Container } from "./Container";
import { admissionsProcessSteps } from "@/components/admissions/applicationShared";
import { getSiteSettings } from "@/lib/content";

/** Compact "How admissions works" strip (six steps, copy shared with /admissions and the apply page) with Apply / fees links, for key pages. */
export async function AdmissionsStrip() {
  const settings = await getSiteSettings();
  const STEPS = admissionsProcessSteps({ applicationFee: settings.applicationFee, registrationFee: settings.registrationFee });
  return (
    <section aria-labelledby="admissions-strip-heading" className="border-y border-gold-light/40 bg-gold-50 py-10">
      <Container>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="admissions-strip-heading" className="font-serif text-xl font-semibold text-ink sm:text-2xl">
            How admissions works
          </h2>
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold">
            <Link href="/fees" className="inline-flex min-h-11 items-center text-gold-700 underline underline-offset-2">See fees and payment plans</Link>
          </p>
        </div>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3">
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-500 text-sm font-bold text-ink-900">
                {i + 1}
              </span>
              <span className="text-sm text-ink/75">
                <span className="block font-semibold text-ink">{s.title}</span>
                {s.short}
              </span>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
