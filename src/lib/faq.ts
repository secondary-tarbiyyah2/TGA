/*
 * FAQ helpers shared by the FAQs page, the homepage preview and the JSON-LD.
 *
 * Answers (seed and the faq_entries table) are plain text with a small,
 * safe formatting vocabulary, so an admin can give an answer structure
 * without writing HTML:
 *
 *   - a blank line starts a new paragraph
 *   - lines starting "1." or "1)" make a numbered list
 *   - lines starting "- " (or "* ") make a bulleted list
 *   - **bold** for a key fact
 *   - [label](/path) for a link (site paths, #anchors, https, mailto, tel)
 *
 * Nothing is ever inserted as HTML: the answer is parsed into blocks and
 * rendered as React elements (see FaqAnswer), so raw markup shows as text.
 */

export type FaqInline = { kind: "text"; text: string } | { kind: "bold"; children: FaqInline[] } | { kind: "link"; href: string; children: FaqInline[] };

export type FaqBlock = { kind: "p"; inline: FaqInline[] } | { kind: "ol" | "ul"; items: FaqInline[][] };

/** Display label and order for each stored category (the DB check constraint keeps the stored names). */
export const FAQ_CATEGORIES: { category: string; label: string }[] = [
  { category: "Admissions", label: "Admissions" },
  { category: "Fees", label: "Fees" },
  { category: "School day", label: "School day" },
  { category: "Curriculum", label: "Curriculum" },
  { category: "Islamic Studies", label: "Islamic Studies" },
  { category: "Technology", label: "Equipment and portal" },
  { category: "SEND", label: "SEND and support" },
  { category: "Safeguarding", label: "Safeguarding" },
];

export function faqCategoryLabel(category: string): string {
  return FAQ_CATEGORIES.find((c) => c.category === category)?.label ?? category;
}

/** Stable anchor for a question (the same in the seed and the database, whose ids differ). */
export function faqSlug(question: string): string {
  return question
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Only these link targets are rendered as links; anything else stays as text. */
export function safeFaqHref(href: string): string | null {
  const h = href.trim();
  if (/^\/(?!\/)/.test(h) || /^#[\w-]+$/.test(h) || /^https:\/\/[^\s]+$/i.test(h) || /^mailto:[^\s]+$/i.test(h) || /^tel:[+\d\s]+$/i.test(h)) return h;
  return null;
}

const INLINE = /\*\*(.+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

export function parseFaqInline(text: string): FaqInline[] {
  const out: FaqInline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) });
    if (m[1] != null) {
      out.push({ kind: "bold", children: parseFaqInline(m[1]) });
    } else {
      const href = safeFaqHref(m[3]);
      const children = parseFaqInline(m[2]);
      out.push(href ? { kind: "link", href, children } : { kind: "text", text: m[2] });
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

const OL = /^\s*\d{1,2}[.)]\s+(.*)$/;
const UL = /^\s*[-*•]\s+(.*)$/;

export function parseFaqAnswer(answer: string): FaqBlock[] {
  const blocks: FaqBlock[] = [];
  let para: string[] = [];
  let list: { kind: "ol" | "ul"; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ kind: "p", inline: parseFaqInline(para.join(" ")) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: list.kind, items: list.items.map(parseFaqInline) });
    list = null;
  };
  for (const raw of (answer || "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const ol = OL.exec(line);
    const ul = ol ? null : UL.exec(line);
    if (!line) {
      flushPara();
      flushList();
    } else if (ol || ul) {
      const kind = ol ? "ol" : "ul";
      flushPara();
      if (list && list.kind !== kind) flushList();
      if (!list) list = { kind, items: [] };
      list.items.push((ol ?? ul)![1]);
    } else if (list) {
      // A line straight after a list item continues it.
      list.items[list.items.length - 1] += ` ${line}`;
    } else {
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}

function inlineText(nodes: FaqInline[]): string {
  return nodes.map((n) => (n.kind === "text" ? n.text : inlineText(n.children))).join("");
}

/** The answer without formatting marks, for search and structured data. */
export function faqPlainText(answer: string): string {
  return parseFaqAnswer(answer)
    .map((b) => (b.kind === "p" ? inlineText(b.inline) : b.items.map((i, n) => `${b.kind === "ol" ? `${n + 1}.` : "-"} ${inlineText(i)}`).join(" ")))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
