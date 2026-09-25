import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Kicker, PlaceholderNote } from "@/components/Section";

export const metadata: Metadata = {
  title: "Parent/Student Portal",
  description: "Log in to Tarbiyyah Global Academy's staff area, or find out about the Parent/Student portal.",
};

export default function PortalPage() {
  return (
    <section className="py-24">
      <Container className="max-w-xl text-center">
        <Kicker>Portals</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Sign in to your portal.</h1>

        <div className="mt-10 rounded-2xl border border-gold-light/50 bg-white p-6 text-left">
          <h2 className="font-serif text-lg font-semibold text-ink">Staff &amp; teachers</h2>
          <p className="mt-1 text-sm text-ink/70">Admissions calls, staff tools and (for teachers) your teacher dashboard.</p>
          <Link href="/staff" className="mt-4 inline-flex items-center justify-center rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95">
            Sign in
          </Link>
        </div>

        <div className="mt-6 rounded-2xl border border-gold-light/50 bg-white p-6 text-left">
          <h2 className="font-serif text-lg font-semibold text-ink">Parents &amp; students</h2>
          <p className="mt-1 text-sm text-ink/70">
            Lessons, homework, attendance and grades will live in our own Learning Platform, built directly into this
            site — no separate system to set up.
          </p>
          <PlaceholderNote>Not live yet — the Learning Platform is still being built. This page will be updated once it launches.</PlaceholderNote>
        </div>
      </Container>
    </section>
  );
}
