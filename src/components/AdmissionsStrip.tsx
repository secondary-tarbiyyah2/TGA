import Link from "next/link";
import { Container } from "./Container";

// Same four steps as the homepage and /admissions — kept deliberately short
// and free of dates/amounts (those live on /admissions and /fees).
const STEPS = [
  { title: "Apply", body: "A short online application — no obligation." },
  { title: "Assessment", body: "A friendly, age-appropriate check and conversation." },
  { title: "Offer", body: "If we offer a place, accept it by the deadline." },
  { title: "Welcome", body: "Onboarding ahead of live lessons in January 2027." },
];

/** Compact "How admissions works" strip with Apply / fees links, for key pages. */
export function AdmissionsStrip() {
  return (
    <section aria-labelledby="admissions-strip-heading" className="border-y border-gold-light/40 bg-gold-50 py-10">
      <Container>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="admissions-strip-heading" className="font-serif text-xl font-semibold text-ink sm:text-2xl">
            How admissions works
          </h2>
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold">
            <Link href="/admissions" className="inline-flex min-h-11 items-center text-gold-700 underline underline-offset-2">Apply now</Link>
            <Link href="/fees" className="inline-flex min-h-11 items-center text-gold-700 underline underline-offset-2">See fees</Link>
            <Link href="/book-a-call" className="inline-flex min-h-11 items-center text-gold-700 underline underline-offset-2">Book a free call</Link>
          </p>
        </div>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3">
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-500 text-sm font-bold text-ink-900">
                {i + 1}
              </span>
              <span className="text-sm text-ink/75">
                <span className="block font-semibold text-ink">{s.title}</span>
                {s.body}
              </span>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
