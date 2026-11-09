import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { getKeyStages } from "@/lib/content";
import { LESSON_SHAPE, lessonsAWeek } from "@/content/curriculum";

export const metadata: Metadata = pageMetadata({
  title: "How Learning Works",
  description: "The school day, how a live lesson runs, the Student and Parent Portals, and what your child needs at home, at Tarbiyyah Global Academy.",
  path: "/learning",
});

// The footer and "Where next" links call this page "How learning works", so it
// explains exactly that (the day, a lesson, the portals, the kit) with each key
// stage linking on to its curriculum page, instead of repeating the
// curriculum hero. The layout's "Where next" links follow it. Facts come from src/content/curriculum.ts and the FAQs.
const PORTALS = [
  {
    title: "Student Portal",
    body: "Your child opens today's timetable and presses Join to go straight into the right lesson on Microsoft Teams. Homework, resources and lesson recordings are in the same place.",
  },
  {
    title: "Parent Portal",
    body: "Your own login, set up when you accept a place. It shows attendance, homework, Qur'an progress, merits, reports and messages from teachers.",
  },
  {
    title: "Reports and the Tarbiyah Note",
    body: "A written report each term, two parents' evenings a year, and a weekly Tarbiyah Note from the form tutor on character and effort.",
  },
];

const KIT = [
  "A Windows or Mac laptop or desktop, or an iPad",
  "A webcam, microphone and headset",
  "A wired connection or good Wi-Fi",
  "A quiet place to work",
  "Recommended: a tablet with a stylus, to write on worksheets and the lesson PDF",
  "If there is no tablet with a stylus: a printer at home (required)",
];

export default async function LearningHubPage() {
  const keyStages = await getKeyStages();

  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>How learning works</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">A real school day, taught live at home.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            Your child joins live lessons with a qualified teacher and a class of no more than 15, follows a proper timetable,
            and has homework set and marked between lessons. You see it all in the Parent Portal.
          </p>
        </Container>
      </section>

      <section className="section-pad">
        <Container>
          <Kicker>The school week</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">Mornings and early afternoons, Monday to Friday.</h2>
          <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            <div className="rounded-2xl border border-gold-light/50 bg-white p-6 shadow-sm">
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gold-700">Monday to Thursday</dt>
                  <dd className="mt-1 font-serif text-2xl font-semibold text-ink">09:00 to 15:00 UK time</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gold-700">Friday</dt>
                  <dd className="mt-1 font-serif text-2xl font-semibold text-ink">09:00 to 12:00</dd>
                  <dd className="mt-1 text-ink/70">The afternoon is free for Jumu&apos;ah.</dd>
                </div>
              </dl>
              <p className="mt-5 border-t border-gold-light/40 pt-4 text-sm text-ink/70">
                Form time, assemblies and clubs are in addition to lessons. A four-day live week, with Friday as a structured
                independent study day, is also available for Year 1 to Year 9.
              </p>
            </div>
            <ul className="divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white shadow-sm">
              {keyStages.map((ks) => (
                <li key={ks.slug}>
                  <Link href={`/curriculum/${ks.slug}`} className="group flex items-center justify-between gap-4 px-6 py-4 hover:bg-cream/60">
                    <span>
                      <span className="block font-serif text-lg font-semibold text-ink">{ks.range}</span>
                      <span className="block text-sm text-ink/70">{lessonsAWeek(ks)}</span>
                    </span>
                    <span aria-hidden="true" className="text-gold-700 transition-transform group-hover:translate-x-0.5">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <section id="lesson" className="geo-texture bg-cream section-pad scroll-mt-24">
        <Container>
          <Kicker>A live lesson</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">The same clear shape, every lesson.</h2>
          <p className="mt-4 max-w-2xl text-ink/75">
            Cameras on, a short explanation, then plenty of practice with the teacher checking as pupils work. Timings below are for
            a 50-minute lesson in Years 7 to 11; younger year groups follow the same shape in 45 or 30 minutes.
          </p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {LESSON_SHAPE.map((s, i) => (
              <li key={s.step} className="rounded-2xl border border-gold-light/50 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-100 text-sm font-semibold text-gold-900">{i + 1}</span>
                  <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-ink/65">{s.mins}</span>
                </div>
                <p className="mt-3 font-semibold text-ink">{s.step}</p>
                <p className="mt-1 text-sm text-ink/70">{s.what}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-ink/70">
            Want to see one? Join a real lesson at our{" "}
            <Link href="/open-evening" className="font-semibold text-gold-700 underline">taster morning</Link>, or read the{" "}
            <Link href="/policies/03-live-lesson-protocols/" className="font-semibold text-gold-700 underline">Live Lesson Protocols</Link>.
          </p>
        </Container>
      </section>

      <section className="section-pad">
        <Container>
          <Kicker>Between lessons</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">Everything in one place, for pupils and parents.</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {PORTALS.map((p) => (
              <div key={p.title} className="rounded-2xl border border-gold-light/50 bg-white p-6 shadow-sm">
                <h3 className="font-serif text-xl font-semibold text-ink">{p.title}</h3>
                <p className="mt-2 text-sm text-ink/75">{p.body}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-sm text-ink/70">
            Every pupil also has a form tutor who knows them well. See{" "}
            <Link href="/pastoral-care" className="font-semibold text-gold-700 underline">Pastoral care &amp; SEND</Link> for how we look after
            wellbeing and additional needs.
          </p>

          <div className="mt-10 rounded-2xl border border-gold-light/50 bg-cream p-6 sm:p-8">
            <h3 className="font-serif text-xl font-semibold text-ink">What your child needs at home</h3>
            <ul className="mt-4 grid gap-x-8 gap-y-2 text-sm text-ink/80 sm:grid-cols-2">
              {KIT.map((k) => (
                <li key={k} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-0.5 text-gold">◆</span>
                  {k}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-ink/70">
              Every day your child writes on worksheets and the lesson PDF. A tablet with a stylus is the simplest way: any tablet
              that takes a stylus will do, or a basic graphics tablet that plugs into the laptop. Without one, a printer at home is
              needed so the pages can be printed and written on by hand.
            </p>
            <p className="mt-3 text-sm text-ink/70">
              Lessons run on Microsoft Teams, which is free. We check your setup with you during induction week, which starts on
              Monday 4 January 2027, before the first live lessons on Monday 11 January.
            </p>
          </div>
        </Container>
      </section>

      <CtaBand heading="Ready to apply?" body="The deadline to apply for January 2027 is Friday 18 December 2026. Start online, or book a free call first." />
    </>
  );
}
