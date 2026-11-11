import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { BookingCalendar } from "@/components/booking/BookingCalendar";
import { ROLE_EMAILS } from "@/content/contacts";

export const metadata: Metadata = {
  title: "Book an Admissions Call",
  description: "Book a free 20-minute admissions call with our team, on Microsoft Teams, no obligation.",
};

export default function BookACallPage() {
  return (
    <section className="hero-pad-top pb-16 sm:pb-24">
      <Container>
        <div className="max-w-2xl">
          <Kicker>Book an admissions call</Kicker>
          <h1 className="text-h1 font-serif font-semibold text-ink">Book a free 20-minute call.</h1>
          <p className="mt-5 text-lg text-ink/75">
            Ask the admissions team anything, with no obligation to apply.{" "}
            Times are shown in your own time zone. You&apos;ll get a confirmation email with a Teams link (no download needed)
            and reminders before the call, and you can reschedule from that email at any time.
          </p>
        </div>

        {/* The calendar is the point of this page, so it sits directly under
            the heading (every "Book a call" link targets #book). It is a
            three-step wizard (day, time, details) that fits on one screen. */}
        <div id="book" className="mt-8 max-w-5xl scroll-mt-24">
          <Suspense fallback={<p className="text-ink/65">Loading booking calendar…</p>}>
            <BookingCalendar />
          </Suspense>
        </div>

        <p className="mt-8 max-w-2xl text-sm text-ink/70">
          Prefer not to book a slot? Email{" "}
          <a href={`mailto:${ROLE_EMAILS.admissions}`} className="font-semibold text-gold-700 underline">{ROLE_EMAILS.admissions}</a>{" "}
          or come to an <Link href="/open-evening" className="font-semibold text-gold-700 underline">online open evening</Link>.
        </p>
      </Container>
    </section>
  );
}
