"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseClient, getEdgeFunctionUrl } from "@/lib/supabase/client";
import { feeBands as fallbackFeeBands } from "@/content/seed";
import type { FeeBand, Discount } from "@/content/seed";
import { FeeEstimator } from "@/components/FeeEstimator";
import { LineIcon } from "@/components/eligibility/LineIcon";
import { formatGBP } from "@/lib/format";
import { leadRef } from "@/lib/leadRef";
import { DEFAULT_QUIZ_CONFIG } from "@/lib/quiz/defaultConfig";
import { questionsByStep, type QuizAnswers, type QuizConfig } from "@/lib/quiz/schema";
import { evaluateRules, isQuestionVisible } from "@/lib/quiz/rules";
import { detectTimezone, TIMEZONE_OPTIONS, schoolDayTimeInfo, formatLocalHour } from "@/lib/quiz/timezone";
import { feeBandForYearGroup, keyStageForYearGroup } from "@/lib/quiz/feeBand";
import { useSampleWeek } from "@/lib/quiz/useSampleWeek";
import { generateId, recordQuizEvent, upsertQuizSession } from "@/lib/quiz/session";

type YearGroupOption = { id: string; name: string };

const FALLBACK_YEAR_GROUPS = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "Year 7", "Year 8", "Year 9", "Year 10", "Year 11"];

const btnPrimary = "rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95 disabled:opacity-50";
const btnSecondary = "rounded-full border-[1.5px] border-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:bg-gold-100";

function capitaliseName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part))
    .join(" ");
}

/**
 * The public "fit check" (/eligibility). Phases, in order:
 *   1. the configured question steps (a step whose questions are all hidden
 *      by showWhen is skipped, so the progress count is honest);
 *   2. a contact step, BEFORE the result, so a family who has invested a
 *      minute is asked for an email while they are still engaged, with a
 *      plain "skip" for anyone who just wants to see the summary;
 *   3. the summary itself, built only from published facts (key stage, the
 *      live day in their time zone, the fee band) plus the config's
 *      next-step text and flags. No level estimates, no timetable promises.
 */
