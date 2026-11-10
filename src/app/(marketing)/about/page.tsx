import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { getAboutContent, getSiteSettings } from "@/lib/content";
import { COMPASS, type CompassStrand } from "@/content/compass";
import { Icon, type IconName } from "@/components/learn/Icon";

const STRAND_ICON: Record<CompassStrand["strand"], IconName> = { Faith: "heart", Knowledge: "bookOpen", Character: "heartHandshake" };

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
            Six values in three strands: faith, knowledge and character. They are the Academy&apos;s own, taught by name and lived in every lesson.
          </p>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {COMPASS.map((s, si) => (
              <section key={s.strand} aria-labelledby={`strand-${si}`} className="reveal rounded-2xl border border-gold-light/60 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-900 text-gold-300">
                    <Icon name={STRAND_ICON[s.strand]} />
                  </span>
                  <div>
                    <h3 id={`strand-${si}`} className="font-serif text-lg font-semibold text-ink">{s.strand}</h3>
                    <p className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-gold-700">{s.summary}</p>
                  </div>
                </div>
                <ul className="mt-4 divide-y divide-gold-light/50">
                  {s.values.map((v) => (
                    <li key={v.word} className="py-3">
                      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-serif text-xl font-semibold text-ink">
                          {v.word} <span className="text-base font-medium text-gold-700">{v.english}</span>
                        </span>
                        <span className="rounded-full bg-gold-50 px-2 py-0.5 font-mono text-[0.68rem] text-ink/75">{v.halfTerm}</span>
                      </p>
                      <p className="mt-1 text-sm leading-snug text-ink/75">{v.body}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-sm text-ink/70">One value is the focus each half term (shown on each value), recognised with merits, a Compass Star in every class and a character comment on every report.</p>
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
