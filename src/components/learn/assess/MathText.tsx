import { Fragment } from "react";

/**
 * Shows question text with real superscripts. New papers already use
 * superscript characters (x⁵); papers made before that wrote "x^5", so any
 * "^n", "^-n" or "^(…)" is turned into <sup> here. Never shows a caret.
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  const parts = String(text ?? "").split(/(\^\([^)]*\)|\^[-−]?[\w]+)/g);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.startsWith("^") ? (
          <sup key={i} className="text-[0.7em]">{p.replace(/^\^\(?/, "").replace(/\)$/, "").replace(/-/g, "−")}</sup>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </span>
  );
}

/** Plain-text version (e.g. for aria-labels): "^5" becomes "⁵". */
export function mathPlain(text: string): string {
  const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻", "−": "⁻", n: "ⁿ" };
  return String(text ?? "").replace(/\^\(?([-−]?\w+)\)?/g, (_, e: string) => e.split("").map((c) => SUP[c] ?? c).join(""));
}
