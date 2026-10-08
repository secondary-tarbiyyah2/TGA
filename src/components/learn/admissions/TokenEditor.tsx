"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from "react";
import { TOKEN_DOCS } from "@/components/learn/admissions/messageTemplates";

// A plain <textarea> with a highlighter underneath. The stored value stays
// ordinary text with {{tokens}}; a transparent-text copy sits behind the
// textarea and paints a light pill behind every {{token}}. The pill uses a
// box-shadow (no padding or border), so the copy wraps exactly like the
// textarea and the two never drift apart. The textarea takes its height from
// the copy, so there is no inner scrollbar to keep in sync.

const TOKEN_RE = /(\{\{\s*[#/]?\w+\s*\}\})/g;
const INNER_RE = /^\{\{\s*([#/]?)(\w+)\s*\}\}$/;

type Tone = "known" | "unknown" | "block";
const TONE_STYLE: Record<Tone, CSSProperties> = {
  known: { backgroundColor: "#ccfbf1", boxShadow: "0 0 0 2px #ccfbf1" },
  block: { backgroundColor: "#e7e5e4", boxShadow: "0 0 0 2px #e7e5e4" },
  unknown: { backgroundColor: "#fecaca", boxShadow: "0 0 0 2px #fecaca" },
};

function toneOf(raw: string, known: ReadonlySet<string> | null): Tone {
  const m = raw.match(INNER_RE);
  if (!m) return "unknown";
  const name = m[2];
  if (name === "PAYMENT_LINK") return "known";
  if (known && !known.has(name)) return "unknown";
  if (!known) return "unknown";
  return m[1] ? "block" : "known";
}

export type TokenEditorHandle = { insert: (text: string) => void; focus: () => void };

type Props = {
  value: string;
  onChange: (v: string) => void;
  /** Names of values that exist ({{name}}). Null means none are known, so every token is flagged (a finished email should have none left). */
  known: ReadonlySet<string> | null;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  ariaLabel?: string;
  onFocus?: () => void;
};

const TEXT = "px-3 py-2 font-sans text-[13px] leading-6 whitespace-pre-wrap break-words";

export const TokenEditor = forwardRef<TokenEditorHandle, Props>(function TokenEditor({ value, onChange, known, rows = 14, maxLength, disabled, ariaLabel = "Message", onFocus }, ref) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
    insert: (text: string) => {
      const ta = taRef.current;
      const start = ta ? ta.selectionStart : value.length;
      const end = ta ? ta.selectionEnd : value.length;
      const next = value.slice(0, start) + text + value.slice(end);
      if (maxLength && next.length > maxLength) return;
      onChange(next);
      const caret = start + text.length;
      requestAnimationFrame(() => {
        ta?.focus();
        ta?.setSelectionRange(caret, caret);
      });
    },
  }));

  const parts = useMemo(() => value.split(TOKEN_RE), [value]);

  return (
    <div className="relative mt-1 rounded-lg border border-gold-light/60 bg-white focus-within:ring-2 focus-within:ring-teal-600/40" style={{ minHeight: `calc(${rows} * 1.5rem + 1rem + 2px)` }}>
      <div aria-hidden="true" className={`pointer-events-none text-transparent ${TEXT}`}>
        {parts.map((p, i) =>
          i % 2 === 1 ? (
            <mark key={i} className="rounded text-transparent" style={TONE_STYLE[toneOf(p, known)]}>
              {p}
            </mark>
          ) : (
            <span key={i}>{p}</span>
          )
        )}
        {"​"}
      </div>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        maxLength={maxLength}
        disabled={disabled}
        aria-label={ariaLabel}
        spellCheck
        className={`absolute inset-0 h-full w-full resize-none overflow-hidden rounded-lg border-0 bg-transparent text-ink outline-none disabled:opacity-60 ${TEXT}`}
      />
    </div>
  );
});

/** Tokens in the text that are not in `known` (block markers like {{#x}} count by their name). */
export function unknownTokensIn(text: string, known: ReadonlySet<string> | null): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([#/]?)(\w+)\s*\}\}/g)) {
    if (m[2] === "PAYMENT_LINK") continue;
    if (!known || !known.has(m[2])) found.add(m[1] + m[2]);
  }
  return [...found];
}

/** "Insert variable" button with a searchable list of every value a template can use. */
export function VariablePicker({ onPick }: { onPick: (token: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return TOKEN_DOCS.filter((t) => !s || t.token.includes(s) || t.description.toLowerCase().includes(s));
  }, [q]);
  return (
    <div className="relative inline-block" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)} className="rounded-lg border border-gold-light bg-white px-3 py-1 text-xs font-semibold text-ink/80 hover:bg-cream">
        Insert variable ▾
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-80 max-w-[85vw] rounded-lg border border-gold-light bg-white p-2 shadow-lg">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search values" aria-label="Search values" className="mb-2 w-full rounded-md border border-gold-light/60 px-2 py-1 text-xs" />
          <ul className="max-h-64 overflow-auto">
            {list.map((t) => (
              <li key={t.token}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(`{{${t.token}}}`);
                    setOpen(false);
                    setQ("");
                  }}
                  className="block w-full rounded-md px-2 py-1 text-left hover:bg-cream"
                >
                  <span className="rounded bg-teal-100 px-1 text-xs text-teal-900">{`{{${t.token}}}`}</span>
                  <span className="mt-0.5 block text-[11px] text-ink/60">{t.description}</span>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="px-2 py-1 text-xs text-ink/65">No match.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
