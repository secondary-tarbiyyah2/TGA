import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { getTermDates } from "@/lib/content";

export const metadata: Metadata = pageMetadata({
  title: "Term Dates",
  description: "Term dates and the admissions calendar for the January 2027 launch.",
  path: "/term-dates",
});

export default async function TermDatesPage() {
  const dates = await getTermDates();

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <section className="hero-pad-top pb-16 sm:pb-24">
      <Container>
        <div className="max-w-3xl">
          <Kicker>Term dates</Kicker>
          <h1 className="text-h1 font-serif font-semibold text-ink">Term dates and admissions calendar.</h1>
          <p className="mt-5 text-lg text-ink/75">
            The founding year, from the application deadline to the summer term. Add every date to your calendar in one go.
          </p>

          {dates.length > 0 ? (
            <>
              <a
                href="/term-dates.ics"
                download
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border-[1.5px] border-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 hover:bg-gold-100"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Add to my calendar (.ics)
              </a>
              <ol className="mt-8 divide-y divide-gold-light/40 overflow-hidden rounded-2xl border border-gold-light/50 bg-white">
                {dates.map((d) => (
                  <li key={d._id} className="grid gap-1 px-5 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
                    <p className="text-sm font-semibold text-gold-700">
                      {fmt(d.date)}
                      {d.endDate && d.endDate !== d.date && <span className="block font-normal text-ink/70">to {fmt(d.endDate)}</span>}
                    </p>
                    <div>
                      <p className="font-medium text-ink">
                        {d.label}
                        <span className="ml-2 inline-block rounded-full bg-gold-100 px-2 py-0.5 align-middle text-xs font-medium text-gold-900">{d.kind}</span>
                      </p>
                      {d.notes && <p className="mt-1 text-sm text-ink/70">{d.notes}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="mt-8 text-ink/70">Term dates and the admissions calendar will be published here as they&apos;re confirmed.</p>
          )}
        </div>
      </Container>
    </section>
  );
}
