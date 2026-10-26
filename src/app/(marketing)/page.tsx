import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { Button } from "@/components/Button";
import { CtaBand } from "@/components/CtaBand";
import { FaqPreview } from "@/components/FaqPreview";
import { getFaqEntries, getHomepageContent, getSiteSettings, getTestimonials } from "@/lib/content";
import { admissionsProcessSteps } from "@/components/admissions/applicationShared";
import { PlacesRemaining } from "@/components/admissions/PlacesRemaining";
import { PortalPreview } from "@/components/home/PortalPreview";
import { RecipeValues } from "@/components/home/RecipeValues";
import { PrelaunchHome } from "@/components/prelaunch/PrelaunchHome";
import { PRELAUNCH } from "@/lib/prelaunch";

export const metadata: Metadata = pageMetadata({
  title: "A specialist, quality education, rooted in faith",
  description: "An online school by Tarbiyyah Education Trust, delivering a specialist, quality education wherever home is. Live, timetabled lessons with qualified teachers — Qur'an, Arabic and Islamic Studies alongside the full national curriculum, from Year 1 to Year 11, taught with tarbiyyah at its heart.",
  path: "",
});

const defaultPillars = [
  { title: "Specialist curriculum", body: "Qur'an, Arabic and Islamic Studies every week, with the full national curriculum to GCSE, taught live by qualified teachers." },
  { title: "Tarbiyyah & Islamic Studies", body: "Qur'an, Arabic and Islamic Studies on the timetable at every key stage — not an add-on." },
  { title: "Live, small classes", body: "Real-time lessons with no more than 15 pupils in a class, so every child is known and supported." },
];

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Live lessons a week and their length, from the Curriculum Policy (12).
const stages = [
  { stage: "Year 1 – Year 2", href: "/curriculum/year-1-2", week: "15 lessons of 30 min a week" },
  { stage: "Year 3 – Year 6", href: "/curriculum/year-3-6", week: "20 live lessons a week, 45 minutes each" },
  { stage: "Year 7 – Year 9", href: "/curriculum/year-7-9", week: "23 live lessons a week, 50 minutes each" },
  { stage: "Year 10 – Year 11 (International GCSE)", href: "/curriculum/year-10-11", week: "23 live lessons a week, leading to International GCSEs" },
];

