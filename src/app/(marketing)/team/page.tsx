import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { getStaffMembers } from "@/lib/content";

export const metadata: Metadata = {
  title: "Meet the Team",
  description: "Photos, qualifications and intro videos for the teachers of Tarbiyyah Global Academy.",
};

export default async function TeamPage() {
  // Unconfirmed entries never render publicly — no visible "bio to follow"
  // placeholder; a staff member simply appears once an admin has real
  // details for them, per the no-visible-placeholder rule.
  const staff = (await getStaffMembers()).filter((s) => !s.isPlaceholder);

  return (
    <>
      <section className="geo-texture bg-cream py-16">
        <Container>
          <Kicker>Meet the Team</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">The people teaching your child.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            Every teacher is public on our website — photo, qualifications and a short intro video, before you ever
            apply.
          </p>
        </Container>
      </section>

      <section className="py-16">
        <Container className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((s) => (
            <div key={s._id} className="rounded-2xl border border-gold-light/50 bg-white p-6 text-center">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-cream font-serif text-2xl font-semibold text-gold-700">
                {s.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </div>
              <h2 className="mt-4 font-serif text-lg font-semibold text-ink">{s.name}</h2>
              <p className="text-sm font-medium text-gold-700">{s.roleTitle}</p>
              {s.qualifications && <p className="mt-2 text-sm text-ink/70">{s.qualifications}</p>}
              {s.introVideoUrl && (
                <a href={s.introVideoUrl} className="mt-3 inline-block text-sm font-semibold text-gold-700 underline">
                  Watch intro video
                </a>
              )}
            </div>
          ))}
          {staff.length === 0 && (
            <p className="text-ink/60 sm:col-span-2 lg:col-span-3">Team profiles will appear here as they&apos;re confirmed.</p>
          )}
        </Container>
      </section>

      <CtaBand heading="Ready to meet us properly?" body="Book a place at our next virtual open evening." ctaLabel="Book Open Evening" ctaHref="/open-evening" />
    </>
  );
}
