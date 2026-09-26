import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { getSiteSettings } from "@/lib/content";

export const metadata: Metadata = {
  title: "Virtual Open Evening",
  description: "Book a place at our virtual open evening, or watch a past recording.",
};

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

        <div className="mt-10 rounded-2xl border border-gold-light/50 bg-white p-6">
          <h2 className="font-serif text-lg font-semibold text-ink">Book your place</h2>
          {settings.bookingWidgetUrl ? (
            <iframe title="Book an open evening" src={settings.bookingWidgetUrl} className="mt-4 h-[600px] w-full rounded-xl border border-gold-light/40" />
          ) : (
            <p className="mt-2 text-sm text-ink/70">
              Email{" "}
              <a href={`mailto:${settings.admissionsEmail || "globalacademy@tarbiyyah.co.uk"}`} className="text-gold-700 underline">
                {settings.admissionsEmail || "globalacademy@tarbiyyah.co.uk"}
              </a>{" "}
              to register for the next session.
            </p>
          )}
        </div>

        {settings.openEveningRecordingUrl && (
          <div className="mt-10 rounded-2xl border border-gold-light/50 bg-white p-6">
            <h2 className="font-serif text-lg font-semibold text-ink">Watch a past recording</h2>
            <div className="mt-4 aspect-video overflow-hidden rounded-xl">
              <iframe title="Past open evening recording" src={settings.openEveningRecordingUrl} className="h-full w-full" allowFullScreen />
            </div>
          </div>
        )}
      </Container>
    </section>
  );
}
