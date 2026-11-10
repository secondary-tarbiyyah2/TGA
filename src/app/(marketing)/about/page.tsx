import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { getAboutContent, getSiteSettings } from "@/lib/content";
import { COMPASS, COMPASS_WORD, IHSAN_HALF_TERM } from "@/content/compass";

export const metadata: Metadata = pageMetadata({
  title: "About Us",
  description: "Our mission, our Tarbiyyah Compass values, the Tarbiyyah family of schools, and the people teaching your child.",
  path: "/about",
});


export default async function AboutPage() {
  const [content, settings] = await Promise.all([getAboutContent(), getSiteSettings()]);

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
          <p className="mt-3 max-w-2xl text-ink/75">
            Our five values spell <strong className="font-semibold text-ink">{COMPASS_WORD}</strong>: worshipping Allah as though you see Him. In an online school much of a pupil&apos;s day happens with no adult in the room, so this is the character we build, one letter at a time.
          </p>
          {/* The letters run down the left in large type, so the word reads at a glance. */}
          <ol className="mt-8 grid gap-3 lg:grid-cols-5" aria-label={`The ${COMPASS_WORD} values`}>
            {COMPASS.map((v) => (
              <li key={v.letter} className="reveal flex gap-4 rounded-2xl border border-gold-light/60 bg-white p-4 shadow-sm lg:flex-col lg:gap-3 lg:p-5">
                <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-ink-900 font-serif text-3xl font-semibold text-gold-300">
                  {v.letter}
                </span>
                <div className="min-w-0">
                  <h3 className="font-serif text-lg font-semibold text-ink">
                    <span className="text-gold-700">{v.word.charAt(0)}</span>
                    {v.word.slice(1)}
                  </h3>
                  <p className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-gold-700">{v.gloss}</p>
                  <p className="mt-1.5 text-sm leading-snug text-ink/75">{v.body}</p>
                  <p className="mt-2 inline-block rounded-full bg-gold-50 px-2 py-0.5 font-mono text-[0.68rem] text-ink/75">{v.halfTerm}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-xl border border-gold-light/60 bg-white/70 px-4 py-3 text-sm text-ink/80">
            <strong className="font-semibold text-ink">{IHSAN_HALF_TERM}: Ihsan.</strong> The year ends with all five together, doing everything as well as we can because Allah sees us.
          </p>
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
