"use client";

import { useState } from "react";
import { COMPASS_BY_HALF_TERM } from "@/content/compass";
import { AiDisclaimer, AiSpark } from "@/components/learn/AiBits";
import { Notice, ui } from "@/components/learn/ui";
import { aiAssist, aiErrorMessage, useAiStatus } from "@/lib/learn/aiAssist";
import { usePronounField } from "@/lib/learn/pronoun";
import type { ClassSummary, SubjectRating } from "./summary";
import { Select } from "@/components/learn/Select";

const RECIPE = COMPASS_BY_HALF_TERM;

/**
 * "Draft with AI" beside a pupil's report comment. The teacher jots bullet
 * points; the AI writes a draft from those and the figures already on the
 * page (first name only). The draft lands in a preview: the teacher chooses
 * to use it, and "Shorter" / "More formal" work on whatever is in the comment
 * box now, so their own edits are kept. Hidden when AI isn't set up.
 */
export function ReportAiDraft({
  childId,
  firstName,
  yearGroup,
  subject,
  rating,
  live,
  comment,
  onUse,
}: {
  /** Prefills the pronoun from the pupil's record (still editable). */
  childId?: string;
  firstName: string;
  yearGroup: string;
  subject: string;
  rating: SubjectRating;
  live: ClassSummary | undefined;
  comment: string;
  onUse: (text: string, how: "replace" | "append") => void;
}) {
  const status = useAiStatus();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const { value: pronoun, set: setPronoun, fromRecord } = usePronounField(childId);
  const [recipe, setRecipe] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [recipeLine, setRecipeLine] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!status?.configured || !status.can.report_comment) return null;

  const run = async (variant: "default" | "shorter" | "more_formal" | "try_again") => {
    setBusy(variant);
    setError(null);
    const h = live?.homework;
    const base = comment.trim() || draft || "";
    const r = await aiAssist("report_comment", {
      first_name: firstName,
      pronoun: pronoun || null,
      year_group: yearGroup === "Other classes" ? "" : yearGroup,
      subject,
      notes,
      attainment: rating.attainment || "",
      effort: rating.effort || "",
      attendance_pct: live?.attendance.rate ?? null,
      homework: h && h.total > 0 ? `${h.done} of ${h.total} tasks handed in` : "",
      assessment_avg: live?.assessments.average_percent ?? null,
      recipe_value: recipe,
      want_recipe_line: !!recipe,
      variant,
      current_draft: variant === "default" ? "" : variant === "try_again" ? draft || "" : base,
    });
    setBusy(null);
    if (!r.ok) return setError(aiErrorMessage(r));
    setDraft(String(r.comment || ""));
    setRecipeLine(typeof r.recipe_line === "string" && r.recipe_line ? r.recipe_line : null);
  };

  const canReword = !!(comment.trim() || draft);

  return (
    <div className="mt-3 rounded-xl border border-teal-700/20 bg-teal-50/40 p-3">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={`${ui.btnSecondary} ${ui.sm}`}>
          <AiSpark /> Draft with AI
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <AiSpark className="h-4 w-4 text-teal-700" /> Draft with AI
            </p>
            <button type="button" onClick={() => setOpen(false)} className={ui.btnLink}>
              Close
            </button>
          </div>
          <label className={ui.label}>
            Your bullet points
            <textarea rows={3} maxLength={1500} value={notes} onChange={(e) => setNotes(e.target.value)} className={`mt-1 ${ui.textarea}`} placeholder={"- confident with fractions\n- rushes written answers\n- next: show working"} />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={ui.label}>
              Pronoun
              <Select value={pronoun} onChange={(e) => setPronoun(e.target.value)} className={`mt-1 ${ui.select}`}>
                <option value="">Use their name</option>
                <option value="he">he / him</option>
                <option value="she">she / her</option>
              </Select>
              {fromRecord && <span className={`mt-1 block font-normal ${ui.hint}`}>From {firstName}&apos;s record. Change it here if needed.</span>}
            </label>
            <label className={ui.label}>
              Tarbiyyah Compass value this half term (optional)
              <Select value={recipe} onChange={(e) => setRecipe(e.target.value)} className={`mt-1 ${ui.select}`}>
                <option value="">None</option>
                {RECIPE.map((r) => (
                  <option key={r.letter} value={r.word}>{`${r.letter}: ${r.word} (${r.gloss}), ${r.halfTerm}`}</option>
                ))}
              </Select>
            </label>
          </div>
          <p className={ui.hint}>Uses {firstName}&apos;s first name, your notes and the figures and judgements on this page. Nothing else is sent.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy || (notes.trim().length < 3 && !rating.attainment && !rating.effort)} onClick={() => run("default")} className={`${ui.btnPrimary} ${ui.sm}`}>
              {busy === "default" ? "Writing…" : draft ? "Write again from notes" : "Write draft"}
            </button>
            <button type="button" disabled={!!busy || !canReword} onClick={() => run("shorter")} className={`${ui.btnSecondary} ${ui.sm}`}>
              {busy === "shorter" ? "Shortening…" : "Shorter"}
            </button>
            <button type="button" disabled={!!busy || !canReword} onClick={() => run("more_formal")} className={`${ui.btnSecondary} ${ui.sm}`}>
              {busy === "more_formal" ? "Rewording…" : "More formal"}
            </button>
            <button type="button" disabled={!!busy || !draft} onClick={() => run("try_again")} className={`${ui.btnSecondary} ${ui.sm}`}>
              {busy === "try_again" ? "Writing…" : "Try again"}
            </button>
          </div>
          {canReword && <p className={ui.hint}>Shorter and More formal rework what is in the comment box now, so your edits are kept.</p>}
          {error && <Notice tone="bad">{error}</Notice>}
          {draft && (
            <div className="rounded-lg border border-gold-light bg-white p-3">
              <p className="whitespace-pre-wrap text-sm text-ink/90">{draft}</p>
              {recipeLine && <p className="mt-2 border-t border-gold-light/60 pt-2 text-sm text-ink/80">Compass: {recipeLine}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => onUse(draft, "replace")} className={`${ui.btnPrimary} ${ui.sm}`}>
                  {comment.trim() ? "Replace my comment" : "Use draft"}
                </button>
                {comment.trim() && (
                  <button type="button" onClick={() => onUse(draft, "append")} className={`${ui.btnSecondary} ${ui.sm}`}>
                    Add to the end
                  </button>
                )}
                {recipeLine && (
                  <button type="button" onClick={() => onUse(recipeLine, "append")} className={`${ui.btnSecondary} ${ui.sm}`}>
                    Add Compass line
                  </button>
                )}
              </div>
              <AiDisclaimer className="mt-2" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
