import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { PolicyDirectory } from "@/components/PolicyDirectory";
import { getPolicyLinks, getSiteSettings } from "@/lib/content";

export const metadata: Metadata = pageMetadata({
  title: "Policies",
  description: "Our statutory school policies, including Safeguarding, Admissions, Fees and Data Protection.",
  path: "/policies",
});

// The list itself is a client component that re-reads the database in the
// visitor's browser, so a policy edit in the admin portal is live immediately.
// What is rendered here is the build-time copy: the first paint and the
// fallback when the database cannot be reached.
export default async function PoliciesPage() {
  const [policies, siteSettings] = await Promise.all([getPolicyLinks(), getSiteSettings()]);

  return (
    <section className="section-pad">
      <Container className="max-w-2xl">
        <Kicker>Policies</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">School policies.</h1>
        <p className="mt-4 text-ink/70">
          Our statutory policies for the 2026&ndash;27 academic year. For our privacy notice, see the{" "}
          <Link href="/legal/privacy" className="font-semibold text-gold-700 underline">Privacy page</Link>.
        </p>

        <PolicyDirectory
          initialPolicies={policies}
          initialSettings={{
            safeguardingLeadName: siteSettings.safeguardingLeadName,
            safeguardingLeadContact: siteSettings.safeguardingLeadContact,
            regulatoryStatusNote: siteSettings.regulatoryStatusNote,
            complaintsLastYear: siteSettings.complaintsLastYear,
          }}
        />
      </Container>
    </section>
  );
}
