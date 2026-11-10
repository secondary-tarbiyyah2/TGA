import Link from "next/link";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { StarMark } from "@/components/StarMark";
import { KEY_DATES } from "@/content/keyDates";
import { Button } from "@/components/Button";
import { CtaBand } from "@/components/CtaBand";
import { FaqPreview } from "@/components/FaqPreview";
import { getFaqEntries, getHomepageContent, getKeyStages, getSiteSettings, getTestimonials } from "@/lib/content";
import { admissionsProcessSteps } from "@/components/admissions/applicationShared";
import { lessonsAWeek } from "@/content/curriculum";
import { PortalPreview } from "@/components/home/PortalPreview";
import { AdmissionsProcessFlow } from "@/components/admissions/AdmissionsSteps";
import { Icon, type IconName } from "@/components/learn/Icon";

export const metadata: Metadata = pageMetadata({
  title: "A specialist, quality education, rooted in faith",
  description: "An online school by Tarbiyyah Education Trust, delivering a specialist, quality education wherever home is. Live, timetabled lessons with qualified teachers: Qur'an, Arabic and Islamic Studies alongside the full national curriculum, from Year 1 to Year 11, taught with tarbiyyah at its heart.",
  path: "",
});

// Three different reasons, each said once (the hero already names the subjects).
const defaultPillars = [
  { title: "Faith at the centre of the day", body: "Qur'an, Arabic and Islamic Studies are timetabled lessons at every key stage, with prayer built into the school day." },
  { title: "Live lessons, small classes", body: "Real-time lessons with qualified teachers and no more than 15 pupils in a class, so every child is known." },
  { title: "Character as well as grades", body: "Our six Tarbiyyah Compass values are taught by name and recognised in every class, so akhlaq grows alongside attainment." },
];

const PILLAR_ICONS: IconName[] = ["bookOpenCheck", "users", "award", "heartHandshake"];

// Plain facts already stated on the site (never invented figures), shown as a band under the hero.
const FACTS: { icon: IconName; label: string }[] = [
  { icon: "graduationCap", label: "Year 1 to Year 11" },
  { icon: "users", label: "Classes of up to 15" },
  { icon: "monitor", label: "Live, timetabled lessons" },
  { icon: "bookOpen", label: "Qur'an, Arabic and Islamic Studies" },
  { icon: "globe", label: "Wherever home is" },
];

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);


