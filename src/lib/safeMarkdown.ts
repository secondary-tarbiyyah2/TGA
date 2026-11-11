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

// A run of Arabic words (letters, harakat and the honorific ligatures such as
// U+FDFA), with the spaces between them.
const ARABIC_RUN = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+(?:\s+[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+)*/g;

/**
 * Marks Arabic in rendered HTML as Arabic, right to left, so it gets the Arabic
 * font (`:lang(ar)` in globals.css) and sits correctly inside an English
 * sentence (e.g. "The Prophet صلى الله عليه وسلم said"). Only text between
 * tags is touched, never attributes.
 */
export function markArabic(html: string): string {
  return html
    .split(/(<[^>]*>)/)
    .map((part) => (part.startsWith("<") ? part : part.replace(ARABIC_RUN, (run) => `<span lang="ar" dir="rtl">${run}</span>`)))
    .join("");
}

/** Markdown to HTML with raw HTML escaped and unsafe link targets dropped. */
export function renderSafeMarkdown(md: string): string {
  return markArabic(safe.parse(md, { async: false }) as string);
}
