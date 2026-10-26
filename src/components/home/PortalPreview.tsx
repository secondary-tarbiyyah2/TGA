import Link from "next/link";
import { Container } from "@/components/Container";
import { portalCta } from "@/lib/nav";

/**
 * "Your window into school": what a parent actually gets in the portal, drawn
 * in the portal's own style (white cards, teal actions) so the website and
 * the portal feel like one school. The dashboard is an illustration — no
 * real pupil's data — and is labelled as such.
 */
const FEATURES = [
  { title: "Today's lessons", body: "The day's live lessons (UK time), with one tap to join on Microsoft Teams." },
  { title: "Registers & attendance", body: "Every lesson's register, so you know straight away if your child was missed." },
  { title: "Homework & grades", body: "What's due, what's been marked, and the feedback that came with it." },
  { title: "Qur'an progress", body: "Hifdh and recitation targets tracked alongside every other subject." },
  { title: "Weekly Tarbiyah Note", body: "A personal note on character and akhlaq from the form tutor." },
  { title: "Message teachers", body: "Talk to your child's teachers directly, on safeguarded, logged channels." },
  { title: "Sign forms online", body: "Consents and policies signed with your own hand signature — no printing." },
  { title: "Fees & reports", body: "Invoices, payment plans and termly reports in one place." },
];

export function PortalPreview() {
  return (
    <section className="section-pad bg-teal-900 text-cream" aria-labelledby="portal-heading">
      <Container className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">
            <span className="h-px w-8 bg-gold-300" aria-hidden="true" />
            The parent portal
          </div>
          <h2 id="portal-heading" className="text-h2 font-serif font-semibold text-white">
            You stay close to school — without doing the teaching.
          </h2>
          <p className="mt-4 text-cream/80">
            Every family gets its own login to the same portal our teachers use, so you see what they see: lessons, registers,
            marking and the weekly note on your child&apos;s character.
          </p>
          <ul className="mt-8 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold-300" />
                <span>
                  <span className="block font-semibold text-white">{f.title}</span>
                  <span className="text-sm text-cream/75">{f.body}</span>
                </span>
              </li>
            ))}
          </ul>
          <Link href={portalCta.href} className="mt-8 inline-flex items-center gap-2 rounded-full border border-cream/40 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10">
            Already a family? Log in →
          </Link>
        </div>

        {/* Drawn to match the real family dashboard (src/app/learn/family/dashboard):
            ink welcome banner with the date and a chip, the Action centre, "Up next"
            with Join, then the child card with homework, grades, Qur'an and the note. */}
        <figure className="mx-auto w-full max-w-md">
          <div className="rounded-3xl bg-cream p-3 text-ink shadow-2xl ring-1 ring-white/10 sm:p-4">
            <div className="rounded-2xl bg-ink-900 px-5 py-4 text-white">
              <p className="text-xs font-medium tracking-wide text-gold-300">Tuesday 5 January</p>
              <p className="mt-0.5 text-lg font-semibold tracking-tight">Good morning, Umm Yusuf</p>
              <p className="text-xs text-white/80">Your children&apos;s school life in one place</p>
              <div className="mt-3 inline-flex min-w-[8rem] flex-col-reverse rounded-xl bg-white/10 px-3 py-2 ring-1 ring-inset ring-gold-500/40">
                <span className="text-[11px] font-medium text-white/85">Children</span>
                <span className="text-xl font-semibold tabular-nums leading-tight">1</span>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-gold-light bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Action centre</p>
                <span className="text-xs font-medium text-gold-700">Open Action centre</span>
              </div>
              <ul className="mt-2 space-y-1.5 text-xs">
                <li className="flex items-center justify-between rounded-lg bg-cream px-3 py-2"><span>Sign: Photo consent 2026–27</span><span className="rounded-full bg-gold-100 px-2 py-0.5 font-semibold text-gold-900">Today</span></li>
                <li className="flex items-center justify-between rounded-lg bg-cream px-3 py-2"><span>Science homework due</span><span className="text-ink/60">Thu</span></li>
              </ul>
            </div>

            <div className="mt-3 rounded-2xl border border-gold-light bg-white">
              <p className="px-4 pt-3 text-sm font-semibold">Up next for Yusuf</p>
              <div className="flex items-center justify-between gap-3 px-4 pb-4 pt-2">
                <div>
                  <p className="text-xs text-ink/65">10:15 – 11:00 · Mathematics</p>
                  <p className="text-sm font-medium">Fractions of amounts</p>
                </div>
                <span className="rounded-lg bg-gold-700 px-3 py-1.5 text-xs font-semibold text-white">Join</span>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-gold-light bg-white p-4">
              <p className="text-base font-semibold">Yusuf Khan <span className="ml-1 text-xs font-normal text-ink/65">Year 5</span></p>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs font-semibold">Homework and grades</p>
                <span className="text-xs font-medium text-gold-700">See everything to do</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="font-medium">Due this week</p>
                  <p className="mt-1 text-ink/70">Maths · fractions worksheet · Thu</p>
                  <p className="text-ink/70">English · reading log · Fri</p>
                </div>
                <div>
                  <p className="font-medium">Latest grades</p>
                  <p className="mt-1 text-ink/70">Science quiz · <span className="font-semibold text-ink">8/10</span></p>
                  <p className="text-ink/70">Arabic vocabulary · <span className="font-semibold text-ink">Secure</span></p>
                </div>
              </div>
              <div className="mt-3">
                <p className="text-xs font-medium">Qur&apos;an &amp; Islamic Studies</p>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 rounded-lg bg-cream p-2 text-xs">
                  <span><span className="font-serif text-base font-semibold">8.2</span> <span className="text-ink/65">/10 average</span></span>
                  <span className="text-ink/65">4 recitations this term</span>
                  <span className="font-medium text-teal-700">Improving</span>
                </div>
                <ul className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  <li className="rounded-full bg-green-100 px-2 py-0.5 text-green-800">Surah al-Mulk secure</li>
                  <li className="rounded-full border border-dashed border-gold-light px-2 py-0.5 text-ink/65">Next: Surah al-Qalam</li>
                </ul>
              </div>
              <div className="mt-3">
                <p className="text-xs font-medium">Weekly Tarbiyah Note</p>
                <p className="mt-1.5 rounded-lg border border-gold-light/40 p-3 text-xs text-ink/80">&ldquo;Yusuf showed real <em>sabr</em> (<span lang="ar" dir="rtl">صَبْر</span>) this week, sticking with a hard problem until he solved it.&rdquo; <span className="text-ink/55">— Ustadh Bilal, form tutor</span></p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-lg bg-gold-700 px-3 py-1.5 text-white">Report an absence</span>
              <span className="rounded-lg border border-gold-500 px-3 py-1.5 text-gold-700">Message a teacher</span>
            </div>
          </div>
          <figcaption className="mt-3 text-center text-xs text-cream/70">The family dashboard as it appears in the portal — an illustration, not a real pupil.</figcaption>
        </figure>
      </Container>
    </section>
  );
}
