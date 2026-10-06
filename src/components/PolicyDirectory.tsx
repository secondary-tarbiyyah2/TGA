"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getLivePolicyLinks, getLiveSiteSettings } from "@/lib/content";
import type { ParentQuestionCategory, PolicyLink } from "@/content/seed";

/** The bits of the site settings the Policies page shows. */
export type PolicySettings = {
  safeguardingLeadName?: string;
  safeguardingLeadContact?: string;
  regulatoryStatusNote?: string;
  complaintsLastYear?: number;
};

function formatReviewDate(iso?: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// Groups the full policy list by the question a parent actually has, rather
// than by DfE required/published category (that split is kept as a small
// badge on each row instead — see CategoryBadge).
const PARENT_QUESTION_GROUPS: { key: ParentQuestionCategory; heading: string }[] = [
  { key: "safety", heading: "Is my child safe?" },
  { key: "admissions-fees", heading: "How do we apply, and what does it cost?" },
  { key: "complaints", heading: "What if something goes wrong?" },
  { key: "data", heading: "How is my data used?" },
  { key: "curriculum", heading: "What do you teach, and how?" },
];

// A small, prominent set of the policies parents most often need — picked by
// matching against the existing seeded policy numbers/titles, not new facts.
const KEY_DOCUMENT_NUMBERS = ["01", "27", "25", "26", "29"];

function CategoryBadge({ category }: { category: PolicyLink["category"] }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        category === "required" ? "bg-gold-100 text-gold-900" : "bg-ink/5 text-ink/70"
      }`}
      title={category === "required" ? "Must be on the website (DfE requirement)" : "Published for simplicity — only strictly required on request"}
    >
      {category === "required" ? "Required" : "Published"}
    </span>
  );
}

function PolicyList({ policies, complaintsLastYear }: { policies: PolicyLink[]; complaintsLastYear?: number }) {
  return (
    <ul className="mt-4 divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
      {policies.map((p) => {
        const lastReviewed = formatReviewDate(p.lastReviewed);
        const nextReview = formatReviewDate(p.nextReview);
        return (
          <li key={p._id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div>
              <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                <span className="text-ink/60">{p.number}</span> {p.title}
                <CategoryBadge category={p.category} />
              </p>
              {p.summary && <p className="mt-0.5 text-xs text-ink/70">{p.summary}</p>}
              {p.number === "27" && typeof complaintsLastYear === "number" && (
                <p className="mt-0.5 text-xs text-ink/70">Formal complaints in the last academic year: {complaintsLastYear}</p>
              )}
              {(lastReviewed || nextReview) && (
                <p className="mt-1 text-xs text-ink/70">
                  {lastReviewed && <>Last reviewed: {lastReviewed}</>}
                  {lastReviewed && nextReview && " · "}
                  {nextReview && <>Next review: {nextReview}</>}
                </p>
              )}
            </div>
            <a href={p.fileUrl} className="shrink-0 text-sm font-semibold text-gold-700 underline" target="_blank" rel="noopener noreferrer">
              {isWordFile(p.fileUrl) ? "View Word file" : "View PDF"}
            </a>
          </li>
        );
      })}
    </ul>
  );
}


function isWordFile(url: string): boolean {
  return /\.docx(\?|$)/i.test(url);
}

/**
 * The policy list and the safeguarding-lead box. The build renders it first
 * (so the page works without JavaScript and is indexable), then the browser
 * re-reads the policies and settings from the database, so an edit in the
 * admin portal shows here straight away, with no site rebuild.
 */
export function PolicyDirectory({ initialPolicies, initialSettings }: { initialPolicies: PolicyLink[]; initialSettings: PolicySettings }) {
  const [policies, setPolicies] = useState<PolicyLink[]>(initialPolicies);
  const [settings, setSettings] = useState<PolicySettings>(initialSettings);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getLivePolicyLinks(), getLiveSiteSettings()]).then(([livePolicies, liveSettings]) => {
      if (cancelled) return;
      if (livePolicies) setPolicies(livePolicies);
      if (liveSettings) {
        setSettings({
          safeguardingLeadName: liveSettings.safeguardingLeadName,
          safeguardingLeadContact: liveSettings.safeguardingLeadContact,
          regulatoryStatusNote: liveSettings.regulatoryStatusNote,
          complaintsLastYear: liveSettings.complaintsLastYear,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const keyDocuments = KEY_DOCUMENT_NUMBERS.map((n) => policies.find((p) => p.number === n)).filter((p): p is PolicyLink => !!p);
  const ungrouped = policies.filter((p) => !p.parentQuestionCategory);

  return (
    <>
        {(settings.safeguardingLeadName || settings.regulatoryStatusNote) && (
          <div className="mt-8 rounded-2xl border border-gold-light/50 bg-cream p-5 text-sm text-ink/75">
            {settings.safeguardingLeadName && (
              <p>
                <span className="font-semibold text-ink">Designated Safeguarding Lead:</span> {settings.safeguardingLeadName}
                {settings.safeguardingLeadContact && <> — {settings.safeguardingLeadContact}</>}{" "}
                <Link href="/safeguarding" className="font-semibold text-gold-700 underline">Read our safeguarding approach</Link>
              </p>
            )}
            {settings.regulatoryStatusNote && <p className="mt-1">{settings.regulatoryStatusNote}</p>}
          </div>
        )}

        {keyDocuments.length > 0 && (
          <div className="mt-10">
            <h2 className="font-serif text-xl font-semibold text-ink">Key documents</h2>
            <p className="mt-1 text-sm text-ink/70">The policies parents ask for most often.</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {keyDocuments.map((p) => (
                <li key={p._id}>
                  <a
                    href={p.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-xl border border-gold-500/60 bg-gold-100/40 px-4 py-3 text-sm font-semibold text-ink hover:bg-gold-100"
                  >
                    {p.title}
                    <span aria-hidden="true" className="text-gold-700">→</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {PARENT_QUESTION_GROUPS.map((group) => {
          const items = policies.filter((p) => p.parentQuestionCategory === group.key);
          if (items.length === 0) return null;
          return (
            <div key={group.key}>
              <h2 className="mt-12 font-serif text-2xl font-semibold text-ink">{group.heading}</h2>
              <PolicyList policies={items} complaintsLastYear={settings.complaintsLastYear} />
            </div>
          );
        })}

        {ungrouped.length > 0 && (
          <div>
            <h2 className="mt-12 font-serif text-2xl font-semibold text-ink">Other policies</h2>
            <PolicyList policies={ungrouped} complaintsLastYear={settings.complaintsLastYear} />
          </div>
        )}
    </>
  );
}
