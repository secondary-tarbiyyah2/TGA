import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { BookingCalendar } from "@/components/booking/BookingCalendar";
import { getFeeBands } from "@/lib/content";
import { formatGBP } from "@/lib/format";

export const metadata: Metadata = {
  title: "Book an Admissions Call",
  description: "Book a free 20-minute admissions call with our team, on Microsoft Teams — no obligation.",
};

const covers = [
  "The full British curriculum and Islamic Studies, at your child's key stage",
  "Live-lesson timing and how it works from your timezone",
  "Fees, payment plans and next steps for the December 2026 launch",
  "Any questions about admissions, assessment or your child's needs",
];

const afterBooking = [
  "A confirmation email with your Teams link and a calendar invite",
  "Reminder emails 24 hours and 1 hour before your call",
  "Need to change it? Reschedule or cancel any time from the link in that email",
];

export default async function BookACallPage() {
  // Fee bands are ordered Y1→Y11 by `order` (see
  // src/lib/quiz/feeBand.ts's same assumption elsewhere) — the first band
  // is the school's actual cheapest, so this is a real "from" figure, not
  // a guess. Hidden entirely if no fee bands are configured yet, rather
  // than showing a fabricated number.
  const feeBands = await getFeeBands();
  const fromMonthly = feeBands[0]?.monthlyFee;

  return (
    <section className="section-pad">
      <Container className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <Kicker>Book an admissions call</Kicker>
          <h1 className="text-h2 font-serif font-semibold text-ink">A free 20-minute call, no obligation.</h1>
          {fromMonthly != null && (
            <p className="mt-3 text-sm font-medium text-ink/80">
              Fees from {formatGBP(fromMonthly)}/month — see the{" "}
              <Link href="/policies" className="font-semibold text-gold-700 underline">Fees Policy</Link> for full details.
            </p>
          )}
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
          <div className="mt-6">
            <p className="text-sm font-semibold text-ink">What happens after you book</p>
            <ul className="mt-2 space-y-1.5">
              {afterBooking.map((c) => (
                <li key={c} className="flex items-start gap-2 text-sm text-ink/75">
                  <span aria-hidden="true" className="mt-1 text-gold-500">◆</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <Suspense fallback={<p className="text-ink/60">Loading booking calendar…</p>}>
          <BookingCalendar />
        </Suspense>
      </Container>
    </section>
  );
}
