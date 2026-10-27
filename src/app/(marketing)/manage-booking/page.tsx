import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { ManageBookingClient } from "./ManageBookingClient";

export const metadata: Metadata = {
  title: "Manage Your Booking",
  description: "Reschedule or cancel your admissions call using the link in your confirmation email.",
  robots: { index: false, follow: false },
};

export default function ManageBookingPage() {
  return (
    <section className="section-pad">
      <Container className="max-w-xl">
        <Kicker>Manage booking</Kicker>
        <h1 className="text-h2 font-serif font-semibold text-ink">Your booking.</h1>
        <div className="mt-8">
          <Suspense fallback={<p className="text-ink/65">Loading…</p>}>
            <ManageBookingClient />
          </Suspense>
        </div>
      </Container>
    </section>
  );
}
