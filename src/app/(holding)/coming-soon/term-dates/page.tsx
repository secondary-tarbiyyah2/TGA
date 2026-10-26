import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { PrelaunchPageHead, PrelaunchRegisterBand } from "@/components/prelaunch/PrelaunchPageHead";
import { getTermDates } from "@/lib/content";

// Public at /term-dates/ while the site is in pre-launch (public/.htaccess).
export const metadata: Metadata = pageMetadata({
  title: "Term Dates",
  description: "Term dates and key admissions dates for Tarbiyyah Global Academy's founding year, 2026–27.",
  path: "/term-dates",
});

const fmt = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function HoldingTermDatesPage() {
  const dates = await getTermDates();
  return (
    <>
      <PrelaunchPageHead kicker="Founding year 2026–27" title="Term dates">
        The Academy opens in January 2027. Islamic dates depend on the moon sighting and may move by a day or two.
      </PrelaunchPageHead>
      <section className="pt-10">
        <Container className="max-w-4xl">
          {dates.length > 0 ? (
            <>
              <ul className="divide-y divide-gold-light/40 overflow-hidden rounded-2xl border border-gold-light/50 bg-white">
                {dates.map((d) => (
                  <li key={d._id} className="grid gap-1 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6">
                    <div>
                      <p className="font-semibold text-ink">{d.label}</p>
                      {d.notes && <p className="mt-0.5 text-sm text-ink/65">{d.notes}</p>}
                    </div>
                    <p className="text-sm font-semibold text-gold-700 sm:text-right">
                      {fmt(d.date)}
                      {d.endDate && d.endDate !== d.date && <> – {fmt(d.endDate)}</>}
                    </p>
                  </li>
                ))}
              </ul>
              <a href="/term-dates.ics" download className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold-700 underline">
                Add these dates to your calendar (.ics)
              </a>
            </>
          ) : (
            <p className="text-ink/70">Term dates will be published here shortly.</p>
          )}
        </Container>
      </section>
      <PrelaunchRegisterBand />
    </>
  );
}
