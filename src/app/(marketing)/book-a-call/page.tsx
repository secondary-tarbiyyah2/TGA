import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { BookingCalendar } from "@/components/booking/BookingCalendar";

export const metadata: Metadata = {
  title: "Book an Admissions Call",
  description: "Book a free 20-minute admissions call with our team, on Microsoft Teams, no obligation.",
};

export default function BookACallPage() {
  return (
    <section className="section-pad">
      <Container>
        <div className="max-w-2xl">
          <Kicker>Book an admissions call</Kicker>
          <h1 className="text-h2 font-serif font-semibold text-ink">Pick a time. A free 20-minute call, no obligation.</h1>
          <p className="mt-3 text-ink/75">
            Times are shown in your own time zone. You&apos;ll get a confirmation email with a Teams link (no download needed)
            and reminders before the call, and you can reschedule from that email at any time.
          </p>
        </div>

        {/* The calendar is the point of this page, so it sits directly under
            the heading (every "Book a call" link targets #book), with the
            form appearing beside/under it as soon as a time is chosen. */}
        <div id="book" className="mt-8 scroll-mt-24">
          <Suspense fallback={<p className="text-ink/65">Loading booking calendar…</p>}>
            <BookingCalendar />
          </Suspense>
        </div>

        <p className="mt-8 max-w-2xl text-sm text-ink/65">
          Prefer not to book a slot? Email{" "}
          <a href="mailto:globalacademy@tarbiyyah.co.uk" className="font-semibold text-gold-700 underline">globalacademy@tarbiyyah.co.uk</a>{" "}
          or see the <Link href="/fees" className="font-semibold text-gold-700 underline">fees</Link> and{" "}
          <Link href="/open-evening" className="font-semibold text-gold-700 underline">open evenings</Link> first.
        </p>
      </Container>
    </section>
  );
}
