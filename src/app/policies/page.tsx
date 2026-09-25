import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { getPolicyLinks, getSiteSettings } from "@/lib/content";
import type { PolicyLink } from "@/content/seed";

export const metadata: Metadata = {
  title: "Policies",
  description: "Our statutory school policies, including Safeguarding, Admissions, Fees and Data Protection.",
};

function formatReviewDate(iso?: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function PolicyList({ policies, complaintsLastYear }: { policies: PolicyLink[]; complaintsLastYear?: number }) {
  return (
    <ul className="mt-6 divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
      {policies.map((p) => {
        const lastReviewed = formatReviewDate(p.lastReviewed);
        const nextReview = formatReviewDate(p.nextReview);
        return (
          <li key={p._id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div>
              <p className="font-medium text-ink">
                <span className="text-ink/40">{p.number}</span> {p.title}
              </p>
              {p.summary && <p className="mt-0.5 text-xs text-ink/70">{p.summary}</p>}
              {p.number === "27" && typeof complaintsLastYear === "number" && (
                <p className="mt-0.5 text-xs text-ink/70">Formal complaints in the last academic year: {complaintsLastYear}</p>
              )}
              {(lastReviewed || nextReview) && (
                <p className="mt-1 text-xs text-ink/50">
                  {lastReviewed && <>Last reviewed: {lastReviewed}</>}
                  {lastReviewed && nextReview && " · "}
                  {nextReview && <>Next review: {nextReview}</>}
                </p>
              )}
            </div>
            <a href={p.fileUrl} className="shrink-0 text-sm font-semibold text-gold-700 underline" target="_blank" rel="noopener noreferrer">
              View PDF
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export default async function PoliciesPage() {
  const [policies, siteSettings] = await Promise.all([getPolicyLinks(), getSiteSettings()]);
  const required = policies.filter((p) => p.category === "required");
  const published = policies.filter((p) => p.category === "published");

  return (
    <section className="py-16">
      <Container className="max-w-2xl">
        <Kicker>Policies</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">School policies.</h1>
        <p className="mt-4 text-ink/70">
          Our statutory policies for the 2026–27 academic year. For our privacy notice, see the{" "}
          <Link href="/legal/privacy" className="font-semibold text-gold-700 underline">Privacy page</Link>.
        </p>

        {(siteSettings.safeguardingLeadName || siteSettings.regulatoryStatusNote) && (
          <div className="mt-8 rounded-2xl border border-gold-light/50 bg-cream p-5 text-sm text-ink/75">
            {siteSettings.safeguardingLeadName && (
              <p>
                <span className="font-semibold text-ink">Designated Safeguarding Lead:</span> {siteSettings.safeguardingLeadName}
                {siteSettings.safeguardingLeadContact && <> — {siteSettings.safeguardingLeadContact}</>}
              </p>
            )}
            {siteSettings.regulatoryStatusNote && <p className="mt-1">{siteSettings.regulatoryStatusNote}</p>}
          </div>
        )}

        <h2 className="mt-12 font-serif text-2xl font-semibold text-ink">Must be on the website</h2>
        <PolicyList policies={required} complaintsLastYear={siteSettings.complaintsLastYear} />

        <h2 className="mt-12 font-serif text-2xl font-semibold text-ink">Published for simplicity</h2>
        <p className="mt-1 text-sm text-ink/60">Only strictly required on request — published here for transparency.</p>
        <PolicyList policies={published} />
      </Container>
    </section>
  );
}
