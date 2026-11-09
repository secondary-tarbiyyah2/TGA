import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { WeeklyLessons } from "@/components/CurriculumSampleWeek";
import { getCurriculumDocuments, getKeyStages } from "@/lib/content";
import { publicSubject } from "@/content/curriculum";

const TERM_LABEL: Record<string, string> = { autumn: "Autumn", spring: "Spring", summer: "Summer" };

export async function generateStaticParams() {
  return (await getKeyStages()).map((ks) => ({ stage: ks.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ stage: string }> }): Promise<Metadata> {
  const { stage } = await params;
  const ks = (await getKeyStages()).find((k) => k.slug === stage);
  if (!ks) return {};
  return pageMetadata({
    title: `${ks.range} Curriculum`,
    description: `Subjects, timetable and sample week for ${ks.range} at Tarbiyyah Global Academy.`,
    path: `/curriculum/${ks.slug}`,
  });
}

export default async function KeyStagePage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage } = await params;
  const allStages = await getKeyStages();
  const ks = allStages.find((k) => k.slug === stage);
  if (!ks) notFound();

  const subjects = ks.subjects.map(publicSubject).filter((s): s is string => !!s);
  const documents = (await getCurriculumDocuments()).filter((d) => d.keyStage === stage);
  const documentsBySubject = documents.reduce<Record<string, typeof documents>>((acc, d) => {
    (acc[d.subject] ||= []).push(d);
    return acc;
  }, {});

  return (
    <>
      <section className="geo-texture bg-cream section-pad-tight">
        <Container>
          {/* Move between key stages without going back to the index. */}
          {/* One scrolling row on phones (three wrapped rows of pills pushed the
              heading below the fold); wraps normally from the sm breakpoint. */}
          <nav aria-label="Key stages" className="-mx-4 mb-8 overflow-x-auto px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0">
            <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
              <li>
                <Link href="/curriculum" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-gold-light/60 bg-white/60 px-4 text-sm font-medium text-ink/75 hover:border-gold-500">
                  <span aria-hidden="true">←&nbsp;</span>Curriculum
                </Link>
              </li>
              {allStages.map((k) => (
                <li key={k.slug}>
                  <Link
                    href={`/curriculum/${k.slug}`}
                    aria-current={k.slug === ks.slug ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium ${k.slug === ks.slug ? "bg-ink-900 text-gold-300" : "border border-gold-light/60 bg-white/60 text-ink/75 hover:border-gold-500"}`}
                  >
                    {k.range}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <Kicker>{ks.title}</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">{ks.range}</h1>
          <p className="mt-4 max-w-2xl text-lg text-ink/75">{ks.liveSplit}</p>
          {ks.gcseNote && <p className="mt-4 max-w-2xl text-sm text-ink/70">{ks.gcseNote}</p>}
        </Container>
      </section>

      <section className="section-pad-tight">
        <Container className="grid gap-12 lg:grid-cols-2">
          <div>
            <Kicker>Subjects</Kicker>
            <h2 className="text-h2 font-serif font-semibold text-ink">What pupils study.</h2>
            <ul className="mt-6 space-y-2.5">
              {subjects.map((s) => (
                <li key={s} className="flex items-start gap-3 text-ink/80">
                  <span aria-hidden="true" className="mt-1 text-sm text-gold">◆</span>
                  {s}
                </li>
              ))}
            </ul>
            {ks.slug === "year-10-11" && (
              <p className="mt-6 text-sm text-ink/70">
                Exam boards and specification codes for each subject are set out in the{" "}
                <Link href="/policies/19-examinations-and-private-candidates/" className="font-semibold text-gold-700 underline">Examinations and Private Candidates Policy</Link>.
              </p>
            )}
          </div>
          <div>
            <Kicker>Timetable</Kicker>
            <h2 className="text-h2 font-serif font-semibold text-ink">Live lessons each week.</h2>
            <WeeklyLessons ks={ks} />
          </div>
        </Container>
      </section>

      {documents.length > 0 && (
        <section className="geo-texture bg-cream section-pad-tight" aria-labelledby="curriculum-documents-heading">
          <Container>
            <Kicker>Curriculum documents</Kicker>
            <h2 id="curriculum-documents-heading" className="font-serif text-2xl font-semibold text-ink">
              Subject overviews and schemes of work
            </h2>
            <div className="mt-6 grid gap-8 sm:grid-cols-2">
              {Object.entries(documentsBySubject).map(([subject, docs]) => (
                <div key={subject}>
                  <h3 className="font-semibold text-ink">{subject}</h3>
                  <ul className="mt-2 space-y-2">
                    {docs
                      .slice()
                      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                      .map((d) => (
                        <li key={d._id}>
                          <a href={d.fileUrl} className="text-sm font-medium text-gold-700 underline" target="_blank" rel="noopener noreferrer">
                            {d.title}
                          </a>
                          {d.term && <span className="ml-2 text-xs text-ink/70">{TERM_LABEL[d.term]}</span>}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </Container>
        </section>
      )}

      <CtaBand heading="Ready to apply?" body={`See how admissions works for ${ks.range}, from the online form to the first live lesson.`} ctaLabel="How to apply" />

      <section className="border-t border-gold-light/30 bg-cream" aria-labelledby="stage-next-heading">
        <Container className="py-10">
          <h2 id="stage-next-heading" className="text-xs font-semibold uppercase tracking-wider text-ink/65">Where next</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { href: "/learning", label: "How learning works", body: "The school day, how a live lesson runs and the portals." },
              { href: "/open-evening", label: "Open evenings & taster morning", body: "Meet the Headteacher and join a real lesson." },
              { href: "/fees", label: "Fees", body: `Published fees for ${ks.range} and payment plans.` },
            ].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="block h-full rounded-2xl border border-gold-light/50 bg-white p-4 transition-colors hover:border-gold-500">
                  <span className="block font-semibold text-ink">{l.label}</span>
                  <span className="mt-1 block text-sm text-ink/65">{l.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  );
}
