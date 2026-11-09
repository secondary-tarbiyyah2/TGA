import { Marked, type Tokens } from "marked";

// Markdown to HTML for text staff write in the portal (policy bodies), which
// is then put on the page with dangerouslySetInnerHTML. Plain `marked` passes
// raw HTML (<script>, <img onerror>) and javascript: links straight through,
// so a hijacked staff account could have planted script on the public site.
// Security audit (T20): raw HTML is shown as text, and links/images may only
// point at http(s), mailto, tel, the same site or a #section.

const SAFE_URL = /^(https?:|mailto:|tel:|\/(?!\/)|#|\.{1,2}\/|[^:/?#]+(?:[/?#]|$))/i;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** A URL that is safe to put in href/src, or null. Control characters and spaces are stripped first, as browsers do. */
export function safeUrl(href: string | null | undefined): string | null {
  const h = String(href ?? "").replace(/[\u0000- \u007f]/g, "");
  if (!h || !SAFE_URL.test(h)) return null;
  return h;
}

const safe = new Marked({
  gfm: true,
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag): string {
      return escapeHtml(token.text);
    },
    link(this: { parser: { parseInline: (t: Tokens.Generic[]) => string } }, token: Tokens.Link): string {
      const text = this.parser.parseInline(token.tokens);
      const href = safeUrl(token.href);
      if (!href) return text;
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
      return `<a href="${escapeHtml(href)}"${title}>${text}</a>`;
    },
    image(token: Tokens.Image): string {
      const src = safeUrl(token.href);
      if (!src) return escapeHtml(token.text);
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(token.text)}"${title}>`;
    },
  },
});

/** Markdown to HTML with raw HTML escaped and unsafe link targets dropped. */
export function renderSafeMarkdown(md: string): string {
  return safe.parse(md, { async: false }) as string;
}
