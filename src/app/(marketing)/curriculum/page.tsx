import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import Link from "next/link";
import { CtaBand } from "@/components/CtaBand";
import { getCurriculumContent, getKeyStages } from "@/lib/content";
import { SCHOOL_WEEK_NOTE, lessonsAWeek } from "@/content/curriculum";

export const metadata: Metadata = pageMetadata({
  title: "Curriculum",
  description: "A specialist curriculum, Qur'an, Arabic and Islamic Studies alongside the full national curriculum, by key stage, Year 1 to GCSE.",
  path: "/curriculum",
});

const STRANDS = [
  { title: "Qur'an, Arabic and Islamic Studies", body: "Qur'an recitation, Tajweed and memorisation in groups set by ability; Arabic as the Academy's language so pupils connect with the texts directly; Islamic Studies covering aqeedah, fiqh, seerah and hadith. On the timetable every week, not an after-school extra." },
  { title: "The national curriculum, to GCSE", body: "English, Mathematics, Science, humanities and computing, sequenced from Year 1 to GCSE, taught live by qualified teachers in classes of no more than 15." },
  { title: "Tarbiyyah and character", body: "Prayer built into the day, the Tarbiyyah Compass values taught by name, PSHE, and careers guidance from Year 7, so pupils grow in knowledge, character and faith together." },
];

// Public subject listing only: no exam boards or specification codes (those
// live in the portal and the Examinations policy, and change with entries).
const GCSE_CORE = ["English Language", "English Literature", "Mathematics", "Biology, Chemistry and Physics (three separate sciences)", "Islamic Studies"];
const GCSE_OPTIONS = ["Arabic", "Business", "Geography"];

export default async function CurriculumPage() {
  const [content, keyStages] = await Promise.all([getCurriculumContent(), getKeyStages()]);

  return (
    <>
      <section className="geo-texture bg-cream hero-pad">
        <Container>
          <Kicker>Curriculum</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">
            {content.heroHeading || "A specialist curriculum, academic and Islamic together."}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink/75">
            {content.heroBody || (
              <>
                Qur&apos;an, Arabic and Islamic Studies on the timetable every week, alongside the full national
                curriculum, taught live by qualified teachers in classes of no more than 15, from Year 1 to GCSE.
              </>
            )}
          </p>
        </Container>
      </section>

      {/* The three strands every pupil has every week, then the exam boards. */}
      <section className="section-pad-tight">
        <Container>
          <Kicker>Every week, at every key stage</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">Three strands, one timetable.</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {STRANDS.map((st) => (
              <div key={st.title} className="rounded-2xl border border-gold-light/50 bg-white p-6 shadow-sm">
                <p className="font-serif text-xl font-semibold text-ink">{st.title}</p>
                <p className="mt-2 text-sm text-ink/75">{st.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* One card per key stage: the figures come from src/content/curriculum.ts
          (or the key_stage_pages rows), and each card opens the full subject
          list and lessons-a-week table for that stage. */}
      <section className="geo-texture bg-cream section-pad-tight">
        <Container>
          <Kicker>By key stage</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">Subjects and live lessons a week.</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {keyStages.map((ks) => (
              <li key={ks.slug}>
                <Link href={`/curriculum/${ks.slug}`} className="group flex h-full flex-col rounded-2xl border border-gold-light/50 bg-white p-6 shadow-sm transition hover:border-gold-500 hover:shadow-md">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">{ks.title}</p>
                  <h3 className="mt-1 font-serif text-xl font-semibold text-ink">{ks.range}</h3>
                  <p className="mt-2 flex-1 text-sm text-ink/75">
                    {lessonsAWeek(ks)}
                  </p>
                  <span className="mt-4 text-sm font-semibold text-gold-700 group-hover:underline">Subjects and timetable<span aria-hidden="true"> →</span></span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-3xl text-sm text-ink/70">{SCHOOL_WEEK_NOTE}</p>
          <p className="mt-3 max-w-3xl text-sm text-ink/70">
            See the live day in your own time zone with{" "}
            <Link href="/eligibility" className="font-semibold text-gold-700 underline">Is it right for us?</Link>, and how we support wellbeing and additional needs on{" "}
            <Link href="/pastoral-care" className="font-semibold text-gold-700 underline">Pastoral care &amp; SEND</Link>.
          </p>
        </Container>
      </section>

      <section className="section-pad-tight">
        <Container>
          <Kicker>Years 10 and 11</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">Recognised qualifications, sat as private candidates.</h2>
          <p className="mt-4 max-w-2xl text-ink/75">
            Years 10 and 11 follow two-year GCSE and International GCSE courses, the same as Tarbiyyah Secondary School: the core subjects plus two options. Pupils are entered for their examinations through
            Tarbiyyah Secondary School as the examination centre, and for families outside the UK we help arrange a suitable centre near home.
            History is not offered at GCSE.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-gold-light/50 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">Core subjects</p>
              <ul className="mt-3 space-y-2 text-sm text-ink/80">
                {GCSE_CORE.map((sub) => (
                  <li key={sub} className="flex items-start gap-2"><span aria-hidden="true" className="mt-1 text-gold-500">◆</span>{sub}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-gold-light/50 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">Two options from</p>
              <ul className="mt-3 space-y-2 text-sm text-ink/80">
                {GCSE_OPTIONS.map((sub) => (
                  <li key={sub} className="flex items-start gap-2"><span aria-hidden="true" className="mt-1 text-gold-500">◆</span>{sub}</li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-ink/65">Qur&apos;an and Tajweed and PSHE continue alongside the examination subjects.</p>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm text-ink/70">
            Exam entry fees are not included in tuition and are paid to the examination centre. Full details are in the{" "}
            <Link href="/policies/19-examinations-and-private-candidates/" className="font-semibold text-gold-700 underline">Examinations and Private Candidates Policy</Link>, and the subjects and lessons a week are on the{" "}
            <Link href="/curriculum/year-10-11" className="font-semibold text-gold-700 underline">Year 10 to Year 11 page</Link>.
          </p>
        </Container>
      </section>

      <CtaBand heading="Ready to apply?" body="See how admissions works, from the online form to your child's first live lesson." ctaLabel="How to apply" />
    </>
  );
}
