import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { AdmissionsStrip } from "@/components/AdmissionsStrip";
import { keyStages } from "@/content/curriculum";
import { getCurriculumContent } from "@/lib/content";
import { CurriculumSampleWeek } from "@/components/CurriculumSampleWeek";

export const metadata: Metadata = pageMetadata({
  title: "Curriculum",
  description: "A specialist curriculum — the full British national curriculum plus Islamic Studies, by key stage, Year 1 to GCSE.",
  path: "/curriculum",
});

export default async function CurriculumPage() {
  const content = await getCurriculumContent();

  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Curriculum</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">
            {content.heroHeading || "A specialist curriculum, academic and Islamic together."}
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            {content.heroBody || (
              <>
                The full British curriculum, live-timetabled and taught by qualified teachers, through to GCSE —
                with Qur&apos;an, Islamic Studies and Arabic on the timetable at every key stage.
              </>
            )}
          </p>
        </Container>
      </section>

      <section className="geo-texture bg-cream section-pad">
        <Container className="grid gap-6 sm:grid-cols-2">
          {keyStages.map((ks) => (
            <a key={ks.slug} href={`/curriculum/${ks.slug}`} className="rounded-2xl border border-gold-light/50 bg-white p-6 shadow-sm transition hover:border-gold-500 hover:shadow-md">
              <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">{ks.title}</p>
              <h3 className="mt-1 font-serif text-xl font-semibold text-ink">{ks.range}</h3>
              <p className="mt-3 text-sm text-ink/70">{ks.subjects.slice(0, 4).join(" · ")}…</p>
              <span className="mt-4 inline-block text-sm font-semibold text-gold-700">View timetable →</span>
            </a>
          ))}
        </Container>
      </section>

      <section className="section-pad">
        <Container>
          <Kicker>Sample weekly timetable</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">See how a typical week looks.</h2>
          <div className="mt-8 max-w-xl">
            <CurriculumSampleWeek />
          </div>
        </Container>
      </section>

      <AdmissionsStrip />
      <CtaBand heading="Ready to apply?" body="Start your child's application today." />
    </>
  );
}
