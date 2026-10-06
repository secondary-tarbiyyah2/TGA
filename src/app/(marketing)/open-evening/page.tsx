import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { OpenEveningLive } from "@/components/OpenEveningLive";
import { getSiteSettings } from "@/lib/content";

export const metadata: Metadata = pageMetadata({
  title: "Virtual Open Evening",
  description: "Book a place at our virtual open evening, or watch a past recording.",
  path: "/open-evening",
});

export default async function OpenEveningPage() {
  const settings = await getSiteSettings();

  return (
    <section className="section-pad">
      <Container className="max-w-2xl">
        <Kicker>Virtual Open Evening</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Meet us online.</h1>
        <p className="mt-6 text-lg text-ink/75">
          Join a live virtual open evening to meet the Headteacher and teaching team, ask questions, and see what
          makes Tarbiyyah Global Academy different.
        </p>

        {/* Dates, places left and the booking form load in the browser, so a new
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
