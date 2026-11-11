import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { OpenEveningLive } from "@/components/OpenEveningLive";
import { getSiteSettings } from "@/lib/content";
import { KEY_DATES } from "@/content/keyDates";

export const metadata: Metadata = pageMetadata({
  title: "Open Evenings & Taster Morning",
  description: "Register for a virtual open evening (26 November and 6 December) or a taster morning (12 December) ahead of our January 2027 launch.",
  path: "/open-evening",
});

export default async function OpenEveningPage() {
  const settings = await getSiteSettings();

  const sessions = KEY_DATES.filter((d) => d.href === "/open-evening");

  return (
    <section className="hero-pad-top pb-16 sm:pb-24">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <Kicker>Meet us online</Kicker>
            <h1 className="text-h1 font-serif font-semibold text-ink">Open evenings and a taster morning.</h1>
            <p className="mt-5 max-w-xl text-lg text-ink/75">
              Meet the Headteacher, watch a short demonstration of how a live lesson runs, see the Parent and Student Portals, and ask anything you like.
              Every session is online, and the joining link is emailed to you when you register.
            </p>
            <p className="mt-4 max-w-xl text-ink/75">
              At the taster morning your child joins real lessons, in two age bands so every lesson is pitched right.
            </p>
            <p className="mt-6 max-w-xl text-sm text-ink/70">
              Can&apos;t make a date?{" "}
              <Link href="/book-a-call#book" className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900">Book a free call</Link>{" "}
              or read the{" "}
              <a href="/prospectus/TGA-Prospectus-2026-27.pdf" className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900" target="_blank" rel="noopener noreferrer">prospectus (PDF)<span className="sr-only">, opens in a new tab</span></a>.
            </p>
          </div>
          <div className="rounded-2xl border border-gold-light/60 bg-cream/70 p-6 geo-texture">
            <h2 className="font-serif text-lg font-semibold text-ink">Dates (UK time)</h2>
            <ul className="mt-4 space-y-3">
              {sessions.map((d) => (
                <li key={d.when} className="rounded-xl border border-gold-light/50 bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">{d.label}</p>
                  <p className="mt-0.5 font-semibold text-ink">{d.when}</p>
                  {d.detail && <p className="text-sm text-ink/70">{d.detail}</p>}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Two different events on one page: the menu links straight to each. */}
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <section id="open-evenings" aria-labelledby="open-evenings-heading" className="scroll-mt-24 rounded-2xl border border-gold-light/60 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">For parents</p>
            <h2 id="open-evenings-heading" className="mt-1 font-serif text-2xl font-semibold text-ink">Online open evenings</h2>
            <p className="mt-2 text-ink/75">An hour with the Headteacher: how the school day works, a short demonstration of how a live lesson runs, a tour of the Parent and Student Portals, and your questions answered live.</p>
            <ul className="mt-3 space-y-1 text-sm text-ink/80">
              {sessions.filter((d) => /open evening/i.test(d.label)).map((d) => (
                <li key={d.when}>{d.when} (UK time)</li>
              ))}
            </ul>
            <a href="#book" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 hover:brightness-95">Book an open evening</a>
          </section>
          <section id="taster" aria-labelledby="taster-heading" className="scroll-mt-24 rounded-2xl border border-gold-light/60 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">For your child</p>
            <h2 id="taster-heading" className="mt-1 font-serif text-2xl font-semibold text-ink">Taster morning</h2>
            <p className="mt-2 text-ink/75">Your child joins real live lessons with our teachers, in two age bands so every lesson is pitched right. Parents can watch alongside.</p>
            <ul className="mt-3 space-y-1 text-sm text-ink/80">
              {sessions.filter((d) => /taster/i.test(d.label)).map((d) => (
                <li key={d.when}>{d.when}{d.detail ? `: ${d.detail}` : ""}</li>
              ))}
            </ul>
            <a href="#book" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 hover:brightness-95">Book the taster morning</a>
          </section>
        </div>

        {/* Dates and the booking form load in the browser, so a new
            evening added in the admin portal appears without a site rebuild. */}
        <div id="book" className="max-w-3xl scroll-mt-24">
          <OpenEveningLive
            initialSettings={{
              admissionsEmail: settings.admissionsEmail,
              bookingWidgetUrl: settings.bookingWidgetUrl,
              openEveningRecordingUrl: settings.openEveningRecordingUrl,
            }}
          />
        </div>
      </Container>
    </section>
  );
}
