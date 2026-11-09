/**
 * The side outline for a policy page ("1. Statement of Intent", "2. …"),
 * built from the policy's own section headings (the `## 1. Heading` lines,
 * which marked turns into <h2>). Gives each <h2> an id so the outline can
 * link to it and highlight it while reading. Pure string work, so it runs
 * at build time on the public page and in the browser in the portal.
 */

export type OutlineItem = { id: string; num: string; label: string };

function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Adds ids to every <h2> in the policy HTML and returns the numbered outline. */
export function outlinePolicyHtml(html: string): { html: string; outline: OutlineItem[] } {
  const outline: OutlineItem[] = [];
  const used = new Set<string>();
  const out = html.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/g, (_m, attrs: string, inner: string) => {
    const text = plainText(inner);
    const m = text.match(/^(\d+(?:\.\d+)*)\.?\s+(.+)$/);
    const num = m ? m[1] : String(outline.length + 1);
    const label = m ? m[2] : text;
    let id = `section-${slugify(`${num} ${label}`) || outline.length + 1}`;
    while (used.has(id)) id += "-x";
    used.add(id);
    outline.push({ id, num, label });
    const cleanAttrs = attrs.replace(/\s(id|tabindex)="[^"]*"/g, "");
    return `<h2${cleanAttrs} id="${id}" tabindex="-1">${inner}</h2>`;
  });
  return { html: out, outline };
}
