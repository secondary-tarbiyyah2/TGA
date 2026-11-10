"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { getLivePolicyLinks, getLiveSiteSettings } from "@/lib/content";
import type { ParentQuestionCategory, PolicyLink } from "@/content/seed";

/** The bits of the site settings the Policies page shows. */
export type PolicySettings = {
  safeguardingLeadName?: string;
  safeguardingLeadContact?: string;
  regulatoryStatusNote?: string;
  complaintsLastYear?: number;
  admissionsEmail?: string;
  policiesIntro?: string;
  policiesAccessibleFormatsNote?: string;
};

function formatReviewDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// Groups the full policy list by the question a parent actually has, rather
// than by DfE required/published category (that split is kept as a small
// badge on each row instead, see CategoryBadge). The same keys and
// headings are offered in the admin Policy editor.
const PARENT_QUESTION_GROUPS: { key: ParentQuestionCategory; heading: string; anchor: string }[] = [
  { key: "safety", heading: "Is my child safe?", anchor: "safety" },
  { key: "admissions-fees", heading: "How do we apply, and what does it cost?", anchor: "admissions-and-fees" },
  { key: "complaints", heading: "What if something goes wrong?", anchor: "concerns-and-complaints" },
  { key: "data", heading: "How is my data used?", anchor: "data-and-privacy" },
  { key: "curriculum", heading: "What do you teach, and how?", anchor: "teaching-and-learning" },
];

const DEFAULT_INTRO = "Our statutory policies for the 2026–27 academic year. Every policy is reviewed at least once a year.";
const DEFAULT_ACCESSIBLE_NOTE = "Every policy is available in large print, as a Word document, or in another accessible format on request.";

function isWordFile(url: string): boolean {
  return /\.docx(\?|$)/i.test(url);
}

