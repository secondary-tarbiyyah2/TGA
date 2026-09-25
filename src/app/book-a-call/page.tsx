import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { BookingCalendar } from "@/components/booking/BookingCalendar";

export const metadata: Metadata = {
  title: "Book an Admissions Call",
  description: "Book a free 20-minute admissions call with our team, on Microsoft Teams — no obligation.",
};

const covers = [
  "The full British curriculum and Islamic Studies, at your child's key stage",
  "Live-lesson timing and how it works from your timezone",
  "Fees, payment plans and next steps for the January 2027 launch",
  "Any questions about admissions, assessment or your child's needs",
];

export default function BookACallPage() {
  return (
    <section className="section-pad">
      <Container className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <Kicker>Book an admissions call</Kicker>
          <h1 className="text-h2 font-serif font-semibold text-ink">A free 20-minute call, no obligation.</h1>
          <p className="mt-4 text-ink/75">A member of our admissions team will cover:</p>
          <ul className="mt-4 space-y-2">
            {covers.map((c) => (
              <li key={c} className="flex items-start gap-2 text-sm text-ink/75">
                <span aria-hidden="true" className="mt-1 text-gold-500">◆</span>
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-6 rounded-2xl bg-gold-100 p-4 text-sm text-ink/80">
            Calls are on Microsoft Teams — no download needed, just click the link in your confirmation email at the
            time of your call.
          </p>
        </div>
        <Suspense fallback={<p className="text-ink/60">Loading booking calendar…</p>}>
          <BookingCalendar />
        </Suspense>
      </Container>
    </section>
  );
}
