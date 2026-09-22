import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker, PlaceholderNote } from "@/components/Section";
import { getSiteSettings } from "@/lib/content";

export const metadata: Metadata = {
  title: "Parent/Student Portal",
  description: "Log in to the Tarbiyyah Global Academy learning portal.",
};

export default async function PortalPage() {
  const settings = await getSiteSettings();

  return (
    <section className="py-24">
      <Container className="max-w-xl text-center">
        <Kicker>Parent/Student Portal</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Log in to your learning portal.</h1>
        <p className="mt-6 text-ink/75">
          Lessons, homework, attendance, grades and Teams meeting links all live in our learning platform, Moodle —
          accessed securely via single sign-on with your Microsoft 365 account. This page is only the entry point;
          there&apos;s nothing else to set up here.
        </p>

        {settings.portalUrl ? (
          <a
            href={settings.portalUrl}
            className="mt-8 inline-flex items-center justify-center rounded-full bg-maroon px-8 py-3.5 text-sm font-semibold text-white hover:bg-maroon-dark"
          >
            Log In
          </a>
        ) : (
          <>
            <span className="mt-8 inline-flex cursor-not-allowed items-center justify-center rounded-full bg-ink/20 px-8 py-3.5 text-sm font-semibold text-white/70">
              Log In
            </span>
            <PlaceholderNote>Moodle portal URL to be added via Site settings once the LMS is live.</PlaceholderNote>
          </>
        )}
      </Container>
    </section>
  );
}
