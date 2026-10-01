import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { RegisterInterestForm } from "@/components/RegisterInterestForm";
import { getSiteSettings } from "@/lib/content";

export const metadata: Metadata = pageMetadata({
  title: "Contact",
  description: "Get in touch with Tarbiyyah Global Academy.",
  path: "/contact",
});

export default async function ContactPage() {
  const settings = await getSiteSettings();
  const email = settings.admissionsEmail || "globalacademy@tarbiyyah.co.uk";

  return (
    <section className="section-pad">
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
              <dt className="text-xs font-semibold uppercase tracking-wide text-gold-700">Email</dt>
              <dd><a href={`mailto:${email}`} className="underline">{email}</a></dd>
            </div>
            {settings.contactPhone && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gold-700">Phone</dt>
                <dd><a href={`tel:${settings.contactPhone.replace(/\s+/g, "")}`} className="underline">{settings.contactPhone}</a></dd>
              </div>
            )}
            {settings.openingHours && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gold-700">Opening hours</dt>
                <dd>{settings.openingHours}</dd>
              </div>
            )}
            {settings.contactAddress && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gold-700">Address</dt>
                <dd className="whitespace-pre-line">{settings.contactAddress}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-gold-700">Part of</dt>
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
