import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { RegisterInterestForm } from "@/components/RegisterInterestForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Tarbiyyah Global Academy.",
};

export default function ContactPage() {
  return (
    <section className="py-16">
      <Container className="grid gap-12 lg:grid-cols-2">
        <div>
          <Kicker>Contact</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Get in touch.</h1>
          <p className="mt-6 text-lg text-ink/75">
            Whether you have a question before applying or want to register your interest, we&apos;d love to hear
            from you.
          </p>
          <dl className="mt-8 space-y-4 text-ink/80">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-maroon">Email</dt>
              <dd><a href="mailto:globalacademy@tarbiyyah.co.uk" className="underline">globalacademy@tarbiyyah.co.uk</a></dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-maroon">Part of</dt>
              <dd>The Tarbiyyah Education Trust, United Kingdom</dd>
            </div>
          </dl>
        </div>
        <div>
          <RegisterInterestForm />
        </div>
      </Container>
    </section>
  );
}
