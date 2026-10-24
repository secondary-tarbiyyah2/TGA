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

function capitaliseName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part))
    .join(" ");
}

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
  const steps = useMemo(() => questionsByStep(config.questions), [config.questions]);

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

  const [stepIndex, setStepIndex] = useState(0); // index into `steps`, or steps.length for the result screen
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [timezone, setTimezone] = useState("");
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

  const currentStepQuestions = (steps[stepIndex]?.questions ?? []).filter((q) => isQuestionVisible(q, answers));
  const isResultStep = stepIndex >= steps.length;
  const totalSteps = steps.length;
  const progress = Math.round((Math.min(stepIndex, totalSteps) / totalSteps) * 100);

  const stepAnswered = currentStepQuestions.length > 0 && currentStepQuestions.every((q) => !!answers[q.key]);

  function advance() {
    const next = stepIndex + 1;
    if (next >= steps.length && !previewMode) {
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
  const sampleWeek = useSampleWeek(isResultStep ? yearGroupAnswer || null : null, isResultStep ? timezone || null : null);
  const feeBand = yearGroupAnswer ? feeBandForYearGroup(yearGroupAnswer, feeBands) : null;
  const keyStage = yearGroupAnswer ? keyStageForYearGroup(yearGroupAnswer) : null;

  const sectionActive = (key: string) => config.resultSections.find((s) => s.key === key)?.active;
  const orderedSections = [...config.resultSections].filter((s) => s.active).sort((a, b) => a.order - b.order);

  const firstName = contactName ? capitaliseName(contactName).split(" ")[0] : "";
  // Before the parent has typed their name (in the CTA form further down
  // the same screen), "{name}, here is..." has no name to fill in yet —
  // substituting a filler word there ("there, here is...") reads as
  // broken English, not a personalised greeting. Drop the name clause
  // entirely and capitalise what's left instead.
  const resultHeading = firstName
    ? config.resultHeading.replace("{name}", firstName)
    : config.resultHeading.replace(/\{name\},?\s*/, "").replace(/^[a-z]/, (c) => c.toUpperCase());

  const bookCallHref = `/book-a-call?name=${encodeURIComponent(contactName)}&email=${encodeURIComponent(contactEmail)}&year=${encodeURIComponent(yearGroupAnswer)}&notes=${encodeURIComponent(
    `From "Your Child's Week" — timezone: ${timezone}${timeInfo?.concern ? ", TIMEZONE CONCERN: lessons fall outside a workable local window" : ""}, hifdh role: ${answers.hifz_role ?? "n/a"}`
  )}`;

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    setLeadError(null);
    if (website) return; // honeypot
    if (!consentChecked) {
      setLeadError("Please tick the consent box so we can email your plan.");
      return;
    }
    setLeadSubmitting(true);
    const supabase = getSupabaseClient();
    if (supabase) {
      const ref = await leadRef(contactEmail);
      // The id is generated here, not read back via .select() — quiz_leads
      // deliberately has no SELECT policy for anon ("anon cannot read back
      // the lead they just submitted", enforced by RLS and proven in
      // quiz_v2_rls.test.sql), so a .select().single() after this insert
      // asks Postgres to RETURNING a row anon isn't allowed to see, and
      // Postgres reports that as "new row violates row-level security
      // policy" — indistinguishable from the insert itself being rejected.
      // Same pattern already used for quiz_sessions' id in session.ts.
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
        setLeadError("Something went wrong saving your details — please try again, or book a call instead.");
        setLeadSubmitting(false);
        return;
      }

      // The lead row is saved either way — this call only decides whether
      // we can also honestly record "an email actually went out." Never
      // record pdf_email_sent before this confirms success (see
      // quiz-send-plan's header comment): that event feeds the admin
      // analytics panel's "PDF emails" count, which must not lie about
      // deliveries that never happened.
      const feeSummary = feeBand
        ? `${feeBand.yearGroupRange}: ${formatGBP(feeBand.schedule?.termlyAmount ?? feeBand.termlyFee)}/term or ${formatGBP(feeBand.schedule?.monthlyAmount ?? feeBand.monthlyFee)}/month${siblingDiscountNote ? ` — ${siblingDiscountNote}` : ""}`
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
              sampleSlots: sampleWeek.slots || [],
              startingPoints: evaluated.startingPoints,
              feeSummary,
              timezoneFlagText: timeInfo?.concern
                ? `From your timezone, our live lessons (9am–3pm UK) fall around ${formatLocalHour(timeInfo.localStart)}–${formatLocalHour(timeInfo.localEnd)} — outside hours that work well for most children. We don't have an alternative live-lesson time slot to offer at this stage, so we'd want to talk this through honestly with you before you apply.`
                : "",
              texts: evaluated.texts,
            }),
          });
          const result = await res.json().catch(() => ({ ok: false }));
          if (result?.ok) recordQuizEvent(sessionRowId, "pdf_email_sent", stepIndex);
        } catch {
          // Lead is already saved; a failed send just means we don't record
          // the event below — no user-facing error needed for this part.
        }
      }
    }
    setLeadSubmitting(false);
    setLeadSubmitted(true);
  }

  if (steps.length === 0) {
    return <p className="text-center text-ink/65">The quiz isn&apos;t configured yet — please check back shortly.</p>;
  }

  return (
    <div className="mx-auto max-w-xl">
      {!isResultStep && (
        <div className="mb-8">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gold-100">
            <div className="h-full rounded-full bg-gold-500 transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs font-medium text-ink/65">Question {stepIndex + 1} of {totalSteps}</p>
        </div>
      )}

      {!isResultStep &&
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
                  <label className="block text-sm font-medium text-ink" htmlFor="timezone-select">Timezone</label>
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
                      {timeInfo.concern ? (
                        <p>
                          Our live lessons run roughly 9am–3pm UK time. From your timezone that lands around{" "}
                          <strong>{formatLocalHour(timeInfo.localStart)}–{formatLocalHour(timeInfo.localEnd)}</strong>, outside hours that
                          work well for most children. This does not rule things out, but is worth discussing directly.
                        </p>
                      ) : (
                        <p>
                          Our live lessons run roughly 9am–3pm UK time — from your timezone that is around{" "}
                          <strong>{formatLocalHour(timeInfo.localStart)}–{formatLocalHour(timeInfo.localEnd)}</strong>, a workable school day.
                        </p>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setAnswer("timezone", timezone);
                      advance();
                    }}
                    disabled={!timezone}
                    className="mt-4 rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95 disabled:opacity-50"
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

      {!isResultStep && currentStepQuestions.length > 1 && (
        <button
          type="button"
          onClick={advance}
          disabled={!stepAnswered}
          className="mt-6 rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95 disabled:opacity-50"
        >
          Continue
        </button>
      )}

      {!isResultStep && currentStepQuestions.length === 1 && currentStepQuestions[0].type === "single_select" && stepAnswered && (
        <button type="button" onClick={advance} className="mt-6 rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95">
          Continue
        </button>
      )}
      {!isResultStep && currentStepQuestions.length === 1 && currentStepQuestions[0].type === "year_group" && stepAnswered && (
        <button type="button" onClick={advance} className="mt-6 rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95">
          Continue
        </button>
      )}

      {isResultStep && (
        <div className="rounded-2xl border border-gold-light/50 bg-white p-8 shadow-warm">
          <h2 className="text-center font-serif text-2xl font-semibold text-ink">{resultHeading}</h2>
          {liveConfig?.publishedAt && (
            <p className="mt-1 text-center text-xs text-ink/40">Quiz content last updated {new Date(liveConfig.publishedAt).toLocaleDateString("en-GB")}</p>
          )}

          {orderedSections.map((section) => {
            switch (section.key) {
              case "sample_week":
                if (!sectionActive("sample_week")) return null;
                return (
                  <div key="sample_week" className="mt-6 rounded-2xl border border-gold-light/50 p-5">
                    <p className="font-semibold text-ink">A sample week for {yearGroupAnswer || "this year group"}, in your timezone</p>
                    {sampleWeek.loading && <p className="mt-2 text-sm text-ink/65">Loading…</p>}
                    {!sampleWeek.loading && sampleWeek.slots && sampleWeek.slots.length > 0 && (
                      <>
                        <ul className="mt-3 space-y-1.5 text-sm text-ink/80">
                          {sampleWeek.slots.map((slot, i) => (
                            <li key={i} className="flex items-center justify-between border-b border-gold-light/20 pb-1.5 last:border-0">
                              <span>{slot.weekdayName} — {slot.subject}</span>
                              <span className="font-medium text-ink">{slot.startLabel}–{slot.endLabel}</span>
                            </li>
                          ))}
                        </ul>
                        {sampleWeek.updatedAt && (
                          <p className="mt-3 text-xs text-ink/40">Last updated {new Date(sampleWeek.updatedAt).toLocaleDateString("en-GB")}</p>
                        )}
                      </>
                    )}
                    {!sampleWeek.loading && sampleWeek.slots && sampleWeek.slots.length === 0 && (
                      <p className="mt-2 text-sm text-ink/65">
                        We haven&apos;t published a sample week for this year group yet — our admissions team can talk you through a typical week on a call.
                      </p>
                    )}
                    {!sampleWeek.loading && sampleWeek.slots === null && (
                      <p className="mt-2 text-sm text-ink/65">A sample week isn&apos;t available to show right now — our admissions team can talk you through a typical week on a call.</p>
                    )}
                  </div>
                );
              case "starting_points":
                if (!sectionActive("starting_points") || (!evaluated.startingPoints.arabic && !evaluated.startingPoints.quran)) return null;
                return (
                  <div key="starting_points" className="mt-6 rounded-2xl border border-gold-light/50 p-5">
                    <p className="font-semibold text-ink">Where your child would start</p>
                    <ul className="mt-2 space-y-2 text-sm text-ink/80">
                      {evaluated.startingPoints.arabic && <li><span className="font-medium text-ink">Arabic:</span> {evaluated.startingPoints.arabic}</li>}
                      {evaluated.startingPoints.quran && <li><span className="font-medium text-ink">Qur&apos;an:</span> {evaluated.startingPoints.quran}</li>}
                    </ul>
                  </div>
                );
              case "timezone_flag":
                if (!sectionActive("timezone_flag") || !timeInfo?.concern) return null;
                return (
                  <div key="timezone_flag" className="mt-6 rounded-2xl bg-red-50 p-5 text-red-900">
                    <p className="font-semibold">Worth talking through first: timing</p>
                    <p className="mt-1 text-sm">
                      From your timezone, our live lessons (9am–3pm UK) fall around {formatLocalHour(timeInfo.localStart)}–{formatLocalHour(timeInfo.localEnd)} —
                      outside hours that work well for most children. We don&apos;t have an alternative live-lesson time slot to offer at this stage, so we&apos;d
                      want to talk this through honestly with you before you apply.
                    </p>
                  </div>
                );
              case "hifz_role_note":
                if (!sectionActive("hifz_role_note") || evaluated.texts.length === 0) return null;
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
              case "fees":
                if (!sectionActive("fees") || !feeBand) return null;
                return (
                  <div key="fees" className="mt-6">
                    {keyStage && (
                      <p className="mb-2 text-sm text-ink/70">{keyStage.title} ({keyStage.range}) — {keyStage.liveSplit}</p>
                    )}
                    <p className="mb-2 text-sm font-semibold text-ink">Your personalised fee estimate</p>
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
              case "ctas":
                if (!sectionActive("ctas")) return null;
                return (
                  <div key="ctas" className="mt-6 space-y-4">
                    <div className="rounded-2xl border border-gold-light/50 p-5">
                      <p className="font-semibold text-ink">Email me this plan</p>
                      {leadSubmitted ? (
                        <p className="mt-2 text-sm text-ink/70">Thank you — we&apos;ve saved your plan and our admissions team will follow up by email shortly.</p>
                      ) : (
                        <form onSubmit={submitLead} className="mt-3 space-y-3">
                          <div className="hidden" aria-hidden="true">
                            <label htmlFor="yw-website">Leave this field empty</label>
                            <input id="yw-website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                          </div>
                          <div>
                            <label htmlFor="yw-name" className="text-sm font-medium text-ink">Your name</label>
                            <input id="yw-name" value={contactName} onChange={(e) => setContactName(e.target.value)} type="text" className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
                          </div>
                          <div>
                            <label htmlFor="yw-email" className="text-sm font-medium text-ink">Email</label>
                            <input id="yw-email" required value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
                          </div>
                          <label className="flex items-start gap-2 text-sm text-ink/80">
                            <input type="checkbox" required checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gold-light/60" />
                            <span>{config.consentText}</span>
                          </label>
                          {leadError && <p role="alert" className="text-sm text-red-700">{leadError}</p>}
                          <button type="submit" disabled={leadSubmitting} className="rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95 disabled:opacity-60">
                            {leadSubmitting ? "Saving…" : "Send me my plan"}
                          </button>
                        </form>
                      )}
                    </div>
                    <div className="rounded-2xl border border-gold-light/50 p-5">
                      <p className="font-semibold text-ink">Book a free 20-minute call</p>
                      <p className="mt-1 text-sm text-ink/70">Talk it through with our admissions team, no obligation.</p>
                      <Link
                        href={bookCallHref}
                        onClick={() => !previewMode && recordQuizEvent(sessionRowId, "call_booked", stepIndex)}
                        className="mt-3 inline-block rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95"
                      >
                        Book a free 20-minute call
                      </Link>
                    </div>
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
