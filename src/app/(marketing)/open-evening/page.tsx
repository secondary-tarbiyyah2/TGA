import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { OpenEveningLive } from "@/components/OpenEveningLive";
import { getSiteSettings } from "@/lib/content";

export const metadata: Metadata = pageMetadata({
  title: "Open Evenings & Taster Morning",
  description: "Register for a virtual open evening (26 November and 6 December) or a taster morning (12 December) ahead of our January 2027 launch.",
  path: "/open-evening",
});

export default async function OpenEveningPage() {
  const settings = await getSiteSettings();

  return (
    <section className="section-pad">
      <Container className="max-w-2xl">
        <Kicker>See it live, from your own sofa</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Meet us online: open evenings and a taster morning.</h1>
        <p className="mt-6 text-lg text-ink/75">
          Meet the Headteacher, see a sample live lesson and the Parent and Student Portals, and ask anything you like.
          At the taster morning (Saturday 12 December, after both open evenings) your child joins real lessons, in two age bands so every lesson is pitched right: Years 1–6
          at 10:00 and Years 7–11 at 11:15 UK time. Every session is online; register below and the joining link is emailed
          to you.
        </p>
        <p className="mt-4 text-sm text-ink/70">
          Live lessons begin on Monday 11 January 2027. Read the{" "}
          <a href="/prospectus/TGA-Prospectus-2026-27.pdf" className="font-semibold text-gold-700 underline" target="_blank" rel="noopener noreferrer">prospectus (PDF)<span className="sr-only">, opens in a new tab</span></a>{" "}
          before you come, or <Link href="/book-a-call" className="font-semibold text-gold-700 underline">book a call</Link> with the admissions team at any time.
        </p>

        {/* Dates and the booking form load in the browser, so a new
            evening added in the admin portal appears without a site rebuild. */}
        <OpenEveningLive
          initialSettings={{
            admissionsEmail: settings.admissionsEmail,
            bookingWidgetUrl: settings.bookingWidgetUrl,
            openEveningRecordingUrl: settings.openEveningRecordingUrl,
          }}
        />
      </Container>
    </section>
  );
}
