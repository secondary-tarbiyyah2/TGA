import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { PaymentProofClient } from "@/components/admissions-payment/PaymentProofClient";

export const metadata: Metadata = {
  title: "Upload Proof of Payment",
  description: "Send us proof of your application fee payment using the link in your email.",
  robots: { index: false, follow: false },
};

export default function AdmissionsPaymentPage() {
  return (
    <section className="section-pad">
      <Container className="max-w-xl">
        <Kicker>Admissions</Kicker>
        <h1 className="text-h2 font-serif font-semibold text-ink">Upload proof of payment.</h1>
        <div className="mt-8">
          <Suspense fallback={<p className="text-ink/65">Loading…</p>}>
            <PaymentProofClient />
          </Suspense>
        </div>
      </Container>
    </section>
  );
}
