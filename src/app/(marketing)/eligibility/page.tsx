import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { FitCheck } from "@/components/eligibility/FitCheck";
import { getFeeBands, getSiteSettings } from "@/lib/content";
import { FEE_DEFAULTS, FEE_POLICY_DEFAULTS } from "@/lib/fees";
import { FIT_CHECK } from "@/content/fitCheck";

export const metadata: Metadata = pageMetadata({
  title: FIT_CHECK.meta.title,
  description: FIT_CHECK.meta.description,
  path: "/eligibility",
});

export default async function EligibilityPage() {
  const [feeBands, settings] = await Promise.all([getFeeBands(), getSiteSettings()]);

  return (
    <section className="section-pad geo-texture bg-cream">
      <Container>
        <FitCheck
          feeBands={feeBands}
          fees={{
            terms: settings.feeTerms ?? FEE_DEFAULTS.terms,
            instalments: settings.feeInstalments ?? FEE_DEFAULTS.instalments,
            annualDiscountPercent: settings.annualDiscountPercent ?? FEE_POLICY_DEFAULTS.annualDiscountPercent,
            siblingDiscountPercent: settings.siblingDiscountPercent,
            applicationFee: settings.applicationFee ?? FEE_POLICY_DEFAULTS.applicationFee,
          }}
        />
      </Container>
    </section>
  );
}
