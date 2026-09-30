import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { Button } from "@/components/Button";
import { CtaBand } from "@/components/CtaBand";
import { FaqPreview } from "@/components/FaqPreview";
import { TimezoneConverter } from "@/components/TimezoneConverter";
import { ComparisonTable } from "@/components/ComparisonTable";
import { getDifferentiators, getFaqEntries, getFeeBands, getHomepageContent, getSiteSettings, getStaffMembers, getTestimonials } from "@/lib/content";
import { formatGBP } from "@/lib/format";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Reads public.bursary_seats_public (migration 0020) — only returns a row
 * once an admin has actually set a seat count, same "hide until real"
 * pattern as public.year_group_places. Used to substitute the real number
 * into the "Transparent bursary seats" differentiator (d9) below; that
 * differentiator is only shown once this resolves to a real count, never
 * on its generic CMS summary alone.
 */
async function getBursarySeats(): Promise<number | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.from("bursary_seats_public").select("bursary_seats").maybeSingle();
  return (data as { bursary_seats: number | null } | null)?.bursary_seats ?? null;
}

export const metadata: Metadata = {
  title: "A specialist, quality education, rooted in faith",
  description:
    "An online school by Tarbiyyah Education Trust, delivering a specialist, quality education wherever home is. Live, timetabled lessons with qualified UK teachers on the full British curriculum, from Reception to Year 11, taught with tarbiyyah at its heart.",
};

const defaultPillars = [
  { title: "Specialist curriculum", body: "The full British national curriculum, live-timetabled, taught to GCSE by qualified UK teachers." },
  { title: "Tarbiyyah & Islamic Studies", body: "Qur'an, Arabic and Islamic Studies on the timetable at every key stage — not an add-on." },
  { title: "Live, small classes", body: "Real-time lessons with real teachers, sized to keep every child known and supported." },
];

const defaultHowItWorks = [
  { title: "Apply", body: "A short multi-step application — no obligation." },
  { title: "Entry assessment", body: "A friendly, age-appropriate check so we know how to support your child." },
  { title: "Offer", body: "A place offered, confirmed with a one-time registration fee." },
  { title: "Welcome", body: "Onboarding ahead of live lessons launching January 2027." },
];

const stages = [
  { stage: "Reception – Year 2", href: "/curriculum/reception-year-2" },
  { stage: "Year 3 – Year 6", href: "/curriculum/year-3-6" },
  { stage: "Year 7 – Year 9", href: "/curriculum/year-7-9" },
  { stage: "Year 10 – Year 11 (GCSE)", href: "/curriculum/year-10-11" },
];

