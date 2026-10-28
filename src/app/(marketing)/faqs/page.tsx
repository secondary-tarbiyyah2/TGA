import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { LiveFaq } from "@/components/LiveFaq";
import { JsonLd } from "@/components/JsonLd";
import { getFaqEntries } from "@/lib/content";
import { faqPlainText } from "@/lib/faq";

export const metadata: Metadata = pageMetadata({
  title: "FAQs",
  description: "Short answers to common questions about admissions, fees, the school day, curriculum, Islamic Studies, equipment, SEND and safeguarding.",
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
      acceptedAnswer: { "@type": "Answer", text: faqPlainText(f.answer) },
    })),
  };

  return (
    <section className="section-pad">
      {faqs.length > 0 && <JsonLd data={faqJsonLd} />}
      <Container className="max-w-3xl">
        <Kicker>FAQs</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Frequently asked questions.</h1>
        <p className="mt-6 text-lg text-ink/75">Short answers, with links to the full detail. Search, or pick a topic.</p>
        <div className="mt-10">
          <LiveFaq initialEntries={faqs} />
        </div>
      </Container>
    </section>
  );
}
