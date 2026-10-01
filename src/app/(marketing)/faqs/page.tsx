import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { FaqAccordion } from "@/components/FaqAccordion";
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
          <FaqAccordion entries={faqs} />
        </div>
      </Container>
    </section>
  );
}
