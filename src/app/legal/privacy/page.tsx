import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker, PlaceholderNote } from "@/components/Section";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPolicyPage() {
  return (
    <section className="py-16">
      <Container className="prose max-w-2xl">
        <Kicker>Legal</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink">Privacy Policy</h1>
        <PlaceholderNote>Placeholder copy — the full UK GDPR-compliant Privacy Policy will be published here before launch.</PlaceholderNote>
        <p className="mt-6 text-ink/75">
          Tarbiyyah Global Academy, part of the Tarbiyyah Education Trust, is committed to protecting the privacy of
          every family who visits this website or applies to the Academy. This page will set out, in full: what
          personal data we collect (including via our register-interest and application forms), why we collect it,
          how long we keep it, who we share it with, and how you can exercise your rights under UK GDPR — including
          the right to access, correct or ask us to delete your data.
        </p>
        <p className="mt-4 text-ink/75">
          In the meantime, if you have any questions about your data, contact{" "}
          <a href="mailto:globalacademy@tarbiyyah.co.uk" className="underline">globalacademy@tarbiyyah.co.uk</a>.
        </p>
      </Container>
    </section>
  );
}
