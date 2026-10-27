import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { HubCards } from "@/components/HubCards";
import { CtaBand } from "@/components/CtaBand";
import { AdmissionsStrip } from "@/components/AdmissionsStrip";
import { learningHub } from "@/lib/nav";

export const metadata: Metadata = pageMetadata({
  title: "Learning",
  description: "The curriculum by key stage, pastoral care and a sample week at Tarbiyyah Global Academy.",
  path: "/learning",
});

export default function LearningHubPage() {
  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Learning</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">A specialist curriculum, from Year 1 to GCSE.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">The deen at the heart of the day, with the full national curriculum to GCSE, taught live by qualified teachers, Qur&apos;an, Islamic Studies and Arabic woven through every key stage, not bolted on.</p>
        </Container>
      </section>
      <section className="section-pad">
        <Container>
          <h2 className="sr-only">Explore learning at the Academy</h2>
          <HubCards cards={learningHub} />
        </Container>
      </section>
      <AdmissionsStrip />
      <CtaBand heading="Ready to apply?" body="Start your child&apos;s application, or book a free call first." />
    </>
  );
}
