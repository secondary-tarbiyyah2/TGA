import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { keyStages } from "@/content/curriculum";

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

  return (
    <>
      <section className="geo-texture bg-cream py-16">
        <Container>
          <Kicker>{ks.title}</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">{ks.range}</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">{ks.liveSplit}</p>
          {ks.gcseNote && <p className="mt-4 max-w-2xl text-sm font-medium text-maroon">{ks.gcseNote}</p>}
        </Container>
      </section>

      <section className="py-16">
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

      <CtaBand heading="Ready to apply?" body={`Start your child's application for ${ks.range} today.`} />
    </>
  );
}
