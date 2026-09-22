import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker, PlaceholderNote } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";

export const metadata: Metadata = {
  title: "Pastoral Care & SEND Support",
  description: "How we support every child's wellbeing, character and additional needs — including the Weekly Tarbiyah Note.",
};

export default function PastoralCarePage() {
  return (
    <>
      <section className="geo-texture bg-cream py-16">
        <Container>
          <Kicker>Pastoral Care &amp; SEND Support</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Every child known, every child supported.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            An online school still means real relationships. Every pupil has a form tutor who knows them personally
            — academically and personally.
          </p>
        </Container>
      </section>

      <section className="py-16">
        <Container className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <Kicker>The Weekly Tarbiyah Note</Kicker>
            <h2 className="font-serif text-2xl font-semibold text-ink">A personal update, every week.</h2>
            <p className="mt-4 text-ink/75">
              Separate from academic reports, the Weekly Tarbiyah Note is a short, personal update from your
              child&apos;s form tutor on their character and akhlaq — how they treated others, effort shown, and
              moments worth celebrating.
            </p>
            <PlaceholderNote>Draft concept — not yet confirmed</PlaceholderNote>
          </div>
          <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-maroon">Sample note (illustrative)</p>
            <p className="mt-3 font-serif text-ink/80">
              &ldquo;This week, [child] helped a classmate who was struggling with their reading task without being
              asked — a lovely example of ihsan in action. Keep it up!&rdquo;
            </p>
          </div>
        </Container>
      </section>

      <section className="geo-texture bg-cream py-16">
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

      <CtaBand heading="Questions about pastoral or SEND support?" body="Reach out — we're happy to talk it through before you apply." ctaLabel="Contact us" ctaHref="/contact" />
    </>
  );
}