export default async function HomePage() {
  const [differentiators, feeBands, testimonials, staff, faqs, settings, content, bursarySeats] = await Promise.all([
    getDifferentiators(),
    getFeeBands(),
    getTestimonials(),
    getStaffMembers(),
    getFaqEntries(),
    getSiteSettings(),
    getHomepageContent(),
    getBursarySeats(),
  ]);
  const pillars = content.pillars?.length ? content.pillars : defaultPillars;
  const howItWorks = content.howItWorksSteps?.length
    ? content.howItWorksSteps.map((s, i) => ({ step: String(i + 1), ...s }))
    : defaultHowItWorks.map((s, i) => ({ step: String(i + 1), ...s }));
  // Never show fabricated/unconfirmed content publicly — see ground rule 3
  // and 4. A differentiator, testimonial or team member only appears once
  // an admin has confirmed it; the homepage headteacher quote only appears
  // if a real one has been entered in Site settings.
  // d9 ("Transparent bursary seats") additionally requires a real, live
  // seat count from Supabase — its CMS "Confirmed commitment" status alone
  // is not enough, so it never shows a placeholder claim if that value
  // hasn't been set yet (see getBursarySeats above).
  const confirmedDifferentiators = differentiators
    .filter((d) => d.status === "Confirmed commitment")
    .filter((d) => d._id !== "d9" || bursarySeats !== null)
    .map((d) =>
      d._id === "d9" && bursarySeats !== null
        ? { ...d, summary: `${bursarySeats} bursary/scholarship seat${bursarySeats === 1 ? "" : "s"} available this year, published openly rather than handled quietly on request.` }
        : d
    );
  const realTestimonials = testimonials.filter((t) => !t.isPlaceholder);
  const confirmedStaff = staff.filter((s) => !s.isPlaceholder);

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
                A specialist, quality education, rooted in faith — <span className="text-gold-700">wherever home is.</span>
              </h1>
            )}
            {content.heroBody ? (
              <p className="mt-6 max-w-xl text-lg text-ink/75">{content.heroBody}</p>
            ) : (
              <p className="mt-6 max-w-xl text-lg text-ink/75">
                Live, timetabled lessons with qualified UK teachers on the full British curriculum, taught with{" "}
                <em>tarbiyyah</em> — the nurturing of character and faith — at its heart. Reception to Year 11, live
                lessons launching January 2027.
              </p>
            )}
            <div className="mt-8 flex flex-wrap gap-4">
              <Button href={settings.ctaPrimaryHref || "/admissions"}>{settings.ctaPrimaryLabel || "Apply Now"}</Button>
              <Button href="/book-a-call" variant="secondary">Book an admissions call</Button>
            </div>
            <p className="mt-6 text-sm font-medium text-ink/60">
              Part of the Tarbiyyah Education Trust · 10+ years · Qualified UK teachers · Reception–Year 11
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
        <Container className="grid gap-6 sm:grid-cols-3">
          {pillars.map((p) => (
            <div key={p.title} className="rounded-2xl border border-gold-light/50 bg-white p-6">
              <h2 className="font-serif text-lg font-semibold text-ink">{p.title}</h2>
              <p className="mt-2 text-sm text-ink/70">{p.body}</p>
            </div>
          ))}
        </Container>
      </section>

      {/* TIMEZONE CONVERTER — genuinely useful, not a card, so it also
          breaks the repeated Kicker+h2+3-card rhythm every other section
          uses. See src/components/TimezoneConverter.tsx. */}
      <section className="bg-cream section-pad">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <Kicker>Live lessons, wherever home is</Kicker>
            <h2 className="text-h2 font-serif font-semibold text-ink">What time is school, for you?</h2>
            <p className="mt-4 text-ink/75">
              We teach an international, timezone-spread cohort across two daily live-lesson windows. Pick where
              you&apos;re based to see what that means in your own time.
            </p>
          </div>
          <TimezoneConverter />
        </Container>
      </section>

      {/* HOW IT WORKS */}
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>How it works</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">{content.howItWorksHeading || "Four steps to a place at TGA."}</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {howItWorks.map((s, i) => (
              <div key={s.step} className="relative">
                {i < howItWorks.length - 1 && (
                  <span aria-hidden="true" className="absolute top-6 left-[calc(100%-0.5rem)] hidden h-px w-8 bg-gold-300 lg:block" />
                )}
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-500 font-serif text-lg font-bold text-ink-900">
                  {s.step}
                </span>
                <h3 className="mt-4 font-semibold text-ink">{s.title}</h3>
                <p className="mt-1 text-sm text-ink/70">{s.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* STAGES OF SCHOOL */}
      <section className="section-pad">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <Kicker>Stages of school</Kicker>
            <h2 className="text-h2 font-serif font-semibold text-ink">
              {content.stagesHeading || "A specialist curriculum, from Reception to GCSE."}
            </h2>
            <p className="mt-4 text-ink/75">
              {content.stagesBody ||
                "The full British curriculum, live-timetabled and taught by qualified UK teachers — with Qur'an, Islamic Studies and Arabic woven through every key stage, not bolted on."}
            </p>
            <Button href="/curriculum" variant="secondary" className="mt-6">Explore the curriculum</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {stages.map((s) => (
              <a key={s.href} href={s.href} className="rounded-2xl border border-gold-light/50 bg-white p-6 shadow-sm transition hover:border-gold-500 hover:shadow-md">
                <p className="font-serif text-lg font-semibold text-gold-700">{s.stage}</p>
                <p className="mt-2 text-sm text-ink/70">View timetable, subjects and sample week →</p>
              </a>
            ))}
          </div>
        </Container>
      </section>

      {/* WHAT MAKES US DIFFERENT — was a repeated 3-card grid identical to
          five other sections on this page; a comparison table says the
          same thing more usefully (and reads differently), with the CMS's
          confirmed differentiators kept as a compact supporting list
          rather than dropped. Only confirmed commitments ever appear
          publicly — draft/concept ideas stay in the CMS until confirmed,
          per ground rule 3. */}
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>What makes us different</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">Distinctive, not just online.</h2>
          <div className="mt-10">
            <ComparisonTable />
          </div>
          {confirmedDifferentiators.length > 0 && (
            <ul className="mt-8 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {confirmedDifferentiators.map((d) => (
                <li key={d._id} className="flex items-start gap-2 text-sm text-ink/80">
                  <span aria-hidden="true" className="mt-1 text-gold-500">◆</span>
                  <span><span className="font-semibold text-ink">{d.title}.</span> {d.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </Container>
      </section>

      {/* MEET THE TEAM PREVIEW */}
      {confirmedStaff.length > 0 && (
        <section className="section-pad">
          <Container>
            <Kicker>Meet the team</Kicker>
            <h2 className="text-h2 font-serif font-semibold text-ink">The people teaching your child.</h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {confirmedStaff.slice(0, 3).map((s) => (
                <div key={s._id} className="rounded-2xl border border-gold-light/50 bg-white p-6 text-center">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-cream font-serif text-xl font-semibold text-gold-700">
                    {s.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <h3 className="mt-3 font-serif text-base font-semibold text-ink">{s.name}</h3>
                  <p className="text-sm text-gold-700">{s.roleTitle}</p>
                </div>
              ))}
            </div>
            <Button href="/team" variant="secondary" className="mt-8">Meet the whole team</Button>
          </Container>
        </section>
      )}

      {/* TESTIMONIALS TEASER */}
      {realTestimonials.length > 0 && (
        <section className="geo-texture bg-cream section-pad">
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
            <Button href="/testimonials" variant="secondary" className="mt-8">Read more testimonials</Button>
          </Container>
        </section>
      )}

      {/* FEE TRANSPARENCY TEASER */}
      <section className="bg-white section-pad">
        <Container className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <Kicker>Fees</Kicker>
            <h2 className="text-h2 font-serif font-semibold text-ink">{content.feeTeaserHeading || "Transparent fees, no surprises."}</h2>
            <p className="mt-4 text-ink/75">
              {content.feeTeaserBody ||
                'Every fee is published on our website — nothing shared only "on enquiry." Annual, termly and monthly plans are available for every year group.'}
            </p>
            <Button href="/fees" variant="secondary" className="mt-6">See the full fee table</Button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-gold-light/50">
            <table className="w-full text-left text-sm">
              <thead className="bg-cream text-ink/70">
                <tr>
                  <th className="px-4 py-3 font-semibold">Year group</th>
                  <th className="px-4 py-3 font-semibold">Jan–Jul 2027</th>
                </tr>
              </thead>
              <tbody>
                {feeBands.map((f) => (
                  <tr key={f._id} className="border-t border-gold-light/40">
                    <td className="px-4 py-3">{f.yearGroupRange}</td>
                    <td className="px-4 py-3 font-semibold text-gold-700">{formatGBP(f.annualFee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </section>

      {/* SAFE, OPEN AND ACCOUNTABLE — every claim here already exists
          elsewhere on the site (DBS-checked staff and a named DSL are
          stated as fact on /about and /safeguarding today; the complaints
          count is settings.complaintsLastYear, already shown on
          /policies). This section only links through and summarises —
          it never introduces a new unconfirmed claim. */}
      <section className="bg-white section-pad">
        <Container className="max-w-3xl">
          <Kicker>Safeguarding &amp; transparency</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">{content.safeHeading || "Safe, open and accountable."}</h2>
          <p className="mt-4 text-ink/75">
            {content.safeBody ||
              "Every member of staff is DBS-checked, and a named Designated Safeguarding Lead is responsible for keeping children safe. We publish how to raise a concern, and how many formal complaints we received last year — nothing handled quietly, on request."}
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            <li className="rounded-2xl border border-gold-light/50 bg-cream p-5">
              <p className="font-semibold text-ink">DBS-checked staff</p>
              <p className="mt-1 text-sm text-ink/70">Every member of staff is vetted before they ever teach a child.</p>
            </li>
            {settings.safeguardingLeadName && (
              <li className="rounded-2xl border border-gold-light/50 bg-cream p-5">
                <p className="font-semibold text-ink">A named Safeguarding Lead</p>
                <p className="mt-1 text-sm text-ink/70">{settings.safeguardingLeadName} leads on keeping every child safe.</p>
              </li>
            )}
            {typeof settings.complaintsLastYear === "number" && (
              <li className="rounded-2xl border border-gold-light/50 bg-cream p-5">
                <p className="font-semibold text-ink">Complaints, published</p>
                <p className="mt-1 text-sm text-ink/70">Formal complaints last academic year: {settings.complaintsLastYear}.</p>
              </li>
            )}
          </ul>
          <div className="mt-8 flex flex-wrap gap-4">
            <Button href="/safeguarding" variant="secondary">Our safeguarding approach</Button>
            <Button href="/policies" variant="secondary">All school policies</Button>
          </div>
        </Container>
      </section>

      {/* FAQ PREVIEW */}
      <section className="geo-texture bg-cream section-pad">
        <Container className="max-w-2xl">
          <Kicker>FAQs</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">Common questions, answered.</h2>
          <div className="mt-10">
            <FaqPreview entries={faqs.slice(0, 5)} />
          </div>
          <Button href="/faqs" variant="secondary" className="mt-8">See all FAQs</Button>
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

      <CtaBand
        heading="Be among the first families to join."
        body="Tell us a little about your child and we'll be in touch as places open for January 2027. No obligation."
      />
    </>
  );
}
