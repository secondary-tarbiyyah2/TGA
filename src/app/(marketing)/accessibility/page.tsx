import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { getSiteSettings } from "@/lib/content";

export const metadata: Metadata = pageMetadata({
  title: "Accessibility",
  description: "How Tarbiyyah Global Academy works to make this website and portal usable by everyone, what you can change, and how to tell us about a problem.",
  path: "/accessibility",
});

export default async function AccessibilityPage() {
  const settings = await getSiteSettings();
  const email = settings.admissionsEmail || "globalacademy@tarbiyyah.co.uk";
  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container className="max-w-2xl">
          <Kicker>Accessibility</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">A website everyone can use.</h1>
          <p className="mt-6 text-lg text-ink/75">
            We want every family and pupil to be able to use this website and the Academy portal, whatever device, ability or connection they have. This page says what we aim for, what you can change, and how to tell us when something is hard to use.
          </p>
        </Container>
      </section>
      <section className="section-pad">
        <Container className="max-w-2xl space-y-10">
          <div>
            <Kicker>What we aim for</Kicker>
            <p className="text-ink/80">
              We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. Every public page is checked automatically for accessibility problems each time the site changes, including at phone width. Automatic checks find only some problems, so we also test with a keyboard and a screen reader, and we fix what we find.
            </p>
          </div>
          <div>
            <Kicker>What you can change</Kicker>
            <ul className="list-disc space-y-2 pl-5 text-ink/80">
              <li>Use the <b>View</b> control in the header, or the account menu in the portal, to turn on larger text, an easy-reading layout or high contrast. Your choice is remembered on that device.</li>
              <li>Everything can be used with a keyboard alone. Press Tab to move and Enter to select.</li>
              <li>Arabic text is marked up so screen readers read it in Arabic and it displays right to left.</li>
            </ul>
          </div>
          <div>
            <Kicker>Known limits</Kicker>
            <p className="text-ink/80">
              Some older documents and recordings may not yet have captions, transcripts or an accessible version. If you need one, ask and we will provide it.
            </p>
          </div>
          <div>
            <Kicker>Tell us about a problem</Kicker>
            <p className="text-ink/80">
              If something is hard to use, or you need information in another format, email{" "}
              <a href={`mailto:${email}`} className="underline">{email}</a>. Tell us the page, what you were trying to do and what device or assistive technology you use. We will reply and aim to fix it quickly.
            </p>
          </div>
        </Container>
      </section>
    </>
  );
}
