import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker, PlaceholderNote } from "@/components/Section";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <section className="py-16">
      <Container className="max-w-2xl">
        <Kicker>Legal</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink">Terms of Use</h1>
        <PlaceholderNote>Placeholder copy — full Terms of Use (and separate enrolment Terms & Conditions) will be published here before launch.</PlaceholderNote>
        <p className="mt-6 text-ink/75">
          These terms will govern your use of this website. Separate enrolment terms and conditions, covering fees,
          withdrawal and the Fee Policy, apply once a place is offered and accepted — see the{" "}
          <a href="/policies" className="underline">Policies</a> page.
        </p>
      </Container>
    </section>
  );
}
