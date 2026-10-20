import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { getTermDates } from "@/lib/content";

export const metadata: Metadata = pageMetadata({
  title: "Term Dates",
  description: "Term dates and the admissions calendar for the December 2026 launch.",
  path: "/term-dates",
});

export default async function TermDatesPage() {
  const dates = await getTermDates();

  return (
    <section className="section-pad">
      <Container className="max-w-2xl">
        <Kicker>Term Dates</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Term dates &amp; admissions calendar.</h1>

        {dates.length > 0 ? (
          <>
            <a
              href="/term-dates.ics"
              download
              className="mt-6 inline-flex items-center gap-2 rounded-full border-[1.5px] border-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 hover:bg-gold-100"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Download to calendar (.ics)
            </a>
            <ul className="mt-6 divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
              {dates.map((d) => (
                <li key={d._id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <p className="font-medium text-ink">{d.label}</p>
                    <p className="text-xs text-ink/70">{d.kind}</p>
                  </div>
                  <p className="text-sm font-semibold text-gold-700">
                    {new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-8 text-ink/70">Term dates and the admissions calendar will be published here as they&apos;re confirmed.</p>
        )}
      </Container>
    </section>
  );
}
