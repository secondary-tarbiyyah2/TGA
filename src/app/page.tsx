import Image from "next/image";
import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker, PlaceholderNote } from "@/components/Section";
import { Button } from "@/components/Button";
import { CtaBand } from "@/components/CtaBand";
import { FaqPreview } from "@/components/FaqPreview";
import { getDifferentiators, getFaqEntries, getFeeBands, getStaffMembers, getTestimonials } from "@/lib/content";
import { formatGBP } from "@/lib/format";

export const metadata: Metadata = {
  title: "A British education, rooted in faith",
  description:
    "An online school by Tarbiyyah Education Trust. Live, timetabled lessons with qualified UK teachers — the full British curriculum, from Reception to Year 11, taught with tarbiyyah at its heart.",
};

const pillars = [
  { title: "British curriculum", body: "The full national curriculum, live-timetabled, taught to GCSE by qualified UK teachers." },
  { title: "Tarbiyyah & Islamic Studies", body: "Qur'an, Arabic and Islamic Studies on the timetable at every key stage — not an add-on." },
  { title: "Live, small classes", body: "Real-time lessons with real teachers, sized to keep every child known and supported." },
];

const howItWorks = [
  { step: "1", title: "Apply", body: "A short multi-step application — no obligation." },
  { step: "2", title: "Entry assessment", body: "A friendly, age-appropriate check so we know how to support your child." },
  { step: "3", title: "Offer", body: "A place offered, confirmed with a one-time registration fee." },
  { step: "4", title: "Welcome", body: "Onboarding ahead of live lessons launching January 2027." },
];

const stages = [
  { stage: "Reception – Year 2", href: "/curriculum/reception-year-2" },
  { stage: "Year 3 – Year 6", href: "/curriculum/year-3-6" },
  { stage: "Year 7 – Year 9", href: "/curriculum/year-7-9" },
  { stage: "Year 10 – Year 11 (GCSE)", href: "/curriculum/year-10-11" },
];

export default async function HomePage() {
  const [differentiators, feeBands, testimonials, staff, faqs] = await Promise.all([
    getDifferentiators(),
    getFeeBands(),
    getTestimonials(),
    getStaffMembers(),
    getFaqEntries(),
  ]);

  return (
    <>
      {/* HERO */}
      <section className="geo-texture relative overflow-hidden bg-cream">
        <Container className="grid gap-12 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
          <div>
            <Kicker>An online school by Tarbiyyah Education Trust</Kicker>
            <h1 className="text-display font-serif font-semibold text-ink">
              A British education, rooted in faith — <span className="text-gold-700">wherever home is.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink/75">
              Live, timetabled lessons with qualified UK teachers. The full British curriculum, taught with{" "}
              <em>tarbiyyah</em> — the nurturing of character and faith — at its heart. Reception to Year 11, live
              lessons launching January 2027.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button href="/admissions">Apply Now</Button>
              <Button href="/open-evening" variant="secondary">Book an admissions call</Button>
            </div>
            <p className="mt-6 text-sm font-medium text-ink/60">
              Part of the Tarbiyyah Education Trust · 10+ years · Qualified UK teachers · Reception–Year 11
            </p>
          </div>
          <div className="relative mx-auto w-full max-w-sm">
            <div className="relative aspect-[3/4] overflow-hidden rounded-3xl border-2 border-gold-300 shadow-warm">
              <Image src="/hero.jpg" alt="An open notebook and pen on a warm wooden desk — calm, focused learning" fill className="object-cover" priority sizes="(min-width: 1024px) 24rem, 80vw" />
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

      {/* HOW IT WORKS */}
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>How it works</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">Four steps to a place at TGA.</h2>
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
            <h2 className="text-h2 font-serif font-semibold text-ink">The full British curriculum, plus Islamic Studies.</h2>
            <p className="mt-4 text-ink/75">
              Live-timetabled academic subjects from Reception through GCSE, taught by qualified UK teachers — with
              Qur&apos;an, Islamic Studies and Arabic woven through every key stage, not bolted on.
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

      {/* DIFFERENTIATORS */}
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>What makes us different</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">Distinctive, not just online.</h2>
          <p className="mt-3 max-w-2xl text-ink/70">
            Some of the ideas below are confirmed; others are still being finalised ahead of the January 2027 launch —
            each is marked as such.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {differentiators.map((d) => (
              <div key={d._id} className="rounded-2xl bg-white p-6 shadow-sm">
                <h3 className="font-serif text-lg font-semibold text-ink">{d.title}</h3>
                <p className="mt-2 text-sm text-ink/70">{d.summary}</p>
                {d.status === "Draft / concept — not yet confirmed" && (
                  <PlaceholderNote>Draft concept — not yet confirmed</PlaceholderNote>
                )}
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* MEET THE TEAM PREVIEW */}
      <section className="section-pad">
        <Container>
          <Kicker>Meet the team</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">The people teaching your child.</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {staff.slice(0, 3).map((s) => (
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

      {/* TESTIMONIALS TEASER */}
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Families &amp; students</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">What our community says.</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {testimonials.slice(0, 2).map((t) => (
              <blockquote key={t._id} className="rounded-2xl border border-gold-light/50 bg-white p-6">
                <p className="text-ink/80">&ldquo;{t.quote}&rdquo;</p>
                <footer className="mt-4 text-sm font-semibold text-gold-700">{t.attribution}</footer>
                {t.isPlaceholder && <PlaceholderNote>Placeholder — real testimonials to follow</PlaceholderNote>}
              </blockquote>
            ))}
          </div>
          <Button href="/testimonials" variant="secondary" className="mt-8">Read more testimonials</Button>
        </Container>
      </section>

      {/* FEE TRANSPARENCY TEASER */}
      <section className="bg-white section-pad">
        <Container className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <Kicker>Fees</Kicker>
            <h2 className="text-h2 font-serif font-semibold text-ink">Transparent fees, no surprises.</h2>
            <p className="mt-4 text-ink/75">
              Every fee is published on our website — nothing shared only &quot;on enquiry.&quot; Annual, termly and
              monthly plans are available for every year group.
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

      {/* HEADTEACHER WELCOME */}
      <section className="geo-texture bg-ink-900 section-pad text-cream">
        <Container className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:items-center">
          <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full border-2 border-gold-300 bg-white/10 text-4xl font-serif font-semibold">
            HS
          </div>
          <div>
            <Kicker>A welcome from our Headteacher</Kicker>
            <p className="font-serif text-2xl leading-relaxed text-white">
              &ldquo;Every child deserves an education that nurtures their mind and their faith together. At Tarbiyyah
              Global Academy we bring the standards of the Tarbiyyah family of schools to families anywhere in the
              world.&rdquo;
            </p>
            <p className="mt-4 font-semibold text-gold-300">Hardeep Sandhar, Headteacher</p>
          </div>
        </Container>
      </section>

      <CtaBand
        heading="Be among the first families to join."
        body="Tell us a little about your child and we'll be in touch as places open for January 2027. No obligation."
      />
    </>
  );
}
