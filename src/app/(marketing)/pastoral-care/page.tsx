import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { AdmissionsStrip } from "@/components/AdmissionsStrip";

export const metadata: Metadata = pageMetadata({
  title: "Pastoral Care & SEND Support",
  description: "How we support every child's wellbeing, character and additional needs, including the Weekly Tarbiyah Note.",
  path: "/pastoral-care",
});

export default function PastoralCarePage() {
  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Pastoral Care &amp; SEND Support</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Every child known, every child supported.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            An online school still means real relationships. Every pupil has a form tutor who knows them personally
            – academically and personally.
          </p>
        </Container>
      </section>

      <section className="section-pad">
        <Container>
          <Kicker>Weekly Tarbiyah Note</Kicker>
          <h2 className="font-serif text-2xl font-semibold text-ink">A personal update, every week.</h2>
          <p className="mt-4 max-w-2xl text-ink/75">
            Alongside academic reports, your child&apos;s form tutor sends a personal weekly note on their character
            and akhlaq, how they&apos;ve been with their peers, their effort and attitude, and anything worth
            celebrating or working on. It&apos;s separate from academic reporting, because we want you to know your
            child as a person, not just as a set of grades.
          </p>
        </Container>
      </section>

      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>SEND support</Kicker>
          <h2 className="font-serif text-2xl font-semibold text-ink">Support for a range of additional needs.</h2>
          <p className="mt-4 max-w-2xl text-ink/75">
            We work with families to understand each child&apos;s needs during the application process and put
            reasonable, practical support in place within our online setting. Tell us about your child&apos;s needs
            when you apply so we can discuss what&apos;s possible together.
          </p>
        </Container>
      </section>

      <AdmissionsStrip />
      <CtaBand heading="Questions about pastoral or SEND support?" body="Reach out, we're happy to talk it through before you apply." ctaLabel="Contact us" ctaHref="/contact" />
    </>
  );
}
