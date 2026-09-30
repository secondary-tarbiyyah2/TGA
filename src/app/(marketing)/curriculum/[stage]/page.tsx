import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { keyStages } from "@/content/curriculum";
import { getCurriculumDocuments } from "@/lib/content";

const TERM_LABEL: Record<string, string> = { autumn: "Autumn", spring: "Spring", summer: "Summer" };

export function generateStaticParams() {
  return keyStages.map((ks) => ({ stage: ks.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ stage: string }> }): Promise<Metadata> {
  const { stage } = await params;
  const ks = keyStages.find((k) => k.slug === stage);
  if (!ks) return {};
  return { title: `${ks.range} Curriculum`, description: `Subjects, timetable and sample week for ${ks.range}.` };
}

export default async function KeyStagePage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage } = await params;
  const ks = keyStages.find((k) => k.slug === stage);
  if (!ks) notFound();

  const documents = (await getCurriculumDocuments()).filter((d) => d.keyStage === stage);
  const documentsBySubject = documents.reduce<Record<string, typeof documents>>((acc, d) => {
    (acc[d.subject] ||= []).push(d);
    return acc;
  }, {});

  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>{ks.title}</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">{ks.range}</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">{ks.liveSplit}</p>
          {ks.gcseNote && <p className="mt-4 max-w-2xl text-sm font-medium text-gold-700">{ks.gcseNote}</p>}
        </Container>
      </section>

      <section className="section-pad">
        <Container className="grid gap-12 lg:grid-cols-2">
          <div>
            <Kicker>Subjects</Kicker>
            <ul className="mt-4 space-y-2">
              {ks.subjects.map((s) => (
                <li key={s} className="flex items-start gap-2 text-ink/80">
                  <span aria-hidden="true" className="mt-1 text-gold">◆</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <Kicker>Sample weekly timetable</Kicker>
            <div className="mt-4 divide-y divide-gold-light/40 overflow-hidden rounded-2xl border border-gold-light/50">
              {ks.sampleWeek.map((d) => (
                <div key={d.day} className="flex justify-between bg-white px-4 py-3 text-sm">
                  <span className="font-semibold text-ink">{d.day}</span>
                  <span className="text-ink/70">{d.focus}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink/70">Illustrative sample — the confirmed timetable is published ahead of enrolment.</p>
          </div>
        </Container>
      </section>

      {documents.length > 0 && (
        <section className="geo-texture bg-cream section-pad" aria-labelledby="curriculum-documents-heading">
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
                          {d.term && <span className="ml-2 text-xs text-ink/60">{TERM_LABEL[d.term]}</span>}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </Container>
        </section>
      )}

      <CtaBand heading="Ready to apply?" body={`Start your child's application for ${ks.range} today.`} />
    </>
  );
}
