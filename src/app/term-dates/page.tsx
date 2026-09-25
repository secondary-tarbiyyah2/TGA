import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { getTermDates } from "@/lib/content";

export const metadata: Metadata = {
  title: "Term Dates",
  description: "Term dates and the admissions calendar for the January 2027 launch.",
};

export default async function TermDatesPage() {
  const dates = await getTermDates();

  return (
    <section className="py-16">
      <Container className="max-w-2xl">
        <Kicker>Term Dates</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Term dates &amp; admissions calendar.</h1>

        {dates.length > 0 ? (
          <ul className="mt-8 divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
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
        ) : (
          <p className="mt-8 text-ink/70">Term dates and the admissions calendar will be published here as they&apos;re confirmed.</p>
        )}
      </Container>
    </section>
  );
}
