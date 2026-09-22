import Image from "next/image";
import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker, PlaceholderNote } from "@/components/Section";
import { Button } from "@/components/Button";
import { CtaBand } from "@/components/CtaBand";
import { getDifferentiators, getFeeBands, getTestimonials } from "@/lib/content";

export const metadata: Metadata = {
  title: "A British education, rooted in faith",
  description:
    "An online school by Tarbiyyah Education Trust. Live, timetabled lessons with qualified UK teachers — the full British curriculum, from Reception to Year 11, taught with tarbiyyah at its heart.",
};

export default async function HomePage() {
  const [differentiators, feeBands, testimonials] = await Promise.all([
    getDifferentiators(),
    getFeeBands(),
    getTestimonials(),
  ]);

  return (
    <>
      {/* HERO */}
      <section className="geo-texture relative overflow-hidden bg-cream">
        <Container className="grid gap-12 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
          <div>
            <Kicker>An online school by Tarbiyyah Education Trust</Kicker>
            <h1 className="font-serif text-4xl font-semibold leading-tight text-ink sm:text-5xl">
              A British education, rooted in faith — <span className="text-maroon">wherever home is.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink/75">
              Live, timetabled lessons with qualified UK teachers. The full British curriculum, taught with{" "}
              <em>tarbiyyah</em> — the nurturing of character and faith — at its heart. Reception to Year 11, live
              lessons launching January 2027.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button href="/admissions">Apply Now</Button>
              <Button href="/about" variant="ghost">Part of the Tarbiyyah family →</Button>
            </div>
            <p className="mt-6 text-sm font-medium text-maroon">Under the Tarbiyyah Education Trust — 10+ years operating.</p>
          </div>
          <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-3xl border border-gold-light/50 shadow-xl">
            <Image src="/hero.jpg" alt="An open notebook and pen on a warm wooden desk — calm, focused learning" fill className="object-cover" priority sizes="(min-width: 1024px) 24rem, 80vw" />
          </div>
        </Container>
      </section>

      {/* TRUST STRIP */}
      <section className="border-y border-gold-light/40 bg-white py-8">
        <Container className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-center text-sm font-semibold uppercase tracking-wide text-ink/60">
          <span>Part of the Tarbiyyah family</span>
          <span aria-hidden="true">•</span>
          <span>10+ years operating (Primary &amp; Secondary)</span>
          <span aria-hidden="true">•</span>
          <span>Led by Headteacher Hardeep Sandhar</span>
          <span aria-hidden="true">•</span>
          <span>Live lessons launch January 2027</span>
        </Container>
      </section>

      {/* CURRICULUM TEASER */}
      <section className="py-20">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <Kicker>The curriculum</Kicker>
            <h2 className="font-serif text-3xl font-semibold text-ink">The full British curriculum, plus Islamic Studies.</h2>
            <p className="mt-4 text-ink/75">
              Live-timetabled academic subjects from Reception through GCSE, taught by qualified UK teachers — with
              Qur&apos;an, Islamic Studies and Arabic woven through every key stage, not bolted on.
            </p>
            <Button href="/curriculum" variant="ghost" className="mt-6">Explore the curriculum</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { stage: "Reception – Year 2", href: "/curriculum/reception-year-2" },
              { stage: "Year 3 – Year 6", href: "/curriculum/year-3-6" },
              { stage: "Year 7 – Year 9", href: "/curriculum/year-7-9" },
              { stage: "Year 10 – Year 11 (GCSE)", href: "/curriculum/year-10-11" },
            ].map((s) => (
              <a key={s.href} href={s.href} className="rounded-2xl border border-gold-light/50 bg-white p-6 shadow-sm transition hover:border-maroon hover:shadow-md">
                <p className="font-serif text-lg font-semibold text-maroon">{s.stage}</p>
                <p className="mt-2 text-sm text-ink/70">View timetable, subjects and sample week →</p>
              </a>
            ))}
          </div>
        </Container>
      </section>

      {/* DIFFERENTIATORS */}
      <section className="geo-texture bg-cream py-20">
        <Container>
          <Kicker>What makes us different</Kicker>
          <h2 className="font-serif text-3xl font-semibold text-ink">Distinctive, not just online.</h2>
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

      {/* TESTIMONIALS TEASER */}
      <section className="py-20">
        <Container>
          <Kicker>Families &amp; students</Kicker>
          <h2 className="font-serif text-3xl font-semibold text-ink">What our community says.</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {testimonials.slice(0, 2).map((t) => (
              <blockquote key={t._id} className="rounded-2xl border border-gold-light/50 bg-white p-6">
                <p className="text-ink/80">&ldquo;{t.quote}&rdquo;</p>
                <footer className="mt-4 text-sm font-semibold text-maroon">{t.attribution}</footer>
                {t.isPlaceholder && <PlaceholderNote>Placeholder — real testimonials to follow</PlaceholderNote>}
              </blockquote>
            ))}
          </div>
          <Button href="/testimonials" variant="ghost" className="mt-8">Read more testimonials</Button>
        </Container>
      </section>

      {/* FEE TRANSPARENCY TEASER */}
      <section className="bg-white py-20">
        <Container className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <Kicker>Fees</Kicker>
            <h2 className="font-serif text-3xl font-semibold text-ink">Transparent fees, no surprises.</h2>
            <p className="mt-4 text-ink/75">
              Every fee is published on our website — nothing shared only &quot;on enquiry.&quot; Annual, termly and
              monthly plans are available for every year group.
            </p>
            <Button href="/fees" variant="ghost" className="mt-6">See the full fee table</Button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-gold-light/50">
            <table className="w-full text-left text-sm">
              <thead className="bg-cream text-ink/70">
                <tr>
                  <th className="px-4 py-3 font-semibold">Year group</th>
                  <th className="px-4 py-3 font-semibold">Annual</th>
                </tr>
              </thead>
              <tbody>
                {feeBands.map((f) => (
                  <tr key={f._id} className="border-t border-gold-light/40">
                    <td className="px-4 py-3">{f.yearGroupRange}</td>
                    <td className="px-4 py-3 font-semibold text-maroon">£{f.annualFee.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </section>

      {/* HEADTEACHER WELCOME */}
      <section className="geo-texture bg-ink py-20 text-white">
        <Container className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:items-center">
          <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full border-2 border-gold bg-white/10 text-4xl font-serif font-semibold">
            HS
          </div>
          <div>
            <Kicker>A welcome from our Headteacher</Kicker>
            <p className="font-serif text-2xl leading-relaxed">
              &ldquo;Every child deserves an education that nurtures their mind and their faith together. At Tarbiyyah
              Global Academy we bring the standards of the Tarbiyyah family of schools to families anywhere in the
              world.&rdquo;
            </p>
            <p className="mt-4 font-semibold text-gold-light">Hardeep Sandhar, Headteacher</p>
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
