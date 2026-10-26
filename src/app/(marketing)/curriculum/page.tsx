import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { AdmissionsStrip } from "@/components/AdmissionsStrip";
import { getCurriculumContent, getKeyStages } from "@/lib/content";
import { CurriculumSampleWeek } from "@/components/CurriculumSampleWeek";

export const metadata: Metadata = pageMetadata({
  title: "Curriculum",
  description: "A specialist curriculum — Qur'an, Arabic and Islamic Studies alongside the full national curriculum, by key stage, Year 1 to International GCSE.",
  path: "/curriculum",
});

const STRANDS = [
  { title: "Qur'an, Arabic and Islamic Studies", body: "Qur'an recitation, Tajweed and memorisation in groups set by ability; Arabic as the Academy's language so pupils connect with the texts directly; Islamic Studies covering aqeedah, fiqh, seerah and hadith. On the timetable every week, not an after-school extra." },
  { title: "The national curriculum, to International GCSE", body: "English, Mathematics, Science, humanities and computing, sequenced from Year 1 to International GCSE, taught live by qualified teachers in classes of no more than 15." },
  { title: "Tarbiyyah and character", body: "Prayer built into the day, the RECIPE values taught by name, PSHE, and careers guidance from Year 7 — so pupils grow in knowledge, character and faith together." },
];

// KS4 subjects as set in the portal (content/syllabus/ks4). Every pupil sits Pearson Edexcel
// International GCSEs; where a course is taught from a UK GCSE specification, the spec's
// examEntry gives the International GCSE pupils sit. History is not offered at KS4.
const EXAM_BOARDS = [
  { subject: "English Language", taught: "AQA GCSE specification (8700)", exam: "English Language B (4EB1)" },
  { subject: "English Literature", taught: "Same specification", exam: "English Literature (4ET1)" },
  { subject: "Mathematics", taught: "Pearson Edexcel GCSE specification (1MA1)", exam: "Mathematics A (4MA1)" },
  { subject: "Science: Double Award, or separate Biology, Chemistry and Physics", taught: "Same specifications", exam: "Science Double Award (4SD0), or Biology (4BI1), Chemistry (4CH1) and Physics (4PH1)" },
  { subject: "Islamic Studies", taught: "Same specification", exam: "Islamic Studies (4IS1)" },
  { subject: "Option: Arabic", taught: "Pearson Edexcel GCSE specification (1AA0)", exam: "Arabic (First Language) (4AA1)" },
  { subject: "Option: Business", taught: "Same specification", exam: "Business (4BS1)" },
  { subject: "Option: Computer Science", taught: "Pearson Edexcel GCSE specification (1CP2)", exam: "Computer Science (4CP0)" },
  { subject: "Option: Geography", taught: "AQA GCSE specification (8035)", exam: "Geography (4GE1)" },
];

export default async function CurriculumPage() {
  const [content, keyStages] = await Promise.all([getCurriculumContent(), getKeyStages()]);

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
                A specialist curriculum, live-timetabled and taught by qualified teachers, through to International GCSE —
                with Qur&apos;an, Islamic Studies and Arabic on the timetable at every key stage.
              </>
            )}
          </p>
        </Container>
      </section>

      {/* The three strands every pupil has every week, then the exam boards. */}
      <section className="section-pad">
        <Container>
          <Kicker>Every week, at every key stage</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">Three strands, one timetable.</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {STRANDS.map((st) => (
              <div key={st.title} className="rounded-2xl border border-gold-light/50 bg-white p-6 shadow-sm">
                <p className="font-serif text-xl font-semibold text-ink">{st.title}</p>
                <p className="mt-2 text-sm text-ink/75">{st.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>International GCSE</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">Recognised qualifications, sat as private candidates.</h2>
          <p className="mt-4 max-w-2xl text-ink/75">
            Years 10 and 11 follow two-year courses: the core subjects plus two options. Every pupil sits Pearson Edexcel International GCSEs. In English Language, Mathematics, Computer Science, Geography and Arabic we teach the UK GCSE course and add what the International GCSE exam needs, so pupils are ready for its papers. History is not offered at GCSE. Pupils sit their exams at an approved centre near home; we help families register and pay the centre directly (see the Examinations and Private Candidates Policy).
          </p>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-gold-light/50 bg-white">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">International GCSE subjects: what is taught and the exam pupils sit</caption>
              <thead>
                <tr className="border-b border-gold-light/50 text-left text-xs uppercase tracking-wide text-ink/65">
                  <th scope="col" className="px-4 py-3 font-semibold">Subject</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Taught from</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Exam pupils sit (Pearson Edexcel International GCSE)</th>
                </tr>
              </thead>
              <tbody>
                {EXAM_BOARDS.map((r) => (
                  <tr key={r.subject} className="border-b border-gold-light/40 last:border-0">
                    <th scope="row" className="px-4 py-3 text-left font-medium text-ink">{r.subject}</th>
                    <td className="px-4 py-3 text-ink/80">{r.taught}</td>
                    <td className="px-4 py-3 text-ink/80">{r.exam}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink/65">Exam codes are confirmed at the start of each course and may change if a specification is withdrawn. International GCSEs are not regulated by Ofqual; Pearson describes them as generally equivalent to GCSEs. Exam entry fees are not included in tuition.</p>
        </Container>
      </section>

      <section className="section-pad">
        <Container>
          <Kicker>By key stage</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">Subjects and live lessons a week.</h2>
        </Container>
        <Container className="mt-8 grid gap-6 sm:grid-cols-2">
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

      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Sample weekly timetable</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">See how a typical week looks.</h2>
          <div className="mt-8 max-w-xl">
            <CurriculumSampleWeek stages={keyStages} />
          </div>
        </Container>
      </section>

      <AdmissionsStrip />
      <CtaBand heading="Ready to apply?" body="Start your child's application today." />
    </>
  );
}
