import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { getAboutContent } from "@/lib/content";

export const metadata: Metadata = {
  title: "About Us",
  description: "Our mission, Islamic ethos, the Tarbiyyah family background, and our safeguarding commitment.",
};

const defaultRecipe = [
  { letter: "R", word: "Respect", body: "For Allah, for others, and for oneself." },
  { letter: "E", word: "Excellence", body: "In academic work and in character alike." },
  { letter: "C", word: "Compassion", body: "Kindness modelled and expected, every day." },
  { letter: "I", word: "Integrity", body: "Doing right when no one is watching." },
  { letter: "P", word: "Purpose", body: "Learning connected to a life of meaning and worship." },
  { letter: "E", word: "Excellence in Adab", body: "Manners and conduct as the foundation of learning." },
];

export default async function AboutPage() {
  const content = await getAboutContent();
  const recipe = content.recipeItems?.length ? content.recipeItems : defaultRecipe;

  return (
    <>
      <section className="geo-texture bg-cream py-16">
        <Container>
          <Kicker>About Us</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">
            {content.heroHeading || "Academic excellence, rooted in faith."}
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            {content.heroBody ||
              "Tarbiyyah Global Academy is an online British school where academic excellence meets Islamic values — preparing children for success in this life and the Hereafter."}
          </p>
        </Container>
      </section>

      <section className="py-16">
        <Container className="grid gap-12 lg:grid-cols-2">
          <div>
            <Kicker>Our mission</Kicker>
            <p className="font-serif text-2xl leading-relaxed text-ink">
              {content.missionBody ||
                "To nurture confident, compassionate and capable Muslims who excel academically, lead with integrity and make a positive impact."}
            </p>
          </div>
          <div>
            <Kicker>Safeguarding</Kicker>
            <p className="text-ink/75">
              {content.safeguardingBody || (
                <>
                  The safety and wellbeing of every child is our first responsibility. Tarbiyyah Global Academy
                  follows the same safeguarding standards as Tarbiyyah Primary and Tarbiyyah Secondary, including
                  vetted, DBS-checked staff, a named Designated Safeguarding Lead, and clear reporting routes for any
                  concern.
                </>
              )}{" "}
              Our full Safeguarding Policy is available on the{" "}
              <a href="/policies" className="text-gold-700 underline">Policies</a> page.
            </p>
          </div>
        </Container>
      </section>

      <section className="geo-texture bg-cream py-16">
        <Container>
          <Kicker>Our character framework — RECIPE</Kicker>
          <h2 className="font-serif text-3xl font-semibold text-ink">{content.recipeIntro || "Building akhlaq alongside attainment."}</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recipe.map((r) => (
              <div key={r.word} className="rounded-2xl bg-white p-6 shadow-sm">
                <span className="font-serif text-3xl font-bold text-gold">{r.letter}</span>
                <h3 className="mt-2 font-semibold text-ink">{r.word}</h3>
                <p className="mt-1 text-sm text-ink/70">{r.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-16">
        <Container className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <Kicker>The Tarbiyyah family</Kicker>
            <h2 className="font-serif text-3xl font-semibold text-ink">{content.familyHeading || "10+ years, two established schools."}</h2>
            <p className="mt-4 text-ink/75">
              {content.familyBody ||
                "Tarbiyyah Global Academy is part of the established Tarbiyyah family of schools — Tarbiyyah Primary and Tarbiyyah Secondary School for Boys, both operating for over ten years. The Academy brings that same ethos and standard of care online, for families anywhere in the world."}
            </p>
          </div>
          <div>
            <Kicker>Headteacher&apos;s message</Kicker>
            <blockquote className="rounded-2xl border border-gold-light/50 bg-white p-6">
              <p className="font-serif text-lg leading-relaxed text-ink">
                &ldquo;Every child deserves an education that nurtures their mind and their faith together. At
                Tarbiyyah Global Academy we bring the standards of the Tarbiyyah family of schools to families
                anywhere in the world.&rdquo;
              </p>
              <footer className="mt-4 text-sm font-semibold text-gold-700">Hardeep Sandhar, Headteacher</footer>
            </blockquote>
          </div>
        </Container>
      </section>

      <CtaBand heading="Ready to find out more?" body="See how we teach, what a school day looks like, and how to apply." />
    </>
  );
}
