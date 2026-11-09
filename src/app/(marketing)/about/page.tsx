import type { Metadata } from "next";
import { StarMark } from "@/components/StarMark";
import Link from "next/link";
import { aboutDefaults } from "@/content/defaults";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { getAboutContent, getSiteSettings } from "@/lib/content";

export const metadata: Metadata = pageMetadata({
  title: "About Us",
  description: "Our mission, our Tarbiyyah Compass values, the Tarbiyyah family of schools, and the people teaching your child.",
  path: "/about",
});

const defaultRecipe = aboutDefaults.recipe_items;

export default async function AboutPage() {
  const [content, settings] = await Promise.all([getAboutContent(), getSiteSettings()]);
  const recipe = content.recipeItems?.length ? content.recipeItems : defaultRecipe;

  return (
    <>
      <section className="geo-texture bg-cream hero-pad">
        <Container>
          <Kicker>About us</Kicker>
          <h1 className="text-h1 max-w-3xl font-serif font-semibold text-ink">
            {content.heroHeading || "Academic excellence, rooted in faith."}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-ink/75">
            {content.heroBody ||
              "Tarbiyyah Global Academy is a specialist online school where academic excellence meets Islamic values, preparing children for success in this life and the Hereafter."}
          </p>
        </Container>
      </section>

      <section className="section-pad">
        <Container className="grid gap-12 lg:grid-cols-2">
          <div>
            <Kicker>Our mission</Kicker>
            <p className="font-serif text-xl leading-relaxed text-ink sm:text-2xl">
              {content.missionBody ||
                "To nurture confident, compassionate and capable Muslims who excel academically, lead with integrity and make a positive impact."}
            </p>
          </div>
          <div>
            <Kicker>Safeguarding</Kicker>
            <p className="text-ink/75">
              {content.safeguardingBody || (
                <>The safety and wellbeing of every child is our first responsibility, with safer-recruitment vetting for every member of staff (enhanced DBS in the UK, overseas checks abroad) and a named Designated Safeguarding Lead.</>
              )}{" "}
              <Link href="/safeguarding" className="font-semibold text-gold-700 underline">How we keep children safe</Link>.
            </p>
          </div>
        </Container>
      </section>

      <section className="geo-texture bg-cream section-pad" aria-labelledby="recipe-heading">
        <Container>
          <Kicker>Our values: the Tarbiyyah Compass</Kicker>
          <h2 id="recipe-heading" className="text-h2 font-serif font-semibold text-ink">{content.recipeIntro || "Building akhlaq alongside attainment."}</h2>
          {/* Six in a row on desktop, 3 + 3 on tablets, two columns on phones.
              Grid rows stretch, so every card in a row is the same height. */}
          <ol className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="The six Tarbiyyah Compass values">
            {recipe.map((r, i) => (
              <li key={`${r.letter}-${i}`} className="flex h-full flex-col items-center rounded-2xl border border-gold-light/60 bg-white px-3 py-5 text-center shadow-sm">
                <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-900 text-gold-300"><StarMark className="h-6 w-6" /></span>
                <h3 className="mt-3 font-serif font-semibold text-ink">{r.word}</h3>
                <p className="mt-1 text-sm leading-snug text-ink/70">{r.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 max-w-3xl text-sm text-ink/70">One value is the focus each half term, recognised with merits, a Compass Star in every class and a character comment on every report.</p>
        </Container>
      </section>

      <section className="section-pad">
        <Container className={`grid gap-10 ${settings.headteacherWelcomeQuote ? "lg:grid-cols-2 lg:items-center" : ""}`}>
          <div>
            <Kicker>The Tarbiyyah family</Kicker>
            <h2 className="text-h2 font-serif font-semibold text-ink">{content.familyHeading || "10+ years, three established schools."}</h2>
            <p className="mt-4 max-w-3xl text-ink/75">
              {content.familyBody ||
                "Tarbiyyah Global Academy is part of the established Tarbiyyah family of schools: Tarbiyyah Primary, Tarbiyyah Secondary School for Boys and Tarbiyyah Al-Banaat, all operating for over ten years. The Academy brings that same ethos and standard of care online, for families anywhere in the world."}
            </p>
          </div>
          {/* Same Site Settings field as the homepage welcome: only a real,
              admin-confirmed quote ever appears. */}
          {settings.headteacherWelcomeQuote && (
            <div>
              <Kicker>Headteacher&apos;s message</Kicker>
              <blockquote className="rounded-2xl border border-gold-light/50 bg-white p-6">
                <p className="font-serif text-lg leading-relaxed text-ink">&ldquo;{settings.headteacherWelcomeQuote}&rdquo;</p>
                {settings.headteacherName && (
                  <footer className="mt-4 text-sm font-semibold text-gold-700">{settings.headteacherName}, Headteacher</footer>
                )}
              </blockquote>
            </div>
          )}
        </Container>
      </section>

      <CtaBand
        heading="Meet us before you decide."
        body="Join an online open evening to meet the Headteacher, see a live lesson and ask anything."
        ctaLabel="Open evenings"
        ctaHref="/open-evening"
      />
    </>
  );
}
