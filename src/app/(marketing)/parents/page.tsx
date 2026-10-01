import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { HubCards } from "@/components/HubCards";
import { CtaBand } from "@/components/CtaBand";
import { parentsHub } from "@/lib/nav";

export const metadata: Metadata = {
  title: "Parents",
  description: "Term dates, policies, safeguarding, FAQs and everything else parents need in one place.",
};

export default function ParentsHubPage() {
  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Parents</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Everything parents need, in one place.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">Term dates, policies, safeguarding, pastoral care and answers to common questions.</p>
        </Container>
      </section>
      <section className="section-pad">
        <Container>
          <HubCards cards={parentsHub} />
        </Container>
      </section>
      <CtaBand heading="Still have a question?" body="Get in touch and we will be happy to help." ctaLabel="Contact us" ctaHref="/contact" />
    </>
  );
}
