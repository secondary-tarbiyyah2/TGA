import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { LiveFaq } from "@/components/LiveFaq";
import { JsonLd } from "@/components/JsonLd";
import { getFaqEntries } from "@/lib/content";

export const metadata: Metadata = pageMetadata({
  title: "FAQs",
  description: "Frequently asked questions about admissions, fees, curriculum, technology, Islamic Studies and SEND.",
  path: "/faqs",
});

export default async function FaqsPage() {
  const faqs = await getFaqEntries();

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <section className="section-pad">
      {faqs.length > 0 && <JsonLd data={faqJsonLd} />}
      <Container className="max-w-3xl">
        <Kicker>FAQs</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Frequently asked questions.</h1>
        <p className="mt-6 text-lg text-ink/75">Grouped by what you&apos;re actually asking, or search to jump straight to an answer.</p>
        <div className="mt-10">
          <LiveFaq initialEntries={faqs} />
        </div>
        <div className="mt-12 rounded-2xl border border-gold-light/50 bg-white p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <p className="text-ink/80">Didn&apos;t find your answer? We&apos;re happy to talk it through.</p>
          <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold sm:mt-0">
            <Link href="/book-a-call" className="inline-flex min-h-11 items-center text-gold-700 underline underline-offset-2">Book a free call</Link>
            <Link href="/contact" className="inline-flex min-h-11 items-center text-gold-700 underline underline-offset-2">Contact us</Link>
          </p>
        </div>
      </Container>
    </section>
  );
}
