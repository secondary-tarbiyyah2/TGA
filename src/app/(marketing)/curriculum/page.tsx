import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { keyStages } from "@/content/curriculum";
import { getCurriculumContent } from "@/lib/content";

export const metadata: Metadata = {
  title: "Curriculum",
  description: "The full British curriculum plus Islamic Studies, by key stage, Reception to GCSE.",
};

export default async function CurriculumPage() {
  const content = await getCurriculumContent();

  return (
    <>
      <section className="geo-texture bg-cream py-16">
        <Container>
          <Kicker>Curriculum</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">
            {content.heroHeading || "The full British curriculum, plus Islamic Studies."}
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            {content.heroBody || (
              <>
                Live-timetabled academic subjects taught by qualified UK teachers, through to GCSE — with
                Qur&apos;an, Islamic Studies and Arabic on the timetable at every key stage.
              </>
            )}
          </p>
        </Container>
      </section>

      <section className="py-16">
        <Container>
          <Kicker>Two live-lesson time bands</Kicker>
          <h2 className="font-serif text-2xl font-semibold text-ink">
            {content.timeBandsHeading || "Lessons timed for a genuinely global school."}
          </h2>
          <p className="mt-4 max-w-2xl text-ink/75">
            {content.timeBandsBody || (
              <>
                Rather than one UK-hours timetable, families choose the live-lesson band that suits their timezone: a{" "}
                <strong>UK / Europe / West-Africa band</strong> and a <strong>Gulf / South-Asia band</strong>. This
                is a draft concept, not yet a confirmed commitment — final timetable bands will be published ahead
                of enrolment.
              </>
            )}
          </p>
        </Container>
      </section>

      <section className="geo-texture bg-cream py-16">
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

      <CtaBand heading="See how a typical week looks." body="Explore the sample timetable for your child's year group." />
    </>
  );
}
