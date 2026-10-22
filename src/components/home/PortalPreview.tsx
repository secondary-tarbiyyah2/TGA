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
  { title: "Qur'an progress", body: "Hifz and recitation targets tracked alongside every other subject." },
  { title: "Weekly Tarbiyah Note", body: "A personal note on character and akhlaq from the form tutor." },
  { title: "Message teachers", body: "Talk to your child's teachers directly, on safeguarded, logged channels." },
  { title: "Sign forms online", body: "Consents and policies signed with your own hand signature — no printing." },
  { title: "Fees & reports", body: "Invoices, payment plans and termly reports in one place." },
];

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-ink/70">
        <span>{label}</span>
        <span className="tabular-nums">{value}%</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-teal-100">
        <div className="h-2 rounded-full bg-teal-500" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

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

        <figure className="mx-auto w-full max-w-md">
          <div className="rounded-3xl bg-cream p-4 text-ink shadow-2xl ring-1 ring-white/10">
            <div className="flex items-center justify-between border-b border-gold-light/60 pb-3">
              <p className="font-serif font-semibold">Assalamu alaykum, Umm Yusuf</p>
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-900">Year 5</span>
            </div>
            <div className="mt-3 rounded-2xl border border-gold-light/60 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">Up next · 10:15</p>
              <p className="mt-1 font-semibold">Mathematics — fractions of amounts</p>
              <span className="mt-3 inline-flex rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white">Join lesson</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-gold-light/60 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">This week</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-teal-700">20/20</p>
                <p className="text-xs text-ink/70">lessons attended</p>
              </div>
              <div className="rounded-2xl border border-gold-light/60 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">To sign</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-teal-700">1</p>
                <p className="text-xs text-ink/70">consent form</p>
              </div>
            </div>
            <div className="mt-3 space-y-3 rounded-2xl border border-gold-light/60 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">Qur&apos;an progress</p>
              <Bar label="Juz' 30 memorised" value={72} />
              <Bar label="Term target" value={58} />
            </div>
            <div className="mt-3 rounded-2xl border-l-4 border-gold-500 bg-gold-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gold-900">Weekly Tarbiyah Note</p>
              <p className="mt-1 text-sm text-ink/80">&ldquo;Yusuf showed real <em>sabr</em> (<span lang="ar" dir="rtl">صَبْر</span>) this week, sticking with a hard problem until he solved it…&rdquo;</p>
            </div>
          </div>
          <figcaption className="mt-3 text-center text-xs text-cream/70">Illustration of the parent dashboard — not a real pupil.</figcaption>
        </figure>
      </Container>
    </section>
  );
}