export default async function HomePage() {
  if (PRELAUNCH) return <PrelaunchHome />;
  const [testimonials, faqs, settings, content] = await Promise.all([getTestimonials(), getFaqEntries(), getSiteSettings(), getHomepageContent()]);
  const pillars = content.pillars?.length ? content.pillars : defaultPillars;
  // The homepage summary uses the SAME steps as the Admissions page
  // (admissionsProcessSteps), so the two can never disagree. It previously
  // fell back to a separate four-step list under a "six steps" heading.
  const howItWorks = admissionsProcessSteps({ applicationFee: settings.applicationFee, registrationFee: settings.registrationFee }).map(
    (s, i) => ({ step: String(i + 1), title: s.title, body: s.short }),
  );
  const stepCount = numberWord(howItWorks.length);
  // A CMS heading is only used if it doesn't state a different number of steps.
  const cmsHeading = content.howItWorksHeading;
  const cmsHeadingCountOk = !cmsHeading || !NUMBER_WORDS.some((w) => w !== stepCount && new RegExp(`\\b${w}\\s+steps\\b`, "i").test(cmsHeading));
  const howItWorksHeading = cmsHeading && cmsHeadingCountOk ? cmsHeading : `${capitalise(stepCount)} steps to a place at TGA.`;
  const realTestimonials = testimonials.filter((t) => !t.isPlaceholder);

  return (
    <>
      {/* HERO */}
      <section className="geo-texture relative overflow-hidden bg-cream">
        <Container className="grid gap-12 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
          <div>
            <Kicker>{content.heroKicker || "An online school by Tarbiyyah Education Trust"}</Kicker>
            {content.heroHeading ? (
              <h1 className="text-display font-serif font-semibold text-ink">{content.heroHeading}</h1>
            ) : (
              <h1 className="text-display font-serif font-semibold text-ink">
                A specialist, quality education — <span className="text-gold-700">wherever home is.</span>
              </h1>
            )}
            {content.heroBody ? (
              <p className="mt-6 max-w-xl text-lg text-ink/75">{content.heroBody}</p>
            ) : (
              <p className="mt-6 max-w-xl text-lg text-ink/75">
                Live, timetabled lessons with qualified teachers — Qur&apos;an, Arabic and Islamic Studies alongside the full national curriculum, taught with{" "}
                <em>tarbiyyah</em> — the nurturing of character and faith — at its heart. Year 1 to Year 11, live
                lessons launching January 2027.
              </p>
            )}
            <div className="mt-8 flex flex-wrap gap-4">
              <Button href={settings.ctaPrimaryHref || "/admissions"}>{settings.ctaPrimaryLabel || "Apply Now"}</Button>
              <Button href="/book-a-call" variant="secondary">Book a free call</Button>
            </div>
            <p className="mt-6 text-sm font-medium text-ink/70">
              Part of the Tarbiyyah Education Trust · 10+ years · Classes of up to 15 · Year 1–Year 11
            </p>
            <p className="mt-3 text-sm text-ink/70">
              Not sure yet?{" "}
              <Link href="/eligibility" className="font-semibold text-gold-700 underline">
                Take our 2-minute fit quiz
              </Link>
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-sm">
            <div className="relative aspect-[3/4] overflow-hidden rounded-3xl border-2 border-gold-300 shadow-warm">
              <Image src="/hero.webp" alt="An open notebook and pen on a warm wooden desk — calm, focused learning" fill className="object-cover" priority sizes="(min-width: 1024px) 24rem, 80vw" />
            </div>
            <div className="shadow-warm absolute -bottom-4 -left-4 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-gold-700">
              Live lessons from Jan 2027
            </div>
          </div>
        </Container>
      </section>

      {/* THREE PILLARS */}
      <section className="section-pad">
        <Container>
          <Kicker>Why Tarbiyyah Global Academy</Kicker>
          <div className="grid gap-6 sm:grid-cols-3">
          {pillars.map((p) => (
            <div key={p.title} className="rounded-2xl border border-gold-light/50 bg-white p-6">
              <h2 className="font-serif text-lg font-semibold text-ink">{p.title}</h2>
              <p className="mt-2 text-sm text-ink/70">{p.body}</p>
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
                "The deen at the heart of the day — Qur'an, Islamic Studies and Arabic on the timetable at every key stage — with the full national curriculum to GCSE, taught live by qualified teachers."}
            </p>
            <Button href="/learning" variant="secondary" className="mt-6">
              Explore learning
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {stages.map((st) => (
              <Link key={st.href} href={st.href} className="rounded-2xl border border-gold-light/50 bg-white p-5 shadow-sm transition hover:border-gold-500 hover:shadow-md">
                <p className="font-serif text-lg font-semibold text-gold-700">{st.stage}</p>
                <p className="mt-1.5 text-sm text-ink/70">{st.week}</p>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* PARENT PORTAL — the website and the portal as one school. */}
      <PortalPreview />

      {/* RECIPE — our character framework (policy 23). */}
      <RecipeValues />

      {/* FEES AND JOINING — one band, with the detail on its own pages. */}
      <section className="geo-texture bg-cream section-pad">
        <Container className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-gold-light/60 bg-white p-6">
            <h2 className="font-serif text-2xl font-semibold text-ink">{content.feeTeaserHeading || "Transparent fees, no surprises."}</h2>
            <p className="mt-2 text-ink/75">{content.feeTeaserBody || 'Every fee is published on our website — nothing shared only "on enquiry." Annual, two-payment and monthly plans are available for every year group.'}</p>
            <Button href="/fees" variant="secondary" className="mt-5">
              See fees and payment plans
            </Button>
          </div>
          <div className="rounded-2xl border border-gold-light/60 bg-white p-6">
            <h2 className="font-serif text-2xl font-semibold text-ink">{howItWorksHeading}</h2>
            <p className="mt-2 text-ink/75">
              {howItWorks.map((st) => st.title).join(" → ")}. Places are offered for live lessons from January 2027.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button href="/admissions">How to apply</Button>
              <Button href="/book-a-call" variant="secondary">
                Book a free call
              </Button>
            </div>
          </div>
        </Container>
      </section>

      {/* TESTIMONIALS — only once real ones exist. */}
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
        <Container className="max-w-2xl">
          <Kicker>FAQs</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">Common questions, answered.</h2>
          <div className="mt-8">
            <FaqPreview entries={faqs.slice(0, 4)} />
          </div>
          <Button href="/faqs" variant="secondary" className="mt-8">
            See all FAQs
          </Button>
        </Container>
      </section>

      {/* HEADTEACHER WELCOME — only renders once a genuine quote has been
          entered in Site settings; never a drafted-for-them stand-in. */}
      {settings.headteacherWelcomeQuote && (
        <section className="geo-texture bg-ink-900 section-pad text-cream">
          <Container className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:items-center">
            <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full border-2 border-gold-300 bg-white/10 text-4xl font-serif font-semibold">
              {settings.headteacherName?.split(" ").map((n) => n[0]).join("").slice(0, 2) || ""}
            </div>
            <div>
              <Kicker>A welcome from our Headteacher</Kicker>
              <p className="font-serif text-2xl leading-relaxed text-white">&ldquo;{settings.headteacherWelcomeQuote}&rdquo;</p>
              {settings.headteacherName && <p className="mt-4 font-semibold text-gold-300">{settings.headteacherName}, Headteacher</p>}
            </div>
          </Container>
        </section>
      )}

      {/* Founding cohort places — renders nothing until an admin has set a
          real capacity for at least one year group (see PlacesRemaining). */}
      <Container>
        <PlacesRemaining />
      </Container>

      <CtaBand
        heading="Be among the first families to join."
        body="Tell us a little about your child and we'll be in touch as places open for January 2027. No obligation."
      />
    </>
  );
}
