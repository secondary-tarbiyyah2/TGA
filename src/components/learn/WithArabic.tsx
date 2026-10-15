import { Fragment } from "react";
import { splitWithArabic } from "@/lib/learn/arabicGlossary";

/**
 * Shows text with the Arabic script placed next to every Islamic Studies term
 * written in transliteration, e.g. "breaks التَّوْحِيد tawhid". Pupils see the
 * Arabic and the transliteration together, so they learn to read the Arabic.
 * Terms come from ARABIC_GLOSSARY; text with no known terms is unchanged.
 */
export function WithArabic({ text }: { text: string }) {
  const parts = splitWithArabic(text);
  if (parts.length === 1 && typeof parts[0] === "string") return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <Fragment key={i}>{p}</Fragment>
        ) : (
          <Fragment key={i}>
            <span lang="ar" dir="rtl" className="ar-gloss">
              {p.arabic}
            </span>{" "}
            <em>{p.term}</em>
          </Fragment>
        ),
      )}
    </>
  );
}