export function YourChildsWeekQuiz({
  feeBands: feeBandsProp,
  siblingDiscountPercent,
  siblingDiscountNote,
  discounts,
  configOverride,
  previewMode = false,
}: {
  feeBands?: FeeBand[];
  siblingDiscountPercent?: number;
  siblingDiscountNote?: string;
  discounts?: Discount[];
  /** Admin "preview as a parent" mode passes its own draft config here so the live published version is never used for a preview. */
  configOverride?: QuizConfig;
  previewMode?: boolean;
} = {}) {
  const feeBands = feeBandsProp && feeBandsProp.length > 0 ? feeBandsProp : fallbackFeeBands;
  const [liveConfig, setLiveConfig] = useState<{ config: QuizConfig; versionId: string | null; publishedAt: string | null } | null>(null);

  useEffect(() => {
    if (configOverride) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from("quiz_config_versions")
      .select("id, content, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(
        ({ data }) => {
          if (cancelled || !data?.content) return;
          setLiveConfig({ config: data.content as unknown as QuizConfig, versionId: data.id as string, publishedAt: (data.published_at as string) ?? null });
        },
        () => undefined
      );
    return () => {
      cancelled = true;
    };
  }, [configOverride]);

  const config = configOverride ?? liveConfig?.config ?? DEFAULT_QUIZ_CONFIG;
  const allSteps = useMemo(() => questionsByStep(config.questions), [config.questions]);

  const [yearGroups, setYearGroups] = useState<YearGroupOption[] | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("year_groups")
      .select("id, name")
      .order("sort_order")
      .then(
        ({ data }) => {
          if (data && data.length > 0) setYearGroups(data as YearGroupOption[]);
        },
        () => undefined
      );
  }, []);
  const yearGroupNames = yearGroups?.map((y) => y.name) ?? FALLBACK_YEAR_GROUPS;

  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [timezone, setTimezone] = useState("");

  // Only steps with at least one question visible for the current answers
  // count, so "Question 2 of 3" stays true when a conditional step is hidden.
  const steps = useMemo(() => allSteps.filter((s) => s.questions.some((q) => isQuestionVisible(q, answers))), [allSteps, answers]);

  // index into `steps`; steps.length = contact step; steps.length + 1 = result
  const [stepIndex, setStepIndex] = useState(0);
  const [sessionRowId, setSessionRowId] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [website, setWebsite] = useState(""); // honeypot

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser timezone only known post-mount
    setTimezone(detectTimezone());
  }, []);

  // Start the anonymous session the moment the quiz is actually used (not in
  // admin preview mode, which must never write analytics/PII-adjacent rows).
  useEffect(() => {
    if (previewMode) return;
    let cancelled = false;
    (async () => {
      const id = await upsertQuizSession({
        rowId: null,
        quizConfigVersionId: liveConfig?.versionId ?? null,
        yearGroupId: null,
        timezone: null,
        currentStep: 0,
        answers: {},
      });
      if (!cancelled && id) {
        setSessionRowId(id);
        recordQuizEvent(id, "started");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode]);

  const yearGroupAnswer = answers.year_group ?? "";
  const yearGroupId = yearGroups?.find((y) => y.name === yearGroupAnswer)?.id ?? null;

  function setAnswer(key: string, value: string) {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    if (!previewMode) {
      recordQuizEvent(sessionRowId, "step_answered", stepIndex);
      upsertQuizSession({
        rowId: sessionRowId,
        quizConfigVersionId: liveConfig?.versionId ?? null,
        yearGroupId: key === "year_group" ? yearGroups?.find((y) => y.name === value)?.id ?? null : yearGroupId,
        timezone,
        currentStep: stepIndex,
        answers: next,
      });
    }
  }

  function goToStep(index: number) {
    setStepIndex(index);
    if (!previewMode) recordQuizEvent(sessionRowId, "step_viewed", index);
  }

  const totalSteps = steps.length;
  const isContactStep = stepIndex === totalSteps;
  const isResultStep = stepIndex > totalSteps;
  const currentStepQuestions = (steps[stepIndex]?.questions ?? []).filter((q) => isQuestionVisible(q, answers));
  // The contact step counts as the final question for the progress bar.
  const progress = Math.round((Math.min(stepIndex, totalSteps + 1) / (totalSteps + 1)) * 100);
  const stepAnswered = currentStepQuestions.length > 0 && currentStepQuestions.every((q) => !!answers[q.key]);

  function advance() {
    const next = stepIndex + 1;
    if (next === steps.length && !previewMode) {
      // Every question answered: the anonymous session is complete whether
      // or not the family goes on to leave an email.
      recordQuizEvent(sessionRowId, "completed", stepIndex);
      upsertQuizSession({
        rowId: sessionRowId,
        quizConfigVersionId: liveConfig?.versionId ?? null,
        yearGroupId,
        timezone,
        currentStep: next,
        answers,
        completed: true,
      });
    }
    goToStep(next);
  }

  // ── result-screen derived data ───────────────────────────────────────
  const timeInfo = timezone ? schoolDayTimeInfo(timezone) : null;
  const evaluated = useMemo(() => evaluateRules(config, answers), [config, answers]);
  const sectionActive = (key: string) => config.resultSections.find((s) => s.key === key)?.active;
  const sampleWeek = useSampleWeek(
    isResultStep && sectionActive("sample_week") ? yearGroupAnswer || null : null,
    isResultStep && sectionActive("sample_week") ? timezone || null : null
  );
  const feeBand = yearGroupAnswer ? feeBandForYearGroup(yearGroupAnswer, feeBands) : null;
  const keyStage = yearGroupAnswer ? keyStageForYearGroup(yearGroupAnswer) : null;
  const orderedSections = [...config.resultSections].filter((s) => s.active).sort((a, b) => a.order - b.order);

  const firstName = contactName ? capitaliseName(contactName).split(" ")[0] : "";
  // Without a name, "{name}, here is..." reads as broken English with a
  // filler word, so drop the name clause and capitalise what's left.
  const resultHeading = firstName
    ? config.resultHeading.replace("{name}", firstName)
    : config.resultHeading.replace(/\{name\},?\s*/, "").replace(/^[a-z]/, (c) => c.toUpperCase());

  const liveDayText = timeInfo
    ? `Live lessons run 9am to 3pm UK time, Monday to Thursday, and finish at 12 noon on Fridays. In your time zone that is about ${formatLocalHour(timeInfo.localStart)} to ${formatLocalHour(timeInfo.localEnd)}, and ${formatLocalHour(timeInfo.localStart)} to ${formatLocalHour(timeInfo.localStart + 3)} on Fridays.`
    : "";
  const liveDayConcern = timeInfo?.concern
    ? "That is outside the hours most children learn well. It does not rule TGA out, but it is the first thing to talk through on a call before you apply."
    : "";

  const bookCallHref = `/book-a-call?name=${encodeURIComponent(contactName)}&email=${encodeURIComponent(contactEmail)}&year=${encodeURIComponent(yearGroupAnswer)}&notes=${encodeURIComponent(
    `From the fit check. Time zone: ${timezone}${timeInfo?.concern ? " (TIME-ZONE CONCERN: live lessons fall outside 7am-9pm locally)" : ""}. Start: ${answers.start_when ?? "n/a"}.`
  )}#book`;

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    setLeadError(null);
    if (website) return; // honeypot
    if (!consentChecked) {
      setLeadError("Please tick the box so we can email your summary.");
      return;
    }
    setLeadSubmitting(true);
    const supabase = getSupabaseClient();
    if (supabase) {
      const ref = await leadRef(contactEmail);
      // The id is generated here, not read back via .select(): quiz_leads
      // deliberately has no SELECT policy for anon (enforced by RLS and
      // proven in quiz_v2_rls.test.sql), so a RETURNING would be reported
      // by Postgres as an RLS violation, indistinguishable from the insert
      // itself being rejected. Same pattern as quiz_sessions in session.ts.
      const leadId = generateId();
      const { error } = await supabase.from("quiz_leads").insert({
        id: leadId,
        session_id: sessionRowId,
        lead_ref: ref,
        email: contactEmail.trim().toLowerCase(),
        parent_name: contactName || null,
        consent_given_at: new Date().toISOString(),
        consent_text: config.consentText,
        year_group_id: yearGroupId,
        answers_snapshot: answers,
      });
      if (error) {
        setLeadError("Something went wrong saving your details. Please try again, or skip and book a call instead.");
        setLeadSubmitting(false);
        return;
      }

      // The lead row is saved either way; this only decides whether we can
      // honestly record that an email went out (feeds the admin "emails
      // sent" count, which must never count deliveries that didn't happen).
      const feeSummary = feeBand
        ? `${feeBand.yearGroupRange}: ${formatGBP(feeBand.annualFee)} for January to July 2027, or ${formatGBP(feeBand.schedule?.termlyAmount ?? feeBand.termlyFee)} × 2 payments, or ${formatGBP(feeBand.schedule?.monthlyAmount ?? feeBand.monthlyFee)} × ${feeBand.schedule?.instalments ?? 7} monthly payments${siblingDiscountNote ? ` · ${siblingDiscountNote}` : ""}`
        : "";
      const functionUrl = getEdgeFunctionUrl("quiz-send-plan");
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (functionUrl && anonKey) {
        try {
          const res = await fetch(functionUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
            body: JSON.stringify({
              leadId,
              yearGroup: yearGroupAnswer,
              keyStage: keyStage ? `${keyStage.title} (${keyStage.range})` : "",
              liveDayText: [liveDayText, liveDayConcern].filter(Boolean).join(" "),
              timezoneConcern: Boolean(timeInfo?.concern),
              sampleSlots: [],
              startingPoints: {},
              feeSummary,
              timezoneFlagText: "",
              texts: [...evaluated.texts, ...evaluated.flags.map((f) => f.text)],
            }),
          });
          const result = await res.json().catch(() => ({ ok: false }));
          if (result?.ok) recordQuizEvent(sessionRowId, "pdf_email_sent", stepIndex);
        } catch {
          // Lead already saved; a failed send only means the event isn't recorded.
        }
      }
    }
    setLeadSubmitting(false);
    setLeadSubmitted(true);
    if (isContactStep) goToStep(totalSteps + 1);
  }

  if (allSteps.length === 0) {
    return <p className="text-center text-ink/65">The fit check isn&apos;t configured yet, please check back shortly.</p>;
  }

  return (
    <div className="mx-auto max-w-xl">
      {!isResultStep && (
        <div className="mb-8">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gold-100">
            <div className="h-full rounded-full bg-gold-500 transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs font-medium text-ink/65">
            {isContactStep ? "Last step" : `Question ${stepIndex + 1} of ${totalSteps}`}
          </p>
        </div>
      )}

      {!isResultStep &&
        !isContactStep &&
        currentStepQuestions.map((q, qi) => (
          <div key={q.key} className={qi > 0 ? "mt-8" : undefined}>
            {qi === 0 && stepIndex > 0 && (
              <button type="button" onClick={() => goToStep(stepIndex - 1)} className="mb-4 text-sm text-ink/65 hover:text-ink/80">
                Back
              </button>
            )}
            <h2 className="font-serif text-xl font-semibold text-ink sm:text-2xl">{q.title}</h2>
            {q.subtitle && <p className="mt-1 text-sm text-ink/65">{q.subtitle}</p>}
            <div className="mt-5">
              {q.type === "year_group" && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {yearGroupNames.map((y) => (
                    <OptionButton key={y} selected={answers.year_group === y} onClick={() => setAnswer("year_group", y)}>
                      {y}
                    </OptionButton>
                  ))}
                </div>
              )}

              {q.type === "timezone" && (
                <>
                  <label className="block text-sm font-medium text-ink" htmlFor="timezone-select">Time zone</label>
                  <select
                    id="timezone-select"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2"
                  >
                    {TIMEZONE_OPTIONS.map((group) => (
                      <optgroup key={group.group} label={group.group}>
                        {group.zones.map((z) => (
                          <option key={z.value} value={z.value}>{z.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {timeInfo && (
                    <div className={`mt-4 rounded-xl p-4 text-sm ${timeInfo.concern ? "bg-red-50 text-red-900" : "bg-gold-100 text-ink/80"}`}>
                      <p>
                        Live lessons run 9am–3pm UK time (Fridays to 12 noon). For you that is about{" "}
                        <strong>{formatLocalHour(timeInfo.localStart)}–{formatLocalHour(timeInfo.localEnd)}</strong>
                        {timeInfo.concern ? ", outside the hours most children learn well. Worth talking through, but it does not rule things out." : ", a workable school day."}
                      </p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setAnswer("timezone", timezone);
                      advance();
                    }}
                    disabled={!timezone}
                    className={`mt-4 ${btnPrimary}`}
                  >
                    Continue
                  </button>
                </>
              )}

              {q.type === "single_select" && (
                <div className="space-y-3">
                  {q.options.map((opt) => (
                    <IconOptionCard
                      key={opt.value}
                      icon={opt.icon}
                      label={opt.label}
                      detail={opt.detail}
                      selected={answers[q.key] === opt.value}
                      onClick={() => setAnswer(q.key, opt.value)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

      {!isResultStep && !isContactStep && currentStepQuestions.length > 0 && !currentStepQuestions.some((q) => q.type === "timezone") && stepAnswered && (
        <button type="button" onClick={advance} className={`mt-6 ${btnPrimary}`}>
          Continue
        </button>
      )}

      {isContactStep && (
        <div>
          <button type="button" onClick={() => goToStep(stepIndex - 1)} className="mb-4 text-sm text-ink/65 hover:text-ink/80">
            Back
          </button>
          <h2 className="font-serif text-xl font-semibold text-ink sm:text-2xl">Where should we send your summary?</h2>
          <p className="mt-1 text-sm text-ink/65">
            We&apos;ll email it so you have the dates and fees to hand, and keep you posted about the open evenings.
          </p>
          <form onSubmit={submitLead} className="mt-5 space-y-3">
            <div className="hidden" aria-hidden="true">
              <label htmlFor="yw-website">Leave this field empty</label>
              <input id="yw-website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <div>
              <label htmlFor="yw-name" className="text-sm font-medium text-ink">Your name</label>
              <input id="yw-name" value={contactName} onChange={(e) => setContactName(e.target.value)} type="text" autoComplete="name" className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
            </div>
            <div>
              <label htmlFor="yw-email" className="text-sm font-medium text-ink">Email</label>
              <input id="yw-email" required value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" autoComplete="email" className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
            </div>
            <label className="flex items-start gap-2 text-sm text-ink/80">
              <input type="checkbox" required checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gold-light/60" />
              <span>{config.consentText}</span>
            </label>
            {leadError && <p role="alert" className="text-sm text-red-700">{leadError}</p>}
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <button type="submit" disabled={leadSubmitting} className={btnPrimary}>
                {leadSubmitting ? "Saving…" : "Show my summary"}
              </button>
              <button type="button" onClick={() => goToStep(totalSteps + 1)} className="text-sm text-ink/65 underline hover:text-ink/80">
                Skip, just show me
              </button>
            </div>
          </form>
        </div>
      )}

      {isResultStep && (
        <div className="rounded-2xl border border-gold-light/50 bg-white p-8 shadow-warm">
          <h2 className="text-center font-serif text-2xl font-semibold text-ink">{resultHeading}</h2>
          {keyStage && (
            <p className="mt-3 text-center text-sm text-ink/70">
              {yearGroupAnswer} · {keyStage.title} ({keyStage.range})
            </p>
          )}
          {leadSubmitted && contactEmail && (
            <p className="mt-2 text-center text-xs text-ink/55">A copy is on its way to {contactEmail}.</p>
          )}

          {orderedSections.map((section) => {
            switch (section.key) {
              case "timezone_flag":
                if (!timeInfo) return null;
                return (
                  <div key="timezone_flag" className={`mt-6 rounded-2xl p-5 ${timeInfo.concern ? "bg-red-50 text-red-900" : "border border-gold-light/50 text-ink/80"}`}>
                    <p className={`font-semibold ${timeInfo.concern ? "" : "text-ink"}`}>{timeInfo.concern ? "Worth talking through first: timing" : "Your live day"}</p>
                    <p className="mt-1 text-sm">{liveDayText}</p>
                    {liveDayConcern && <p className="mt-2 text-sm">{liveDayConcern}</p>}
                  </div>
                );
              case "fees":
                if (!feeBand) return null;
                return (
                  <div key="fees" className="mt-6">
                    <p className="mb-2 text-sm font-semibold text-ink">Fees for {feeBand.yearGroupRange}, January to July 2027</p>
                    <FeeEstimator
                      feeBands={feeBands}
                      initialBandId={feeBand._id}
                      siblingDiscountPercent={siblingDiscountPercent}
                      siblingDiscountNote={siblingDiscountNote}
                      discounts={discounts}
                      compact
                    />
                  </div>
                );
              case "hifz_role_note":
                if (evaluated.texts.length === 0 && evaluated.flags.length === 0) return null;
                return (
                  <div key="hifz_role_note" className="mt-6 space-y-3">
                    {evaluated.texts.map((t, i) => (
                      <p key={i} className="rounded-2xl bg-gold-100 p-5 text-sm text-ink/80">{t}</p>
                    ))}
                    {evaluated.flags.map((f, i) => (
                      <p key={`flag-${i}`} className={`rounded-2xl p-5 text-sm ${f.tone === "warning" ? "bg-red-50 text-red-900" : "bg-gold-100 text-ink/80"}`}>{f.text}</p>
                    ))}
                  </div>
                );
              case "sample_week":
                return (
                  <div key="sample_week" className="mt-6 rounded-2xl border border-gold-light/50 p-5">
                    <p className="font-semibold text-ink">A sample week for {yearGroupAnswer || "this year group"}, in your time zone</p>
                    {sampleWeek.loading && <p className="mt-2 text-sm text-ink/65">Loading…</p>}
                    {!sampleWeek.loading && sampleWeek.slots && sampleWeek.slots.length > 0 && (
                      <ul className="mt-3 space-y-1.5 text-sm text-ink/80">
                        {sampleWeek.slots.map((slot, i) => (
                          <li key={i} className="flex items-center justify-between border-b border-gold-light/20 pb-1.5 last:border-0">
                            <span>{slot.weekdayName} · {slot.subject}</span>
                            <span className="font-medium text-ink">{slot.startLabel}–{slot.endLabel}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!sampleWeek.loading && (!sampleWeek.slots || sampleWeek.slots.length === 0) && (
                      <p className="mt-2 text-sm text-ink/65">Our admissions team can talk you through a typical week on a call.</p>
                    )}
                  </div>
                );
              case "starting_points":
                if (!evaluated.startingPoints.arabic && !evaluated.startingPoints.quran) return null;
                return (
                  <div key="starting_points" className="mt-6 rounded-2xl border border-gold-light/50 p-5">
                    <p className="font-semibold text-ink">Where your child would start</p>
                    <ul className="mt-2 space-y-2 text-sm text-ink/80">
                      {evaluated.startingPoints.arabic && <li><span className="font-medium text-ink">Arabic:</span> {evaluated.startingPoints.arabic}</li>}
                      {evaluated.startingPoints.quran && <li><span className="font-medium text-ink">Qur&apos;an:</span> {evaluated.startingPoints.quran}</li>}
                    </ul>
                  </div>
                );
              case "ctas":
                return (
                  <div key="ctas" className="mt-6 space-y-4">
                    <div className="rounded-2xl border border-gold-light/50 p-5">
                      <p className="font-semibold text-ink">Take the next step</p>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <Link
                          href={bookCallHref}
                          onClick={() => !previewMode && recordQuizEvent(sessionRowId, "call_booked", stepIndex)}
                          className={btnPrimary}
                        >
                          Book a free 20-minute call
                        </Link>
                        <Link href="/open-evening" className={btnSecondary}>
                          Open evenings
                        </Link>
                        {answers.start_when === "january" && (
                          <Link href="/admissions" className={btnSecondary}>
                            How to apply
                          </Link>
                        )}
                      </div>
                    </div>
                    {!leadSubmitted && (
                      <div className="rounded-2xl border border-gold-light/50 p-5">
                        <p className="font-semibold text-ink">Email me this summary</p>
                        <form onSubmit={submitLead} className="mt-3 space-y-3">
                          <div className="hidden" aria-hidden="true">
                            <label htmlFor="yw-website-2">Leave this field empty</label>
                            <input id="yw-website-2" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                          </div>
                          <div>
                            <label htmlFor="yw-name-2" className="text-sm font-medium text-ink">Your name</label>
                            <input id="yw-name-2" value={contactName} onChange={(e) => setContactName(e.target.value)} type="text" autoComplete="name" className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
                          </div>
                          <div>
                            <label htmlFor="yw-email-2" className="text-sm font-medium text-ink">Email</label>
                            <input id="yw-email-2" required value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" autoComplete="email" className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
                          </div>
                          <label className="flex items-start gap-2 text-sm text-ink/80">
                            <input type="checkbox" required checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gold-light/60" />
                            <span>{config.consentText}</span>
                          </label>
                          {leadError && <p role="alert" className="text-sm text-red-700">{leadError}</p>}
                          <button type="submit" disabled={leadSubmitting} className={btnPrimary}>
                            {leadSubmitting ? "Saving…" : "Send my summary"}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                );
              default:
                return null;
            }
          })}

          <p className="mt-6 text-center text-xs text-ink/65">{config.disclaimer}</p>
        </div>
      )}
    </div>
  );
}

function OptionButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-xl border px-3 py-3 text-sm font-medium transition-all ${
        selected ? "border-gold-500 bg-gold-100 text-ink" : "border-gold-light/50 bg-white text-ink/75 hover:border-gold-500/60"
      }`}
    >
      {children}
    </button>
  );
}

function IconOptionCard({ icon, label, detail, selected, onClick }: { icon?: import("@/lib/quiz/schema").LineIcon; label: string; detail?: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
        selected ? "border-gold-500 bg-gold-100" : "border-gold-light/50 bg-white hover:border-gold-500/60"
      }`}
    >
      {icon && icon !== "none" && <LineIcon icon={icon} className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" />}
      <span>
        <span className="block font-medium text-ink">{label}</span>
        {detail && <span className="block text-xs text-ink/65">{detail}</span>}
      </span>
    </button>
  );
}
