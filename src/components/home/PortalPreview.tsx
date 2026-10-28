import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/Container";
import { portalCta } from "@/lib/nav";

/**
 * "Your window into school": what a parent actually gets in the portal, with
 * real screenshots of the family dashboard (a demo family, not a real pupil).
 */
const FEATURES = [
  { title: "Today's lessons", body: "The day's live lessons (UK time), with one tap to join on Microsoft Teams." },
  { title: "Registers & attendance", body: "Every lesson's register, so you know straight away if your child was missed." },
  { title: "Homework & grades", body: "What's due, what's been marked, and the feedback that came with it." },
  { title: "Qur'an progress", body: "Hifdh and recitation targets tracked alongside every other subject." },
  { title: "Weekly Tarbiyah Note", body: "A personal note on character and akhlaq from the form tutor." },
  { title: "Message teachers", body: "Talk to your child's teachers directly, on safeguarded, logged channels." },
  { title: "Sign forms online", body: "Consents and policies signed with your own hand signature, no printing." },
  { title: "Fees & reports", body: "Invoices, payment plans and termly reports in one place." },
];

export function PortalPreview() {
  return (
    <section className="section-pad bg-teal-900 text-cream" aria-labelledby="portal-heading">
      <Container className="grid gap-12">
        <div className="max-w-5xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">
            <span className="h-px w-8 bg-gold-300" aria-hidden="true" />
            The parent portal
          </div>
          <h2 id="portal-heading" className="text-h2 font-serif font-semibold text-white">
            You stay close to school, without doing the teaching.
          </h2>
          <p className="mt-4 max-w-2xl text-cream/80">
            Every family gets its own login to the same portal our teachers use, so you see what they see: lessons, registers,
            marking and the weekly note on your child&apos;s character.
          </p>
          <ul className="mt-8 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
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

        {/* Real screenshots of the family dashboard (captured from the live
            portal by scripts/capture-portal-screenshots.mjs): a phone on small
            screens, a desktop browser on large ones. */}
        <figure className="mx-auto w-full max-w-xs lg:hidden">
          <div className="aspect-[390/844] overflow-hidden rounded-[2.25rem] border-[6px] border-ink-900 bg-ink-900 shadow-2xl">
            <Image src="/images/portal-preview/family-dashboard-phone.png" alt="The family dashboard in the Parent Portal on a phone" width={1170} height={4500} className="h-auto w-full rounded-[1.8rem]" sizes="20rem" />
          </div>
          <figcaption className="mt-3 text-center text-xs text-cream/70">The Parent Portal on a phone (sample family).</figcaption>
        </figure>
      </Container>
      <Container className="hidden lg:block">
        <figure className="mt-12">
          <div className="overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-white/15">
            <div className="flex items-center gap-2 border-b border-ink/10 bg-cream px-4 py-2.5" aria-hidden="true">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              <span className="ml-4 rounded-md bg-white px-3 py-1 text-xs text-ink/60">learn.tarbiyyah.co.uk/family/dashboard</span>
            </div>
            <Image src="/images/portal-preview/family-dashboard-desktop.png" alt="The family dashboard in the Parent Portal on a computer" width={2880} height={1920} className="h-auto w-full" sizes="(min-width: 1280px) 72rem, 100vw" />
          </div>
          <figcaption className="mt-3 text-center text-xs text-cream/70">The Parent Portal on a computer (sample family).</figcaption>
        </figure>
      </Container>
    </section>
  );
}