function CategoryBadge({ category }: { category: PolicyLink["category"] }) {
  const required = category === "required";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
        required ? "bg-gold-100 text-gold-900" : "bg-ink/5 text-ink/70"
      }`}
    >
      {required ? "Required" : "Published"}
      <span className="sr-only">{required ? " (must be published under DfE guidance)" : " (published for transparency)"}</span>
    </span>
  );
}

/** "Last reviewed September 2026 · Next review August 2027", or null. */
function reviewLine(p: Pick<PolicyLink, "lastReviewed" | "nextReview">): string | null {
  const last = formatReviewDate(p.lastReviewed);
  const next = formatReviewDate(p.nextReview);
  if (!last && !next) return null;
  return [last && `Last reviewed ${last}`, next && `Next review ${next}`].filter(Boolean).join(" · ");
}

function PolicyRow({ p, complaintsLastYear, highlight, commonReview }: { p: PolicyLink; complaintsLastYear?: number; highlight?: string; commonReview?: string | null }) {
  // When every policy shares the same review dates they are said once, above
  // the list, instead of repeated on all 28 rows.
  const review = reviewLine(p);
  const showReview = review && review !== commonReview;
  const word = isWordFile(p.fileUrl);
  const titleId = `policy-${p.number}-${p._id}`.replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 print:break-inside-avoid">
      <div className="min-w-0 flex-1 basis-64">
        {/* Inline (not flex-wrap) so the number, title and badge flow as one
            line of text and wrap the same way on every row. */}
        <h3 id={titleId} className="font-medium text-ink">
          <span className="mr-2 text-ink/65 tabular-nums">
            <span className="sr-only">Policy </span>{p.number}
          </span>
          <Mark text={p.title} q={highlight} />{" "}
          <span className="ml-1 inline-block align-middle"><CategoryBadge category={p.category} /></span>
        </h3>
        {p.summary && <p className="mt-0.5 text-sm text-ink/70">{p.summary}</p>}
        {p.number === "26" && typeof complaintsLastYear === "number" && (
          <p className="mt-0.5 text-sm text-ink/70">Formal complaints in the last academic year: {complaintsLastYear}</p>
        )}
        {showReview && <p className="mt-1 text-sm text-ink/70">{review}</p>}
      </div>
      <span className="flex shrink-0 flex-wrap gap-2 print:hidden">
        {p.readUrl && (
          <Link
            href={p.readUrl}
            className="inline-flex min-h-10 items-center rounded-full bg-gold-500 px-4 text-sm font-semibold text-ink-900 hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
            aria-describedby={titleId}
          >
            Read online<span className="sr-only">: {p.title}</span>
          </Link>
        )}
        <a
          href={p.fileUrl}
          className="inline-flex min-h-10 items-center rounded-full border border-gold-500/60 px-4 text-sm font-semibold text-gold-900 hover:bg-gold-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
          target="_blank"
          rel="noopener noreferrer"
          aria-describedby={titleId}
        >
          {word ? "Open Word file" : "Open PDF"}
          <span className="sr-only">: {p.title} (opens in a new tab)</span>
        </a>
      </span>
      <span className="hidden text-xs text-ink/60 print:block">{p.fileUrl}</span>
    </li>
  );
}

/** The line under the Policies heading. Exported so the page can show it in its hero. */
export function PoliciesIntro({ intro, className = "mt-4 text-ink/70" }: { intro?: string; className?: string }) {
  return (
    <p className={className}>
      {intro || DEFAULT_INTRO} For our privacy notice, see the{" "}
      <Link href="/legal/privacy" className="font-semibold text-gold-700 underline">Privacy page</Link>.
    </p>
  );
}

/** Highlights the search term inside a title without breaking screen readers. */
function Mark({ text, q }: { text: string; q?: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-gold-100 px-0.5 text-ink">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function PolicyList({ policies, complaintsLastYear, labelledBy, highlight, commonReview }: { policies: PolicyLink[]; complaintsLastYear?: number; labelledBy: string; highlight?: string; commonReview?: string | null }) {
  return (
    <ul aria-labelledby={labelledBy} className="mt-4 divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
      {policies.map((p) => (
        <PolicyRow key={p._id} p={p} complaintsLastYear={complaintsLastYear} highlight={highlight} commonReview={commonReview} />
      ))}
    </ul>
  );
}

/**
 * The policy list, the safeguarding-lead box and the accessible-formats
 * note. The build renders it first (so the page works without JavaScript
 * and is indexable), then the browser re-reads the policies and settings
 * from the database, so an edit in the admin portal (which policies are
 * listed, their order, the Key documents box, the intro) shows here
 * straight away, with no site rebuild.
 *
 * Accessibility: one landmark per group with a real heading, a jump list
 * so keyboard and screen-reader users can skip straight to a group, a
 * search box that filters the list (announced via a live region), link
 * text that names the policy and says it opens a new tab, badges that
 * don't rely on colour alone, and a print layout that lists file
 * addresses.
 */
export function PolicyDirectory({ initialPolicies, initialSettings, showIntro = true }: { initialPolicies: PolicyLink[]; initialSettings: PolicySettings; showIntro?: boolean }) {
  const [policies, setPolicies] = useState<PolicyLink[]>(initialPolicies);
  const [settings, setSettings] = useState<PolicySettings>(initialSettings);
  const [query, setQuery] = useState("");
  const searchId = useId();

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
          admissionsEmail: liveSettings.admissionsEmail,
          policiesIntro: liveSettings.policiesIntro,
          policiesAccessibleFormatsNote: liveSettings.policiesAccessibleFormatsNote,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const q = query.trim();
  const filtered = useMemo(() => {
    if (!q) return policies;
    const needle = q.toLowerCase();
    return policies.filter((p) => `${p.number} ${p.title} ${p.summary || ""}`.toLowerCase().includes(needle));
  }, [policies, q]);

  const reviewLines = new Set(policies.map(reviewLine));
  const commonReview = policies.length > 1 && reviewLines.size === 1 ? [...reviewLines][0] : null;
  const keyDocuments = policies.filter((p) => p.featured);
  const groups = PARENT_QUESTION_GROUPS.map((g) => ({ ...g, items: filtered.filter((p) => p.parentQuestionCategory === g.key) })).filter((g) => g.items.length > 0);
  const ungrouped = filtered.filter((p) => !p.parentQuestionCategory);
  const email = settings.admissionsEmail || "globalacademy@tarbiyyah.co.uk";

  return (
    <>
      {showIntro && <PoliciesIntro intro={settings.policiesIntro} />}

      {(settings.safeguardingLeadName || settings.regulatoryStatusNote) && (
        <aside aria-label="Safeguarding contact" className="mb-8 rounded-2xl border border-gold-light/50 bg-cream p-5 text-sm text-ink/75">
          {settings.safeguardingLeadName && (
            <p>
              <span className="font-semibold text-ink">Designated Safeguarding Lead:</span> {settings.safeguardingLeadName}
              {settings.safeguardingLeadContact && <> · {settings.safeguardingLeadContact}</>}{" "}
              <Link href="/safeguarding" className="font-semibold text-gold-700 underline">Read our safeguarding approach</Link>
            </p>
          )}
          {settings.regulatoryStatusNote && <p className="mt-1">{settings.regulatoryStatusNote}</p>}
        </aside>
      )}

      {keyDocuments.length > 0 && !q && (
        <section aria-labelledby="key-documents-heading" className="mt-10 first:mt-0">
          <h2 id="key-documents-heading" className="font-serif text-xl font-semibold text-ink">Key documents</h2>
          <p className="mt-1 text-sm text-ink/70">Start here: the {keyDocuments.length === 1 ? "policy" : `${keyDocuments.length} policies`} every family should read. The full list follows below.</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {keyDocuments.map((p) => (
              <li key={p._id}>
                {/* The readable web page where there is one (better on a phone
                    than a PDF); otherwise the file, in a new tab. */}
                {p.readUrl ? (
                  <Link
                    href={p.readUrl}
                    className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-gold-500/60 bg-gold-100/40 px-4 py-3 text-sm font-semibold text-ink hover:bg-gold-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                  >
                    <span>{p.title}</span>
                    <span aria-hidden="true" className="text-gold-700">→</span>
                  </Link>
                ) : (
                  <a
                    href={p.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-gold-500/60 bg-gold-100/40 px-4 py-3 text-sm font-semibold text-ink hover:bg-gold-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                  >
                    <span>
                      {p.title}
                      <span className="sr-only"> ({isWordFile(p.fileUrl) ? "Word file" : "PDF"}, opens in a new tab)</span>
                    </span>
                    <span aria-hidden="true" className="text-gold-700">→</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 rounded-2xl border border-gold-light/50 bg-white p-4 first:mt-0 print:hidden">
        <label htmlFor={searchId} className="block text-sm font-semibold text-ink">Find a policy</label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a word, e.g. fees, bullying, attendance"
          autoComplete="off"
          className="mt-2 w-full rounded-xl border border-gold-light/60 bg-cream px-4 py-2.5 text-ink placeholder:text-ink/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
        />
        <p className="mt-2 text-sm text-ink/70" role="status" aria-live="polite">
          {q ? `${filtered.length} of ${policies.length} policies match “${q}”.` : `${policies.length} policies, grouped by the questions parents ask.${commonReview ? ` ${commonReview}.` : ""}`}
        </p>
        {!q && (
          <nav aria-label="Jump to a group" className="mt-3">
            <ul className="flex flex-wrap gap-2">
              {PARENT_QUESTION_GROUPS.filter((g) => policies.some((p) => p.parentQuestionCategory === g.key)).map((g) => (
                <li key={g.key}>
                  <a href={`#${g.anchor}`} className="inline-flex min-h-10 items-center rounded-full border border-gold-light/60 px-3 py-1.5 text-sm text-ink/80 hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">
                    {g.heading}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      {groups.map((group) => (
        <section key={group.key} id={group.anchor} aria-labelledby={`${group.anchor}-heading`} className="scroll-mt-24">
          <h2 id={`${group.anchor}-heading`} className="mt-12 font-serif text-2xl font-semibold text-ink">{group.heading}</h2>
          <PolicyList policies={group.items} complaintsLastYear={settings.complaintsLastYear} labelledBy={`${group.anchor}-heading`} highlight={q} commonReview={commonReview} />
        </section>
      ))}

      {ungrouped.length > 0 && (
        <section id="other-policies" aria-labelledby="other-policies-heading" className="scroll-mt-24">
          <h2 id="other-policies-heading" className="mt-12 font-serif text-2xl font-semibold text-ink">Other policies</h2>
          <PolicyList policies={ungrouped} complaintsLastYear={settings.complaintsLastYear} labelledBy="other-policies-heading" highlight={q} commonReview={commonReview} />
        </section>
      )}

      {q && filtered.length === 0 && (
        <p className="mt-8 text-ink/70">
          No policy matches “{q}”. Try a different word, or{" "}
          <button type="button" onClick={() => setQuery("")} className="font-semibold text-gold-700 underline">show all policies</button>.
        </p>
      )}

      <aside aria-labelledby="accessible-formats-heading" className="mt-12 rounded-2xl border border-gold-light/50 bg-cream p-5 text-sm text-ink/75">
        <h2 id="accessible-formats-heading" className="font-semibold text-ink">Need a different format?</h2>
        <p className="mt-1">
          {settings.policiesAccessibleFormatsNote || DEFAULT_ACCESSIBLE_NOTE}{" "}
          Email{" "}
          <a href={`mailto:${email}?subject=${encodeURIComponent("Policy in an accessible format")}`} className="font-semibold text-gold-700 underline">{email}</a>{" "}
          with the policy name and the format you need. See also our{" "}
          <Link href="/accessibility" className="font-semibold text-gold-700 underline">accessibility statement</Link>.
        </p>
      </aside>
    </>
  );
}
