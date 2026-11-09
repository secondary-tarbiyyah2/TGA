import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { getPolicyTexts, POLICY_META_FIELDS } from "@/lib/policies";
import { outlinePolicyHtml } from "@/lib/policyOutline";
import { PolicyOutline } from "@/components/PolicyOutline";

/**
 * A policy as a readable web page, generated from the same text as its PDF
 * (see src/lib/policies.ts). This is the accessible format the Equality
 * policy promises: real headings, real tables, screen-reader friendly, and
 * it resizes with the site's text-size controls. The PDF stays the
 * downloadable, signable version.
 */

export const dynamicParams = false;

function labelTableCells(html: string): string {
  return html.replace(/<table>([\s\S]*?)<\/table>/g, (_m, inner: string) => {
    const heads = [...inner.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((h) => h[1].replace(/<[^>]+>/g, "").replace(/"/g, "&quot;").trim());
    let col = 0;
    const body = inner.replace(/<tr>/g, () => { col = 0; return "<tr>"; }).replace(/<td([^>]*)>/g, (_t, attrs: string) => {
      const label = heads[col] || "";
      col += 1;
      return `<td${attrs} data-label="${label}">`;
    });
    return `<div class="table-wrap"><table>${body}</table></div>`;
  });
}

export async function generateStaticParams() {
  return (await getPolicyTexts()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const policy = (await getPolicyTexts()).find((p) => p.slug === slug);
  if (!policy) return {};
  return pageMetadata({
    title: policy.title,
    description: policy.meta.subtitle || `${policy.title} of Tarbiyyah Global Academy.`,
    path: `/policies/${policy.slug}`,
  });
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const policy = (await getPolicyTexts()).find((p) => p.slug === slug);
  if (!policy) notFound();

  // On phones each table row becomes a stacked card, with the column heading
  // shown before each cell (data-label, see .policy-body td::before), so no
  // table needs sideways scrolling; wider screens keep the normal grid.
  // Each section heading gets an id, and the numbered outline down the side
  // (a "Contents" button on phones) is built from them.
  const { html, outline } = outlinePolicyHtml(labelTableCells(await marked.parse(policy.body, { gfm: true })));
  // Lines the hero text up with the reading column beside the outline.
  const column = outline.length >= 2 ? "max-w-3xl lg:ml-[17.5rem] xl:ml-[20.5rem]" : "max-w-3xl mx-auto";
  const metaRows = POLICY_META_FIELDS.filter((f) => policy.meta[f.key]);

  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <div className={column}>
          <Kicker>Policy {policy.number}</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">{policy.title}</h1>
          {policy.meta.subtitle && <p className="mt-4 text-lg text-ink/75">{policy.meta.subtitle}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={`/policies/${policy.slug}.pdf`} className="inline-flex items-center justify-center rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 hover:brightness-95">
              Download as PDF
            </a>
            <Link href="/policies" className="inline-flex items-center justify-center rounded-full border-[1.5px] border-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 hover:bg-gold-100">
              All policies
            </Link>
          </div>
          </div>
        </Container>
      </section>

      <section className="section-pad">
        <Container>
          <PolicyOutline outline={outline} top={80}>
          <div className={outline.length >= 2 ? "max-w-3xl" : "mx-auto max-w-3xl"}>
          {metaRows.length > 0 && (
            <table className="mb-10 w-full border-collapse text-sm">
              <tbody>
                {metaRows.map((f) => (
                  <tr key={f.key} className="border-b border-gold-light/40">
                    <th scope="row" className="w-1/3 py-2 pr-4 text-left align-top font-semibold text-ink">{f.label}</th>
                    <td className="py-2 align-top text-ink/80">{policy.meta[f.key]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="policy-body" dangerouslySetInnerHTML={{ __html: html }} />
          <p className="mt-10 border-t border-gold-light/40 pt-4 text-sm text-ink/65">
            Approved by {policy.meta.approvedBy || "the Headteacher"}
            {policy.meta.nextReview ? ` · Next review due ${policy.meta.nextReview}` : ""}. Available in large print or another accessible format on request.
          </p>
          </div>
          </PolicyOutline>
        </Container>
      </section>
    </>
  );
}
