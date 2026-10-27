import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { YourChildsWeekQuiz } from "@/components/eligibility/YourChildsWeekQuiz";
import { getFeeBands, getSiteSettings } from "@/lib/content";
import { DEFAULT_QUIZ_CONFIG } from "@/lib/quiz/defaultConfig";

export const metadata: Metadata = pageMetadata({
  title: "Your Child's Week",
  description: "Five short questions to see a sample week for your child at Tarbiyyah Global Academy, in your own timezone, with fees and next steps.",
  path: "/eligibility",
});

export default async function EligibilityPage() {
  const [feeBands, settings] = await Promise.all([getFeeBands(), getSiteSettings()]);

  return (
    <section className="section-pad geo-texture bg-cream">
      <Container>
        <div className="mx-auto max-w-xl text-center">
          <Kicker>{DEFAULT_QUIZ_CONFIG.intro.kicker}</Kicker>
          <h1 className="text-h2 font-serif font-semibold text-ink">{DEFAULT_QUIZ_CONFIG.intro.title}</h1>
          <p className="mt-4 text-ink/70">{DEFAULT_QUIZ_CONFIG.intro.body}</p>
        </div>
        <div className="mt-10">
          <YourChildsWeekQuiz
            feeBands={feeBands}
            siblingDiscountPercent={settings.siblingDiscountPercent}
            siblingDiscountNote={settings.siblingDiscountNote}
            discounts={settings.discounts}
          />
        </div>
      </Container>
    </section>
  );
}
