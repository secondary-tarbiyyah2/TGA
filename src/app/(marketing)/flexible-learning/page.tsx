import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";

export const metadata: Metadata = {
  title: "Flexible Learning Options",
  description: "Standard Monday–Friday or intensive Monday–Thursday timetables, with a screen-time-conscious philosophy.",
};

export default function FlexibleLearningPage() {
  return (
    <>
      <section className="geo-texture bg-cream py-16">
        <Container>
          <Kicker>Flexible Learning Options</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">A timetable that fits your family.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            Every family is different. Choose the rhythm that works best for your child, without compromising on
            live teaching or structure.
          </p>
        </Container>
      </section>

      <section className="py-16">
        <Container className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
            <h2 className="font-serif text-xl font-semibold text-ink">Standard: Monday – Friday</h2>
            <p className="mt-2 text-sm text-ink/70">
              Live lessons across all five days, mirroring a traditional school week — for families who want a
              consistent daily rhythm.
            </p>
          </div>
          <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
            <h2 className="font-serif text-xl font-semibold text-ink">Intensive: Monday – Thursday + independent Friday</h2>
            <p className="mt-2 text-sm text-ink/70">
              Core live teaching compressed into four days, with Friday set aside for independent work, catch-up,
              Qur&apos;an practice, or family time.
            </p>
          </div>
        </Container>
      </section>

      <section className="geo-texture bg-cream py-16">
        <Container className="max-w-2xl">
          <Kicker>Our screen-time philosophy</Kicker>
          <h2 className="font-serif text-2xl font-semibold text-ink">Live lessons, not endless screen time.</h2>
          <p className="mt-4 text-ink/75">
            Being an online school doesn&apos;t mean children are in front of a screen all day. Lessons are
            structured with regular breaks, offline and hands-on activities, and independent work that doesn&apos;t
            require a device — so learning stays healthy and sustainable.
          </p>
        </Container>
      </section>

      <CtaBand heading="Not sure which fits your family?" body="Get in touch and we'll help you decide." ctaLabel="Contact us" ctaHref="/contact" />
    </>
  );
}
