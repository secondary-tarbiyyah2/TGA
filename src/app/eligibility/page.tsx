import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { EligibilityQuiz } from "@/components/eligibility/EligibilityQuiz";

export const metadata: Metadata = {
  title: "Is TGA Right for Your Family?",
  description: "A quick, personalised quiz to see whether Tarbiyyah Global Academy is the right fit for your child — and what to do next.",
};

export default function EligibilityPage() {
  return (
    <section className="section-pad geo-texture bg-cream">
      <Container>
        <div className="mx-auto max-w-xl text-center">
          <Kicker>Is it right for us?</Kicker>
          <h1 className="text-h2 font-serif font-semibold text-ink">Two minutes to find out if TGA fits your family.</h1>
          <p className="mt-4 text-ink/70">
            Answer a handful of questions about your child and we&apos;ll point you straight to the right next step —
            no generic form, just a personalised recommendation.
          </p>
        </div>
        <div className="mt-10">
          <EligibilityQuiz />
        </div>
      </Container>
    </section>
  );
}