export default async function HomePage() {
  const [testimonials, faqs, settings, content, keyStages] = await Promise.all([getTestimonials(), getFaqEntries(), getSiteSettings(), getHomepageContent(), getKeyStages()]);
  const pillars = content.pillars?.length ? content.pillars : defaultPillars;
  // The homepage summary uses the SAME steps as the Admissions page
  // (admissionsProcessSteps), so the two can never disagree. It previously
  // fell back to a separate four-step list under a "six steps" heading.
  const processSteps = admissionsProcessSteps({ applicationFee: settings.applicationFee });
  const stepCount = numberWord(processSteps.length);
  // A CMS heading is only used if it doesn't state a different number of steps.
  const cmsHeading = content.howItWorksHeading;
  const cmsHeadingCountOk = !cmsHeading || !NUMBER_WORDS.some((w) => w !== stepCount && new RegExp(`\\b${w}\\s+steps\\b`, "i").test(cmsHeading));
  const howItWorksHeading = cmsHeading && cmsHeadingCountOk ? cmsHeading : `${capitalise(stepCount)} steps to a place at TGA.`;
  const realTestimonials = testimonials.filter((t) => !t.isPlaceholder);

  return (
    <>
      {/* HERO */}
      <section className="geo-texture relative overflow-hidden bg-cream">
        {/* Large, very faint brand star behind the hero (decorative). */}
        <StarMark className="hero-star pointer-events-none absolute -right-24 -top-24 h-[34rem] w-[34rem] text-gold-300/40 sm:-right-16" />
        <span aria-hidden="true" className="pointer-events-none absolute -left-40 bottom-0 h-80 w-80 rounded-full bg-gold-100/70 blur-3xl" />
        <Container className="relative grid gap-12 py-14 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-16 lg:py-20">
          <div>
            <Kicker>{content.heroKicker || "An online school for homeschooling families"}</Kicker>
            {content.heroHeading ? (
              <h1 className="text-display font-serif font-semibold text-ink">{content.heroHeading}</h1>
            ) : (
              <h1 className="text-display font-serif font-semibold text-ink">
                A specialist, quality education, <span className="accent-swash text-gold-700">wherever home is.</span>
              </h1>
            )}
            {content.heroBody ? (
              <p className="mt-6 max-w-xl text-lg text-ink/75">{content.heroBody}</p>
            ) : (
              <p className="mt-6 max-w-xl text-lg text-ink/75">
                A full online school for homeschooling families. Live, timetabled lessons with qualified teachers: Qur&apos;an, Arabic and Islamic Studies alongside the full national curriculum, taught with{" "}
                <em>tarbiyyah</em> (the nurturing of character and faith) at its heart. Year 1 to Year 11, live
                lessons launching January 2027.
              </p>
            )}
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href={settings.ctaPrimaryHref || "/admissions"}>{settings.ctaPrimaryLabel || "Apply now"}</Button>
              <Button href="/book-a-call#book" variant="secondary">Book a free call</Button>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink/70" aria-label="At a glance">
              {["Part of the Tarbiyyah Education Trust", "Classes of up to 15", "Year 1 to Year 11"].map((fact) => (
                <li key={fact} className="flex items-center gap-2 whitespace-nowrap">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gold-500" />
                  {fact}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-ink/70">
              Not sure yet?{" "}
              <Link href="/eligibility" className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900">
                Check if it&apos;s right for us
              </Link>
            </p>
          </div>

          {/* Key dates, instead of a stock photo: the thing a family deciding
              now actually needs to know. Same list as the admissions page. */}
          <aside aria-labelledby="key-dates-heading" className="relative mx-auto w-full max-w-md lg:mr-0">
            <div className="foil-top relative rounded-3xl border border-gold-light/70 bg-white p-6 shadow-warm sm:p-8">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">
                <StarMark className="h-3.5 w-3.5" />
                <h2 id="key-dates-heading">Key dates</h2>
              </div>
              <p className="mt-1 text-sm text-ink/65">For the founding cohort. All times UK.</p>
              <ol className="mt-5 divide-y divide-gold-light/50">
                {KEY_DATES.map((d) => (
                  <li key={`${d.label}-${d.when}`} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="text-sm text-ink/70">{d.label}</span>
                    <span className="text-right text-sm font-semibold text-ink">{d.when}</span>
                  </li>
                ))}
              </ol>
              <Link href="/open-evening" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-gold-700 hover:text-gold-900">
                Book an open evening <Icon name="arrowRight" size="sm" className="h-4 w-4" />
              </Link>
            </div>
          </aside>
        </Container>
      </section>

      {/* FACTS BAND */}
      <section aria-label="At a glance" className="border-y border-gold-light/50 bg-gold-50">
        <Container>
          <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-5 text-sm font-semibold text-ink/80">
            {FACTS.map((f) => (
              <li key={f.label} className="flex items-center gap-2">
                <Icon name={f.icon} size="sm" className="h-4 w-4 text-gold-700" />
                {f.label}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* THREE PILLARS, on ink, so the page has rhythm between light and dark. */}
      <section className="geo-texture-dark relative overflow-hidden bg-ink-900 section-pad text-cream">
        <Container>
          <Kicker tone="light">Why Tarbiyyah Global Academy</Kicker>
          <h2 className="reveal text-h2 max-w-2xl font-serif font-semibold text-white">A real school day, built around faith and character.</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {pillars.map((p, i) => (
              <div key={p.title} className="reveal group relative rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition-colors hover:border-gold-300/50 hover:bg-white/[0.07]">
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-gold-300/40 bg-gold-300/10 text-gold-300">
                    <Icon name={PILLAR_ICONS[i % PILLAR_ICONS.length]} />
                  </span>
                  <span aria-hidden="true" className="font-serif text-3xl font-semibold text-white/15 transition-colors group-hover:text-gold-300/40">0{i + 1}</span>
                </div>
                <h3 className="mt-5 font-serif text-lg font-semibold text-white">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/80">{p.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* STAGES OF SCHOOL */}
      <section className="section-pad">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <Kicker>Curriculum</Kicker>
            <h2 className="text-h2 font-serif font-semibold text-ink">{content.stagesHeading || "A specialist curriculum, from Year 1 to GCSE."}</h2>
            <p className="mt-4 text-ink/75">
              {content.stagesBody ||
                "The full national curriculum, sequenced from Year 1 to GCSE, with the length and number of live lessons matched to your child's age."}
            </p>
            <Button href="/curriculum" variant="secondary" className="mt-6">
              Explore the curriculum
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {keyStages.map((ks) => (
              <Link key={ks.slug} href={`/curriculum/${ks.slug}`} className="card-lift reveal group relative rounded-2xl border border-gold-light/50 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">{ks.title}</p>
                <p className="mt-1 font-serif text-lg font-semibold text-gold-700">{ks.range}</p>
                <p className="mt-1.5 text-sm text-ink/70">{lessonsAWeek(ks)}</p>
                <Icon name="arrowRight" size="sm" className="absolute right-5 top-5 h-4 w-4 text-gold-500 transition-transform group-hover:translate-x-1" />
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* PARENT PORTAL, the website and the portal as one school. */}
      <PortalPreview />

      {/* HOW TO JOIN, the same steps as the Admissions page, as a process graphic. */}
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Admissions</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">{howItWorksHeading}</h2>
          <p className="mt-3 max-w-2xl text-ink/75">From the online form to your child&apos;s first lesson, you always know what happens next and whose turn it is.</p>
          <AdmissionsProcessFlow steps={processSteps} />
          {/* Fees sit with admissions (one block, one pair of buttons) rather than as a separate band. */}
          <div className="foil-top reveal relative mt-10 flex flex-col gap-5 overflow-hidden rounded-2xl border border-gold-light/60 bg-white p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <h3 className="font-serif text-xl font-semibold text-ink">{content.feeTeaserHeading || "Transparent fees, no surprises."}</h3>
              <p className="mt-2 text-ink/75">{content.feeTeaserBody || 'Every fee is published on our website, nothing shared only "on enquiry." Annual, two-payment and monthly plans are available for every year group.'}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Button href="/fees" variant="secondary">See the fees</Button>
            </div>
          </div>
        </Container>
      </section>

      {/* TESTIMONIALS, only once real ones exist. */}
      {realTestimonials.length > 0 && (
        <section className="section-pad">
          <Container>
            <Kicker>Families &amp; students</Kicker>
            <h2 className="text-h2 font-serif font-semibold text-ink">What our community says.</h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {realTestimonials.slice(0, 2).map((t) => (
                <blockquote key={t._id} className="rounded-2xl border border-gold-light/50 bg-white p-6">
                  <p className="text-ink/80">&ldquo;{t.quote}&rdquo;</p>
                  <footer className="mt-4 text-sm font-semibold text-gold-700">{t.attribution}</footer>
                </blockquote>
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* FAQ PREVIEW */}
      <section className="section-pad">
        <Container className="grid gap-8 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <div>
            <Kicker>FAQs</Kicker>
            <h2 className="text-h2 font-serif font-semibold text-ink">Common questions, answered.</h2>
            <p className="mt-3 text-ink/75">Fees, the school day, Islamic Studies, equipment and support.</p>
            <Button href="/faqs" variant="secondary" className="mt-6">
              See all FAQs
            </Button>
          </div>
          <FaqPreview entries={faqs.slice(0, 4)} />
        </Container>
      </section>

      {/* HEADTEACHER WELCOME, only renders once a genuine quote has been
          entered in Site settings; never a drafted-for-them stand-in. */}
      {settings.headteacherWelcomeQuote && (
        <section className="geo-texture bg-ink-900 section-pad text-cream">
          <Container className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:items-center">
            <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full border-2 border-gold-300 bg-white/10 text-4xl font-serif font-semibold">
              {settings.headteacherName?.split(" ").map((n) => n[0]).join("").slice(0, 2) || ""}
            </div>
            <div>
              <Kicker tone="light">A welcome from our Headteacher</Kicker>
              <p className="font-serif text-2xl leading-relaxed text-white">&ldquo;{settings.headteacherWelcomeQuote}&rdquo;</p>
              {settings.headteacherName && <p className="mt-4 font-semibold text-gold-300">{settings.headteacherName}, Headteacher</p>}
            </div>
          </Container>
        </section>
      )}

      <CtaBand
        heading="Be among the first families to join."
        body="Applications for the founding cohort, starting in January 2027, are open now."
      />
    </>
  );
}
