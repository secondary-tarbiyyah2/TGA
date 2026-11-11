import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { RegisterInterestForm } from "@/components/RegisterInterestForm";
import { getSiteSettings } from "@/lib/content";
import { ROLE_EMAILS } from "@/content/contacts";

export const metadata: Metadata = pageMetadata({
  title: "Contact",
  description: "Get in touch with Tarbiyyah Global Academy.",
  path: "/contact",
});

export default async function ContactPage() {
  const settings = await getSiteSettings();
  const email = settings.admissionsEmail || ROLE_EMAILS.general;

  return (
    <section className="hero-pad-top pb-16 sm:pb-24">
      <Container className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <Kicker>Contact</Kicker>
          <h1 className="text-h1 font-serif font-semibold text-ink">Get in touch.</h1>
          <p className="mt-5 max-w-xl text-lg text-ink/75">
            Whether you have a question before applying or want to register your interest, we&apos;d love to hear
            from you. Leave your details and the admissions team will be in touch.
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
          <div className="mt-10 rounded-2xl border border-gold-light/60 bg-cream p-5">
            <p className="font-serif font-semibold text-ink">Prefer to talk it through?</p>
            <p className="mt-1 text-sm text-ink/70">Book a free 20-minute call with admissions, at a time that suits you.</p>
            <Link href="/book-a-call#book" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-gold-700 hover:text-gold-900">
              Book a free call <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        <div>
          <RegisterInterestForm enquiryChoice />
        </div>
      </Container>
    </section>
  );
}
