import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { FaqAccordion } from "@/components/FaqAccordion";
import { getFaqEntries } from "@/lib/content";

export const metadata: Metadata = {
  title: "FAQs",
  description: "Frequently asked questions about admissions, fees, curriculum, technology, Islamic Studies and SEND.",
};

export default async function FaqsPage() {
  const faqs = await getFaqEntries();

  return (
    <section className="py-16">
      <Container className="max-w-3xl">
        <Kicker>FAQs</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Frequently asked questions.</h1>
        <p className="mt-6 text-lg text-ink/75">Search or filter by category to find your answer.</p>
        <div className="mt-10">
          <FaqAccordion entries={faqs} />
        </div>
      </Container>
    </section>
  );
}
