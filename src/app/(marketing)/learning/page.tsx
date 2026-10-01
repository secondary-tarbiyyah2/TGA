import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { HubCards } from "@/components/HubCards";
import { CtaBand } from "@/components/CtaBand";
import { learningHub } from "@/lib/nav";

export const metadata: Metadata = {
  title: "Learning",
  description: "The curriculum by key stage, pastoral care and a sample week at Tarbiyyah Global Academy.",
};

export default function LearningHubPage() {
  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Learning</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">A specialist curriculum, from Reception to GCSE.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">The full British curriculum, live-timetabled and taught by qualified UK teachers — with Qur'an, Islamic Studies and Arabic woven through every key stage, not bolted on.</p>
        </Container>
      </section>
      <section className="section-pad">
        <Container>
          <HubCards cards={learningHub} />
        </Container>
      </section>
      <CtaBand heading="Ready to find out more?" body="See how we teach, what a school day looks like, and how to apply." />
    </>
  );
}
