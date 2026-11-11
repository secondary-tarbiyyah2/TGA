import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { PayOnlineClient } from "@/components/admissions-payment/PayOnlineClient";

export const metadata: Metadata = {
  title: "Pay Your Fees",
  robots: { index: false, follow: false },
};

/** The family's personal payment page, from their application or offer email (T71). */
export default function AdmissionsPaymentPage() {
  return (
    <section className="section-pad">
      <Container className="max-w-xl">
        <Kicker>Admissions</Kicker>
        <h1 className="text-h2 font-serif font-semibold text-ink">Pay your fees.</h1>
        <div className="mt-8">
          <Suspense fallback={<p className="text-ink/65">Loading…</p>}>
            <PayOnlineClient />
          </Suspense>
        </div>
      </Container>
    </section>
  );
}
