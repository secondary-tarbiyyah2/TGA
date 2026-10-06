import type { ReactNode } from "react";

// The portal's tiny post formatting. Posts are stored as plain text using
// four marks only, so there is never any HTML to sanitise:
//   **bold**   *italic*   ++underline++   and lines starting "- " for a list.

export type LinkItem = { label: string; url: string };

/** Normalise a pasted web address: trims, adds https:// when missing, http(s) only. Null when unusable. */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  const t = (raw || "").trim();
  if (!t || /\s/.test(t)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Defensive read of a jsonb [{label, url}] column. */
export function cleanLinks(v: unknown): LinkItem[] {
  if (!Array.isArray(v)) return [];
  const out: LinkItem[] = [];
  for (const x of v) {
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const url = safeHttpUrl(typeof o.url === "string" ? o.url : null);
      if (url) out.push({ label: typeof o.label === "string" && o.label.trim() ? o.label.trim() : url, url });
    }
  }
  return out;
}

const INLINE = [
  { re: /\*\*(.+?)\*\*/, wrap: (k: string, c: ReactNode) => <strong key={k}>{c}</strong> },
  { re: /\+\+(.+?)\+\+/, wrap: (k: string, c: ReactNode) => <u key={k}>{c}</u> },
  { re: /\*(.+?)\*/, wrap: (k: string, c: ReactNode) => <em key={k}>{c}</em> },
];

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  let best: { index: number; len: number; inner: string; wrap: (k: string, c: ReactNode) => ReactNode } | null = null;
  for (const rule of INLINE) {
    const m = rule.re.exec(text);
    if (m && (best === null || m.index < best.index)) best = { index: m.index, len: m[0].length, inner: m[1], wrap: rule.wrap };
  }
  if (!best) return [text];
  const before = text.slice(0, best.index);
  const after = text.slice(best.index + best.len);
  return [
    ...(before ? [before] : []),
    best.wrap(`${keyPrefix}-${best.index}`, renderInline(best.inner, `${keyPrefix}-${best.index}i`)),
    ...renderInline(after, `${keyPrefix}-${best.index}a`),
  ];
}

/** Render marked-up text as React nodes (no dangerouslySetInnerHTML anywhere). */
export function renderMarkup(text: string): ReactNode {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      const items = list;
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-5">
          {items.map((li, i) => (
            <li key={i}>{renderInline(li, `li${blocks.length}-${i}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((line, i) => {
    if (/^- /.test(line)) {
      list.push(line.slice(2));
      return;
    }
    flush();
    if (line.trim() === "") blocks.push(<div key={`sp-${i}`} className="h-2" aria-hidden="true" />);
    else blocks.push(<p key={`p-${i}`}>{renderInline(line, `p${i}`)}</p>);
  });
  flush();
  return <>{blocks}</>;
}

export type Edit = { value: string; selStart: number; selEnd: number };

/** Wrap the selection in a mark (or insert an empty pair with the cursor between). */
export function wrapSelection(value: string, start: number, end: number, mark: string): Edit {
  const sel = value.slice(start, end);
  const next = value.slice(0, start) + mark + sel + mark + value.slice(end);
  return { value: next, selStart: start + mark.length, selEnd: end + mark.length };
}

/** Turn every line touched by the selection into a "- " list item (or back again if all already are). */
export function toggleList(value: string, start: number, end: number): Edit {
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const nl = value.indexOf("\n", end);
  const lineEnd = nl === -1 ? value.length : nl;
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const allList = lines.every((l) => l.startsWith("- "));
  const changed = lines.map((l) => (allList ? l.slice(2) : l.startsWith("- ") ? l : `- ${l}`)).join("\n");
  const next = value.slice(0, lineStart) + changed + value.slice(lineEnd);
  return { value: next, selStart: lineStart, selEnd: lineStart + changed.length };
}
