"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { FIT_CHECK, type ChoiceOption } from "@/content/fitCheck";
import type { FeeBand } from "@/content/seed";
import { Kicker } from "@/components/Section";
import { StarMark } from "@/components/StarMark";
import { formatGBP } from "@/lib/format";
import { COMMON_TIME_ZONES, UK_TIME_ZONE, gmtOffsetLabel, initialTimeZone, isValidTimeZone, otherTimeZones, saveTimeZone, zoneCity, zoneLabel } from "@/lib/timezones";
import {
  EMPTY_ANSWERS,
  assessTiming,
  buildNeeds,
  buildReasons,
  chosenYears,
  familyFees,
  generateId,
  keyStageFor,
  lessonsLine,
  nextStepFor,
  stepComplete,
  verdictFor,
  visibleSteps,
  yearNumber,
  type FeeSettingsInput,
  type FitAnswers,
  type LocalDay,
  type LocalTime,
  type NeedStatus,
  type Reason,
  type StepKey,
  type Verdict,
} from "@/lib/fitCheck";

const C = FIT_CHECK;
const Q = C.questions;
const S = C.sections;

type Phase = "intro" | "questions" | "result";
type SingleKey = "reason" | "setup" | "adult" | "needs" | "start";

const SINGLE_OPTIONS: Record<SingleKey, readonly ChoiceOption[]> = {
  reason: Q.reason.options,
  setup: Q.setup.options,
  adult: Q.adult.options,
  needs: Q.needs.options,
  start: Q.start.options,
};

const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold tracking-wide text-ink-900 transition-all duration-150 hover:-translate-y-px hover:brightness-95 disabled:pointer-events-none disabled:opacity-45";
const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-full border-[1.5px] border-gold-500 px-6 py-3 text-sm font-semibold tracking-wide text-ink-900 transition-all duration-150 hover:bg-gold-100";
const card = "rounded-3xl border border-gold-light/50 bg-white p-6 shadow-warm sm:p-8";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The public "Is it right for us?" check (/eligibility). An intro, then one
 * question per screen (src/lib/fitCheck.ts decides which show), then an
 * honest result built only from published facts. All copy is in
 * src/content/fitCheck.ts. Nothing is stored or sent unless the family asks
 * for the summary by email (a consented quiz_leads row plus the
 * quiz-send-plan edge function).
 */
export function FitCheck({ feeBands, fees }: { feeBands: FeeBand[]; fees: FeeSettingsInput }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [step, setStep] = useState<StepKey>("children");
  const [answers, setAnswers] = useState<FitAnswers>(EMPTY_ANSWERS);
  const [tzDetected, setTzDetected] = useState(false);
  const [limitNudge, setLimitNudge] = useState(false);

  const topRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moved = useRef(false);

  const steps = visibleSteps(answers);
  const stepIndex = Math.max(0, steps.indexOf(step));
  const complete = stepComplete(step, answers);

  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

  // Keep the check in view and move focus to the new question (or the
  // result) without the page jumping about.
  useEffect(() => {
    if (!moved.current) return;
    const top = topRef.current;
    if (top) {
      const r = top.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight * 0.4) top.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [phase, step]);

  function clearTimer() {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
  }

  function start() {
    moved.current = true;
    if (!tzDetected) {
      setAnswers((a) => ({ ...a, timeZone: initialTimeZone() }));
      setTzDetected(true);
    }
    setStep(visibleSteps(answers)[0]);
    setPhase("questions");
  }

  function goNext(from: StepKey, a: FitAnswers) {
    clearTimer();
    moved.current = true;
    const list = visibleSteps(a);
    const i = list.indexOf(from);
    if (from === "location") saveTimeZone(a.timeZone);
    if (i === -1 || i >= list.length - 1) setPhase("result");
    else setStep(list[i + 1]);
  }

  function goBack() {
    clearTimer();
    moved.current = true;
    const i = steps.indexOf(step);
    if (i <= 0) setPhase("intro");
    else setStep(steps[i - 1]);
  }

  function chooseSingle(key: SingleKey, value: string) {
    clearTimer();
    const next = { ...answers, [key]: value };
    setAnswers(next);
    // The needs question has an optional note, so only "none" moves on by itself.
    if (key === "needs" && value !== "none") return;
    advanceTimer.current = setTimeout(() => goNext(key, next), reducedMotion() ? 60 : 260);
  }

  function togglePriority(value: string) {
    const chosen = answers.priorities;
    if (chosen.includes(value)) {
      setLimitNudge(false);
      setAnswers({ ...answers, priorities: chosen.filter((p) => p !== value) });
    } else if (chosen.length >= Q.priorities.max) {
      setLimitNudge(true);
    } else {
      setAnswers({ ...answers, priorities: [...chosen, value] });
    }
  }

  function restart(keepAnswers: boolean) {
    clearTimer();
    moved.current = true;
    if (!keepAnswers) setAnswers((a) => ({ ...EMPTY_ANSWERS, timeZone: a.timeZone }));
    setStep("children");
    setPhase("questions");
  }

  // Keyboard: 1 to 9 choose an answer, Enter continues.
  useEffect(() => {
    if (phase !== "questions") return;
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "Enter") {
        // Enter keeps its own meaning in a text box, on a link and on other
        // buttons. On an answer that is already chosen it moves on; on one
        // that is not, it chooses it (the button's own click).
        if (tag === "TEXTAREA" || tag === "A") return;
        if (tag === "BUTTON" && el?.getAttribute("aria-checked") !== "true") return;
        if (complete) {
          e.preventDefault();
          goNext(step, answers);
        }
        return;
      }
      if (inField || !/^[1-9]$/.test(e.key)) return;
      const n = Number(e.key) - 1;
      if (step === "priorities") {
        const opt = Q.priorities.options[n];
        if (opt) {
          e.preventDefault();
          togglePriority(opt.value);
        }
        return;
      }
      if (step in SINGLE_OPTIONS) {
        const opt = SINGLE_OPTIONS[step as SingleKey][n];
        if (opt) {
          e.preventDefault();
          chooseSingle(step as SingleKey, opt.value);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div ref={topRef} className="scroll-mt-24">
      {phase === "intro" && <Intro onStart={start} headingRef={headingRef} />}

      {phase === "questions" && (
        <div className="mx-auto max-w-2xl">
          <div className="relative overflow-hidden rounded-3xl border border-gold-light/50 bg-white shadow-warm">
            <div className="border-b border-gold-light/40 px-5 pb-4 pt-5 sm:px-8">
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={goBack} className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 -ml-2 text-sm font-medium text-ink/70 transition-colors hover:bg-gold-50 hover:text-ink">
                  <ArrowLeft /> {C.nav.back}
                </button>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-900" aria-live="polite">
                  {C.nav.questionOf(stepIndex + 1, steps.length)}
                </p>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gold-100" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={stepIndex} aria-label="Progress">
                <div className="h-full rounded-full bg-gold-500 transition-[width] duration-500 ease-out" style={{ width: `${Math.max(4, (stepIndex / steps.length) * 100)}%` }} />
              </div>
            </div>

            <div key={step} className="min-h-[26rem] animate-[fadeIn_0.25s_ease-out] px-5 py-7 sm:min-h-[27rem] sm:px-8 sm:py-8">
              <QuestionBody
                step={step}
                answers={answers}
                setAnswers={setAnswers}
                headingRef={headingRef}
                tzDetected={tzDetected}
                limitNudge={limitNudge}
                onChooseSingle={chooseSingle}
                onTogglePriority={togglePriority}
                onTzChange={(tz) => {
                  setAnswers((a) => ({ ...a, timeZone: tz }));
                  setTzDetected(false);
                }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gold-light/40 bg-gold-50/60 px-5 py-4 sm:px-8">
              <p className="hidden text-xs text-ink/60 sm:block">{C.nav.keyboardHint}</p>
              <button type="button" onClick={() => goNext(step, answers)} disabled={!complete} className={`${btnPrimary} ml-auto`}>
                {stepIndex === steps.length - 1 ? C.nav.seeResult : C.nav.continue} <ArrowRight />
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "result" && <Result answers={answers} feeBands={feeBands} fees={fees} headingRef={headingRef} onRestart={restart} />}
    </div>
  );
}

// ── intro ───────────────────────────────────────────────────────────────

function Intro({ onStart, headingRef }: { onStart: () => void; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
      <div>
        <Kicker>{C.intro.kicker}</Kicker>
        <h1 ref={headingRef} tabIndex={-1} style={{ outline: "none" }} className="text-h2 font-serif font-semibold text-ink">
          {C.intro.title}
        </h1>
        <p className="mt-5 max-w-xl text-lg text-ink/75">{C.intro.body}</p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button type="button" onClick={onStart} className={`${btnPrimary} px-7 py-3.5 text-base`}>
            {C.intro.startLabel} <ArrowRight />
          </button>
          <span className="inline-flex items-center gap-2 text-sm text-ink/65">
            <ClockIcon /> {C.intro.minutes}
          </span>
        </div>
        <p className="mt-5 max-w-xl text-sm text-ink/65">{C.intro.privacy}</p>
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute -right-6 -top-8 hidden text-gold-300/60 sm:block" aria-hidden="true">
          <StarMark className="h-28 w-28" />
        </div>
        <div className="relative rounded-3xl border border-gold-light/50 bg-white/90 p-6 shadow-warm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-900">What you will get</p>
          <ul className="mt-5 space-y-4">
            {C.intro.gets.map((g, i) => (
              <li key={g} className="flex items-center gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-100 font-serif text-base font-semibold text-gold-900">{i + 1}</span>
                <span className="font-medium text-ink">{g}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── questions ───────────────────────────────────────────────────────────

function QuestionHeading({ title, subtitle, headingRef }: { title: string; subtitle?: string; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <div className="mb-6">
      <h2 ref={headingRef} tabIndex={-1} style={{ outline: "none" }} className="font-serif text-2xl font-semibold leading-tight text-ink sm:text-[1.75rem]">
        {title}
      </h2>
      {subtitle && <p className="mt-2 text-[0.95rem] text-ink/70">{subtitle}</p>}
    </div>
  );
}

function QuestionBody({
  step,
  answers,
  setAnswers,
  headingRef,
  tzDetected,
  limitNudge,
  onChooseSingle,
  onTogglePriority,
  onTzChange,
}: {
  step: StepKey;
  answers: FitAnswers;
  setAnswers: React.Dispatch<React.SetStateAction<FitAnswers>>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  tzDetected: boolean;
  limitNudge: boolean;
  onChooseSingle: (key: SingleKey, value: string) => void;
  onTogglePriority: (value: string) => void;
  onTzChange: (tz: string) => void;
}) {
  if (step === "children") return <ChildrenStep answers={answers} setAnswers={setAnswers} headingRef={headingRef} />;
  if (step === "location") return <LocationStep tz={answers.timeZone} detected={tzDetected} onChange={onTzChange} headingRef={headingRef} />;

  if (step === "priorities") {
    const chosen = answers.priorities;
    const atMax = chosen.length >= Q.priorities.max;
    return (
      <>
        <QuestionHeading title={Q.priorities.title} subtitle={Q.priorities.subtitle} headingRef={headingRef} />
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label={Q.priorities.title}>
          {Q.priorities.options.map((opt, i) => {
            const selected = chosen.includes(opt.value);
            return (
              <OptionCard
                key={opt.value}
                index={i}
                label={opt.label}
                selected={selected}
                multi
                dimmed={atMax && !selected}
                onClick={() => onTogglePriority(opt.value)}
              />
            );
          })}
        </div>
        <p className={`mt-4 text-sm font-medium ${limitNudge && atMax ? "text-gold-900" : "text-ink/60"}`} aria-live="polite">
          {Q.priorities.chosen(chosen.length, Q.priorities.max)}
        </p>
      </>
    );
  }

  const key = step as SingleKey;
  const q = Q[key];
  const value = answers[key];
  return (
    <>
      <QuestionHeading title={q.title} subtitle={"subtitle" in q ? q.subtitle : undefined} headingRef={headingRef} />
      <div className="space-y-3" role="radiogroup" aria-label={q.title}>
        {SINGLE_OPTIONS[key].map((opt, i) => (
          <OptionCard key={opt.value} index={i} label={opt.label} detail={opt.detail} selected={value === opt.value} onClick={() => onChooseSingle(key, opt.value)} />
        ))}
      </div>
      {key === "needs" && (value === "some" || value === "significant") && (
        <div className="mt-5 animate-[fadeIn_0.25s_ease-out]">
          <label htmlFor="fc-needs-note" className="text-sm font-medium text-ink">
            {Q.needs.noteLabel}
          </label>
          <textarea
            id="fc-needs-note"
            rows={3}
            maxLength={600}
            value={answers.needsNote}
            onChange={(e) => setAnswers((a) => ({ ...a, needsNote: e.target.value }))}
            placeholder={Q.needs.notePlaceholder}
            className="mt-1.5 w-full rounded-2xl border border-gold-light/70 bg-white px-4 py-3 text-[0.95rem] text-ink placeholder:text-ink/45 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-300"
          />
        </div>
      )}
    </>
  );
}

function OptionCard({
  index,
  label,
  detail,
  selected,
  multi = false,
  dimmed = false,
  onClick,
}: {
  index: number;
  label: string;
  detail?: string;
  selected: boolean;
  multi?: boolean;
  dimmed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onClick}
      className={`group flex min-h-[3.75rem] w-full items-center gap-4 rounded-2xl border-[1.5px] px-4 py-3.5 text-left transition-all duration-150 sm:px-5 ${
        selected
          ? "border-gold-500 bg-gold-50 shadow-[inset_0_0_0_1px_var(--color-gold-500)]"
          : `border-gold-light/60 bg-white hover:-translate-y-px hover:border-gold-500/70 hover:shadow-warm ${dimmed ? "opacity-55" : ""}`
      }`}
    >
      <span
        className={`hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold sm:flex ${
          selected ? "border-gold-500 bg-gold-500 text-ink-900" : "border-gold-light text-ink/55 group-hover:border-gold-500/70"
        }`}
        aria-hidden="true"
      >
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug text-ink">{label}</span>
        {detail && <span className="mt-0.5 block text-sm leading-snug text-ink/65">{detail}</span>}
      </span>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center border-[1.5px] transition-colors ${multi ? "rounded-md" : "rounded-full"} ${
          selected ? "border-gold-700 bg-gold-700 text-white" : "border-gold-light bg-white text-transparent"
        }`}
        aria-hidden="true"
      >
        <CheckIcon className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

function ChildrenStep({
  answers,
  setAnswers,
  headingRef,
}: {
  answers: FitAnswers;
  setAnswers: React.Dispatch<React.SetStateAction<FitAnswers>>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const q = Q.children;
  const many = answers.children.length > 1;
  const setChild = (i: number, year: string) => setAnswers((a) => ({ ...a, children: a.children.map((c, j) => (j === i ? year : c)) }));
  const remove = (i: number) => setAnswers((a) => ({ ...a, children: a.children.filter((_, j) => j !== i) }));
  const add = () => setAnswers((a) => ({ ...a, children: [...a.children, null] }));
  return (
    <>
      <QuestionHeading title={q.title} subtitle={q.subtitle} headingRef={headingRef} />
      <div className="space-y-6">
        {answers.children.map((value, i) => (
          <fieldset key={i} className={many ? "relative rounded-2xl border border-gold-light/50 bg-gold-50/40 p-4" : undefined}>
            <legend className={many ? "float-left mb-3 text-sm font-semibold text-ink" : "sr-only"}>{q.childLabel(i)}</legend>
            {many && (
              <button type="button" onClick={() => remove(i)} className="absolute right-4 top-3.5 text-sm font-medium text-ink/60 underline-offset-2 hover:text-ink hover:underline">
                {q.removeChild}
                <span className="sr-only"> {q.childLabel(i).toLowerCase()}</span>
              </button>
            )}
            <div className="clear-both grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5" role="radiogroup" aria-label={q.childLabel(i)}>
              {C.yearGroups.map((y) => {
                const selected = value === y;
                return (
                  <button
                    key={y}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setChild(i, y)}
                    className={`flex min-h-[3.5rem] flex-col items-center justify-center rounded-2xl border-[1.5px] px-2 py-2 transition-all duration-150 ${
                      selected ? "border-gold-500 bg-gold-500 text-ink-900" : "border-gold-light/60 bg-white text-ink hover:-translate-y-px hover:border-gold-500/70"
                    }`}
                  >
                    <span className={`text-[0.65rem] font-semibold uppercase tracking-[0.14em] ${selected ? "text-ink-900/75" : "text-ink/55"}`}>Year</span>
                    <span className="font-serif text-xl font-semibold leading-none">{yearNumber(y)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      {answers.children.length < q.maxChildren && (
        <button
          type="button"
          onClick={add}
          className="mt-5 inline-flex items-center gap-2 rounded-full border-[1.5px] border-dashed border-gold-500/70 px-4 py-2 text-sm font-semibold text-gold-900 transition-colors hover:bg-gold-50"
        >
          <PlusIcon /> {q.addChild}
        </button>
      )}
    </>
  );
}

function LocationStep({ tz, detected, onChange, headingRef }: { tz: string; detected: boolean; onChange: (tz: string) => void; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  const q = Q.location;
  const others = useMemo(() => otherTimeZones(), []);
  const known = COMMON_TIME_ZONES.some((z) => z.tz === tz) || others.some((z) => z.tz === tz);
  const timing = useMemo(() => (isValidTimeZone(tz) ? assessTiming(tz) : null), [tz]);
  const now = useMemo(() => new Date(), []);
  const withOffset = (zone: string, label: string) => {
    const off = gmtOffsetLabel(zone, now);
    return off ? `${label} (${off})` : label;
  };
  const toneStyle = timing?.tone === "late" ? "border-ink/25 bg-ink-900 text-white" : timing?.tone === "edge" ? "border-gold-300 bg-gold-100 text-ink" : "border-gold-light/60 bg-gold-50 text-ink";

  return (
    <>
      <QuestionHeading title={q.title} subtitle={q.subtitle} headingRef={headingRef} />
      <label htmlFor="fc-tz" className="text-sm font-semibold text-ink">
        {q.selectLabel}
      </label>
      <div className="relative mt-1.5">
        <select
          id="fc-tz"
          value={tz}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-2xl border-[1.5px] border-gold-light/70 bg-white py-3.5 pl-4 pr-11 text-base text-ink focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-300"
        >
          {!known && <option value={tz}>{withOffset(tz, zoneLabel(tz))}</option>}
          <optgroup label={q.commonGroup}>
            {COMMON_TIME_ZONES.map((z) => (
              <option key={z.tz} value={z.tz}>
                {withOffset(z.tz, z.label)}
              </option>
            ))}
          </optgroup>
          {others.length > 0 && (
            <optgroup label={q.otherGroup}>
              {others.map((z) => (
                <option key={z.tz} value={z.tz}>
                  {z.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gold-700" aria-hidden="true">
          <ChevronDown />
        </span>
      </div>
      {detected && <p className="mt-2 text-xs text-ink/60">{q.detected}</p>}

      {timing && (
        <div className={`mt-6 rounded-2xl border p-5 transition-colors ${toneStyle}`} aria-live="polite">
          <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${timing.tone === "late" ? "text-gold-300" : "text-gold-900"}`}>{q.previewTitle}</p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className={`text-sm ${timing.tone === "late" ? "text-white/75" : "text-ink/65"}`}>{q.monThu}</dt>
              <dd className="font-serif text-2xl font-semibold">
                <TimeRange start={timing.winter.start} end={timing.winter.end} />
              </dd>
            </div>
            <div>
              <dt className={`text-sm ${timing.tone === "late" ? "text-white/75" : "text-ink/65"}`}>{q.fri}</dt>
              <dd className="font-serif text-2xl font-semibold">
                <TimeRange start={timing.winter.start} end={timing.winter.fridayEnd} />
              </dd>
            </div>
          </dl>
          <p className={`mt-3 text-sm ${timing.tone === "late" ? "text-white/85" : "text-ink/75"}`}>
            {tz !== UK_TIME_ZONE && <>{q.ukLabel(timing.ukStart, timing.ukEnd)}. </>}
            {q.tone[timing.tone]}
          </p>
        </div>
      )}
    </>
  );
}

function TimeRange({ start, end }: { start: LocalTime; end: LocalTime }) {
  const shift = (t: LocalTime) =>
    t.dayShift > 0 ? <span className="ml-1 align-middle font-sans text-xs font-medium opacity-75">({Q.location.nextDay})</span> : t.dayShift < 0 ? <span className="ml-1 align-middle font-sans text-xs font-medium opacity-75">({Q.location.prevDay})</span> : null;
  return (
    <>
      {start.label}
      {shift(start)} <span className="font-sans text-base font-normal opacity-70">to</span> {end.label}
      {shift(end)}
    </>
  );
}

// ── result ──────────────────────────────────────────────────────────────

function Result({
  answers,
  feeBands,
  fees,
  headingRef,
  onRestart,
}: {
  answers: FitAnswers;
  feeBands: FeeBand[];
  fees: FeeSettingsInput;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onRestart: (keepAnswers: boolean) => void;
}) {
  const years = chosenYears(answers);
  const timing = useMemo(() => assessTiming(answers.timeZone), [answers.timeZone]);
  const reasons = useMemo(() => buildReasons(answers, timing), [answers, timing]);
  const verdict = verdictFor(reasons);
  const family = familyFees(years, feeBands, fees);
  const needs = buildNeeds(answers);
  const nextKey = nextStepFor(verdict, answers.start);
  const v = C.verdicts[verdict];
  const isUk = answers.timeZone === UK_TIME_ZONE;
  const city = zoneCity(answers.timeZone);

  const startLabel = Q.start.options.find((o) => o.value === answers.start)?.label ?? "";
  const summaryLine = `${years.join(", ")}. Time zone: ${zoneLabel(answers.timeZone)}. Verdict: ${v.label}. Start: ${startLabel}.`;
  const callHref = `${S.next.hrefs.call}?year=${encodeURIComponent(years[0] ?? "")}&notes=${encodeURIComponent(S.next.callNotes(summaryLine))}#book`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <VerdictHero verdict={verdict} heading={v.heading} body={v.body} label={v.label} headingRef={headingRef} facts={[years.join(", "), zoneLabel(answers.timeZone), startLabel]} />

      <section className={card} aria-labelledby="fc-reasons">
        <SectionTitle id="fc-reasons">{C.reasons.reasonsTitle}</SectionTitle>
        <ul className="mt-5 space-y-3">
          {reasons.map((r, i) => (
            <ReasonRow key={i} reason={r} />
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={card} aria-labelledby="fc-day">
          <SectionTitle id="fc-day">{S.day.title}</SectionTitle>
          <p className="mt-2 text-sm text-ink/65">{isUk ? S.day.ukTime : S.day.lead(city)}</p>
          <table className="mt-5 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gold-light/50 text-xs uppercase tracking-[0.12em] text-ink/60">
                <th scope="col" className="pb-2 font-semibold">
                  <span className="sr-only">Day</span>
                </th>
                <th scope="col" className="pb-2 font-semibold">{isUk ? S.day.ukTime : S.day.yourTime}</th>
                {!isUk && <th scope="col" className="pb-2 text-right font-semibold">{S.day.ukTime}</th>}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gold-light/30">
                <th scope="row" className="py-3 pr-3 font-medium text-ink/75">{S.day.monThu}</th>
                <td className="py-3 font-serif text-lg font-semibold text-ink">
                  <TimeRange start={timing.winter.start} end={timing.winter.end} />
                </td>
                {!isUk && <td className="py-3 text-right text-ink/70">{timing.ukStart} to {timing.ukEnd}</td>}
              </tr>
              <tr>
                <th scope="row" className="py-3 pr-3 font-medium text-ink/75">{S.day.fri}</th>
                <td className="py-3 font-serif text-lg font-semibold text-ink">
                  <TimeRange start={timing.winter.start} end={timing.winter.fridayEnd} />
                </td>
                {!isUk && <td className="py-3 text-right text-ink/70">{timing.ukStart} to {timing.ukFridayEnd}</td>}
              </tr>
            </tbody>
          </table>
          {!isUk && <DayStrip day={timing.winter} />}
          {timing.changesInSummer && <p className="mt-3 text-sm text-ink/70">{S.day.summerChange(timing.summer.start.label, timing.summer.end.label)}</p>}
          <ul className="mt-5 space-y-2.5 border-t border-gold-light/40 pt-5 text-sm text-ink/80">
            {years.map((y, i) => {
              const ks = keyStageFor(y);
              return (
                <li key={`${y}-${i}`} className="flex gap-3">
                  <StarMark className="mt-1 h-3.5 w-3.5 shrink-0 text-gold-700" />
                  <span>
                    <span className="font-semibold text-ink">{ks ? S.day.childLine(y, ks.title) : y}:</span> {lessonsLine(y)}
                  </span>
                </li>
              );
            })}
            {years.some((y) => yearNumber(y) <= 2) && <Bullet>{S.day.ks1Note}</Bullet>}
            <Bullet>{S.day.fridayNote}</Bullet>
            <Bullet>{S.day.classSize}</Bullet>
          </ul>
          <Link href={S.day.curriculumHref} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-900 underline underline-offset-2">
            {S.day.curriculumLink} <ArrowRight />
          </Link>
        </section>

        <section className={card} aria-labelledby="fc-need">
          <SectionTitle id="fc-need">{S.need.title}</SectionTitle>
          <ul className="mt-5 divide-y divide-gold-light/40">
            {needs.map((n) => (
              <li key={n.key} className="flex items-start gap-3 py-3.5 first:pt-0">
                <NeedIcon status={n.status} />
                <span className="flex-1 text-sm text-ink/85">{S.need.items[n.key]}</span>
                <NeedPill status={n.status} />
              </li>
            ))}
          </ul>
        </section>

        <section className={card} aria-labelledby="fc-cost">
          <SectionTitle id="fc-cost">{S.cost.title}</SectionTitle>
          <p className="mt-2 text-sm text-ink/65">{S.cost.period}</p>
          {family ? <CostDetails family={family} fees={fees} years={years} /> : null}
          <Link href={S.cost.href} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-900 underline underline-offset-2">
            {S.cost.link} <ArrowRight />
          </Link>
        </section>

        <section className={card} aria-labelledby="fc-offer">
          <SectionTitle id="fc-offer">{S.offer.title}</SectionTitle>
          {answers.priorities.length === 0 && <p className="mt-2 text-sm text-ink/65">{S.offer.noneChosen}</p>}
          <ul className="mt-5 space-y-4">
            {(answers.priorities.length > 0 ? answers.priorities : [...S.offer.defaults]).map((p) => {
              const item = S.offer.items[p as keyof typeof S.offer.items];
              if (!item) return null;
              return (
                <li key={p} className="rounded-2xl bg-gold-50 p-4">
                  <p className="font-semibold text-ink">{item.label}</p>
                  <p className="mt-1 text-sm text-ink/75">{item.body}</p>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-gold-900">{S.offer.honest.title}</p>
          <ul className="mt-3 space-y-2 text-sm text-ink/80">
            {S.offer.honest.items.map((t) => (
              <Bullet key={t}>{t}</Bullet>
            ))}
          </ul>
        </section>
      </div>

      <NextSteps nextKey={nextKey} callHref={callHref} />

      <EmailSummary answers={answers} years={years} verdict={verdict} reasons={reasons} timing={timing} family={family} nextKey={nextKey} />

      <div className="flex flex-col items-center gap-4 pt-2 text-center">
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => onRestart(true)} className={btnSecondary}>
            {S.changeAnswers}
          </button>
          <button type="button" onClick={() => onRestart(false)} className="rounded-full px-5 py-3 text-sm font-semibold text-ink/70 underline underline-offset-2 hover:text-ink">
            {S.startAgain}
          </button>
        </div>
        <p className="max-w-2xl text-xs text-ink/60">{S.disclaimer}</p>
      </div>
    </div>
  );
}

function VerdictHero({
  verdict,
  heading,
  body,
  label,
  facts,
  headingRef,
}: {
  verdict: Verdict;
  heading: string;
  body: string;
  label: string;
  facts: string[];
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const filled = verdict === "strong" ? 3 : verdict === "sort" ? 2 : 1;
  return (
    <section className="relative overflow-hidden rounded-3xl bg-ink-900 p-7 text-white shadow-warm sm:p-10" aria-labelledby="fc-verdict">
      <div className="pointer-events-none absolute -right-16 -top-16 text-gold-500/15" aria-hidden="true">
        <StarMark className="h-72 w-72" />
      </div>
      <div className="pointer-events-none absolute -bottom-20 right-24 hidden text-gold-500/10 sm:block" aria-hidden="true">
        <StarMark className="h-44 w-44" />
      </div>
      <div className="relative">
        <Kicker tone="light">{C.intro.kicker}</Kicker>
        <div className="mt-2 inline-flex items-center gap-3 rounded-full border border-gold-300/50 bg-white/5 py-1.5 pl-2 pr-4">
          <span className="flex gap-1" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <StarMark key={i} filled={i < filled} className={`h-4 w-4 ${i < filled ? "text-gold-300" : "text-gold-300/40"}`} />
            ))}
          </span>
          <span className="text-sm font-semibold text-gold-300">{label}</span>
        </div>
        <h2 id="fc-verdict" ref={headingRef} tabIndex={-1} style={{ outline: "none" }} className="mt-5 max-w-3xl font-serif text-3xl font-semibold leading-tight sm:text-4xl">
          {heading}
        </h2>
        <p className="mt-4 max-w-2xl text-white/80">{body}</p>
        <ul className="mt-6 flex flex-wrap gap-2 text-xs font-medium text-white/80">
          {facts.filter(Boolean).map((f) => (
            <li key={f} className="rounded-full bg-white/10 px-3 py-1.5">
              {f}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="flex items-center gap-2.5 font-serif text-h3 font-semibold text-ink">
      <StarMark className="h-5 w-5 shrink-0 text-gold-500" />
      {children}
    </h3>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rotate-45 bg-gold-500" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

const REASON_STYLE: Record<Reason["tone"], { wrap: string; icon: ReactNode; sr: string }> = {
  talk: { wrap: "border-ink/20 bg-ink-900/[0.04]", icon: <AlertIcon />, sr: "To talk through:" },
  sort: { wrap: "border-gold-300 bg-gold-100/70", icon: <DotIcon />, sr: "To sort out:" },
  info: { wrap: "border-gold-light/60 bg-white", icon: <InfoIcon />, sr: "Worth knowing:" },
  good: { wrap: "border-transparent bg-gold-50", icon: <CheckCircle />, sr: "In your favour:" },
};

function ReasonRow({ reason }: { reason: Reason }) {
  const s = REASON_STYLE[reason.tone];
  return (
    <li className={`flex gap-3 rounded-2xl border p-4 text-sm text-ink/85 ${s.wrap}`}>
      <span className="mt-0.5 shrink-0">{s.icon}</span>
      <span>
        <span className="sr-only">{s.sr} </span>
        {reason.text}
      </span>
    </li>
  );
}

/** A 24-hour strip of the family's day: usual waking hours shaded, live lessons in gold. */
function DayStrip({ day }: { day: LocalDay }) {
  const pct = (m: number) => `${(m / 1440) * 100}%`;
  const s = day.start.minutes;
  const e = day.end.minutes;
  const segments = e > s ? [[s, e]] : [[s, 1440], [0, e]];
  return (
    <div className="mt-5" aria-hidden="true">
      <div className="relative h-7 overflow-hidden rounded-full bg-gold-100/60">
        <div className="absolute inset-y-0 bg-gold-50" style={{ left: pct(7 * 60), width: pct(14 * 60) }} />
        <div className="absolute inset-y-0 border-x border-dashed border-gold-300" style={{ left: pct(7 * 60), width: pct(14 * 60) }} />
        {segments.map(([a, b], i) => (
          <div key={i} className="absolute inset-y-1 rounded-full bg-gold-500" style={{ left: pct(a), width: pct(b - a) }} />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[0.7rem] text-ink/55">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/65">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-full bg-gold-500" /> {S.day.stripLive}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-full border border-dashed border-gold-300 bg-gold-50" /> {S.day.stripComfort}
        </span>
      </div>
    </div>
  );
}

const NEED_PILL: Record<NeedStatus, { label: string; cls: string }> = {
  ready: { label: S.need.statusReady, cls: "bg-teal-100 text-teal-900" },
  arrange: { label: S.need.statusArrange, cls: "bg-gold-100 text-gold-900" },
  missing: { label: S.need.statusMissing, cls: "bg-ink-900 text-white" },
  check: { label: S.need.statusCheck, cls: "bg-gold-50 text-ink/75 ring-1 ring-gold-light" },
};

function NeedPill({ status }: { status: NeedStatus }) {
  const p = NEED_PILL[status];
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${p.cls}`}>{p.label}</span>;
}

function NeedIcon({ status }: { status: NeedStatus }) {
  if (status === "ready")
    return (
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-teal-700 text-white" aria-hidden="true">
        <CheckIcon className="h-3.5 w-3.5" />
      </span>
    );
  return <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-md border-[1.5px] ${status === "missing" ? "border-ink/60" : "border-gold-500"}`} aria-hidden="true" />;
}

function planLine(payments: number[]): string {
  const n = payments.length;
  if (n === 1) return formatGBP(payments[0]);
  const even = payments.every((p) => p === payments[0]);
  return even ? `${n} × ${formatGBP(payments[0])}` : `${n - 1} × ${formatGBP(payments[0])}, then ${formatGBP(payments[n - 1])}`;
}

function CostDetails({ family, fees, years }: { family: NonNullable<ReturnType<typeof familyFees>>; fees: FeeSettingsInput; years: string[] }) {
  const base = family.plans.termly;
  const siblingOff = base.perChild.reduce((s, c) => s + c.siblingDiscount, 0);
  const plans = [
    { key: "annual", title: S.cost.annual, line: planLine(family.plans.annual.payments), note: fees.annualDiscountPercent > 0 ? S.cost.annualNote(fees.annualDiscountPercent) : "" },
    { key: "termly", title: S.cost.twoPayments, line: planLine(family.plans.termly.payments), note: family.plans.termly.payments.length === 2 ? S.cost.twoPaymentsNote : "" },
    { key: "monthly", title: S.cost.monthly, line: planLine(family.plans.monthly.payments), note: S.cost.monthlyNote(family.plans.monthly.payments.length) },
  ];
  const n = years.length;
  return (
    <>
      <table className="mt-5 w-full text-sm">
        <caption className="sr-only">{S.cost.perChildTitle}</caption>
        <tbody>
          {family.children.map((c, i) => (
            <tr key={`${c.year}-${i}`} className="border-b border-gold-light/30">
              <th scope="row" className="py-2.5 pr-3 text-left font-medium text-ink">
                {c.year}
                <span className="block text-xs font-normal text-ink/60">{c.band}</span>
              </th>
              <td className="py-2.5 text-right text-ink">{formatGBP(c.annual)}</td>
            </tr>
          ))}
          {siblingOff > 0 && (
            <tr className="border-b border-gold-light/30">
              <th scope="row" className="py-2.5 pr-3 text-left font-medium text-ink">{S.cost.siblingRow}</th>
              <td className="py-2.5 text-right text-teal-700">−{formatGBP(siblingOff)}</td>
            </tr>
          )}
          <tr>
            <th scope="row" className="py-2.5 pr-3 text-left font-semibold text-ink">{S.cost.perChildTitle}</th>
            <td className="py-2.5 text-right font-serif text-lg font-semibold text-ink">{formatGBP(base.total)}</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-gold-900">{S.cost.plansTitle}</p>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1">
        {plans.map((p) => (
          <div key={p.key} className="rounded-2xl border border-gold-light/50 bg-gold-50/50 p-3.5">
            <p className="text-xs font-semibold text-ink/65">{p.title}</p>
            <p className="mt-1 font-serif text-base font-semibold text-ink">{p.line}</p>
            {p.note && <p className="mt-1 text-xs text-ink/60">{p.note}</p>}
          </div>
        ))}
      </div>

      <ul className="mt-5 space-y-2 text-sm text-ink/80">
        <Bullet>{S.cost.applicationFee(Number.isInteger(family.applicationFee) ? `£${family.applicationFee}` : formatGBP(family.applicationFee), n)}</Bullet>
        {n > 1 && <Bullet>{family.siblingPercent ? S.cost.siblingLine(family.siblingPercent) : S.cost.siblingFallback}</Bullet>}
        {years.some((y) => yearNumber(y) >= 10) && <Bullet>{S.cost.examNote}</Bullet>}
      </ul>
    </>
  );
}

function NextSteps({ nextKey, callHref }: { nextKey: keyof typeof S.next.steps; callHref: string }) {
  const b = S.next.buttons;
  const h = S.next.hrefs;
  const call = { label: b.call, href: callHref };
  const evening = { label: b.openEvening, href: h.openEvening };
  const apply = { label: b.apply, href: h.apply };
  const register = { label: b.register, href: h.register };
  const order =
    nextKey === "strongJanuary" || nextKey === "sortJanuary"
      ? [apply, evening, call]
      : nextKey === "talk"
        ? [call, evening, apply]
        : nextKey === "later"
          ? [register, evening, call]
          : [evening, call, apply];
  return (
    <section className={`${card} grid gap-8 lg:grid-cols-[1fr_1.1fr]`} aria-labelledby="fc-next">
      <div>
        <SectionTitle id="fc-next">{S.next.title}</SectionTitle>
        <p className="mt-4 text-ink/80">{S.next.steps[nextKey]}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {order.map((btn, i) => (
            <Link key={btn.label} href={btn.href} className={i === 0 ? btnPrimary : btnSecondary}>
              {btn.label}
              {i === 0 && <ArrowRight />}
            </Link>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-900">{S.next.datesTitle}</p>
        <ol className="relative mt-4 space-y-0 border-l-[1.5px] border-gold-300 pl-6">
          {S.next.dates.map((d) => (
            <li key={`${d.label}-${d.when}`} className="relative pb-4 last:pb-0">
              <span className="absolute -left-[1.95rem] top-1 flex h-4 w-4 items-center justify-center bg-white text-gold-700" aria-hidden="true">
                <StarMark className="h-4 w-4" />
              </span>
              <Link href={d.href} className="group block">
                <span className="block text-sm font-semibold text-ink group-hover:underline">{d.label}</span>
                <span className="block text-sm text-ink/70">{d.when}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

type SendState = "idle" | "sending" | "sent" | "error";

function EmailSummary({
  answers,
  years,
  verdict,
  reasons,
  timing,
  family,
  nextKey,
}: {
  answers: FitAnswers;
  years: string[];
  verdict: Verdict;
  reasons: Reason[];
  timing: ReturnType<typeof assessTiming>;
  family: ReturnType<typeof familyFees>;
  nextKey: keyof typeof S.next.steps;
}) {
  const E = S.email;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [state, setState] = useState<SendState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (website) return;
    const clean = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return setError(E.emailError);
    if (!consent) return setError(E.consentError);
    setState("sending");
    try {
      // Loaded only when a family asks for the email, so the check itself never pulls in supabase-js.
      const [{ getSupabaseClient, getEdgeFunctionUrl }, { leadRef }] = await Promise.all([import("@/lib/supabase/client"), import("@/lib/leadRef")]);
      const supabase = getSupabaseClient();
      const functionUrl = getEdgeFunctionUrl("quiz-send-plan");
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabase || !functionUrl || !anonKey) throw new Error("not configured");

      const leadId = generateId();
      const { error: insertError } = await supabase.from("quiz_leads").insert({
        id: leadId,
        lead_ref: await leadRef(clean),
        email: clean,
        parent_name: name.trim() || null,
        consent_given_at: new Date().toISOString(),
        consent_text: E.consent,
        answers_snapshot: { source: "is-it-right-for-us", verdict, ...answers },
      });
      if (insertError) throw insertError;

      const zone = zoneCity(answers.timeZone);
      const w = timing.winter;
      const liveDayText =
        answers.timeZone === UK_TIME_ZONE
          ? `Live lessons run ${timing.ukStart} to ${timing.ukEnd} UK time, Monday to Thursday, and ${timing.ukStart} to ${timing.ukFridayEnd} on Fridays.`
          : `Live lessons run ${w.start.label} to ${w.end.label} ${zone} time, Monday to Thursday, and ${w.start.label} to ${w.fridayEnd.label} on Fridays (${timing.ukStart} to ${timing.ukEnd} UK time, Fridays to ${timing.ukFridayEnd}).${
              timing.changesInSummer ? ` ${S.day.summerChange(timing.summer.start.label, timing.summer.end.label)}` : ""
            }`;
      const feeSummary = family
        ? `Tuition ${formatGBP(family.plans.termly.total)} for January to July 2027 (${family.children.map((c) => `${c.year}: ${formatGBP(c.annual)}`).join("; ")}${
            family.plans.termly.totalDiscount > 0 ? ", sibling discount included" : ""
          }). In one payment ${planLine(family.plans.annual.payments)}, in two payments ${planLine(family.plans.termly.payments)}, or monthly ${planLine(family.plans.monthly.payments)}. Application fee £${family.applicationFee} per child; no registration fee.`
        : "";
      const keyStagesText = Array.from(new Set(years.map((y) => keyStageFor(y)?.title).filter(Boolean))).join(", ");

      const res = await fetch(functionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({
          leadId,
          verdict: C.verdicts[verdict].heading,
          yearGroup: years.join(", "),
          keyStage: keyStagesText,
          liveDayText,
          timezoneConcern: timing.tone === "late",
          feeSummary,
          texts: [
            ...reasons.map((r) => r.text),
            `${S.next.title}: ${S.next.steps[nextKey]}`,
            S.next.dates.map((d) => `${d.label}: ${d.when}`).join(". ") + ".",
          ],
        }),
      });
      const result = await res.json().catch(() => ({ ok: false }));
      if (!result?.ok) throw new Error("send failed");
      setState("sent");
    } catch {
      setState("error");
      setError(E.error);
    }
  }

  return (
    <section className={`${card} bg-gradient-to-br from-white to-gold-50`} aria-labelledby="fc-email">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr] lg:gap-10">
        <div>
          <SectionTitle id="fc-email">{E.title}</SectionTitle>
          <p className="mt-3 text-sm text-ink/75">{E.body}</p>
        </div>
        {state === "sent" ? (
          <p role="status" className="flex items-center gap-3 self-center rounded-2xl bg-teal-100 p-4 text-sm font-medium text-teal-900">
            <CheckCircle /> {E.sent(email.trim())}
          </p>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-3">
            <div className="hidden" aria-hidden="true">
              <label htmlFor="fc-website">Leave this field empty</label>
              <input id="fc-website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="fc-name" className="text-sm font-medium text-ink">{E.nameLabel}</label>
                <input id="fc-name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl border border-gold-light/70 bg-white px-3.5 py-2.5 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-300" />
              </div>
              <div>
                <label htmlFor="fc-email-input" className="text-sm font-medium text-ink">{E.emailLabel}</label>
                <input id="fc-email-input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-gold-light/70 bg-white px-3.5 py-2.5 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-300" />
              </div>
            </div>
            <label className="flex items-start gap-2.5 text-sm text-ink/80">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-gold-700)]" />
              <span>{E.consent}</span>
            </label>
            {error && (
              <p role="alert" className="text-sm font-medium text-ink">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <button type="submit" disabled={state === "sending"} className={btnPrimary}>
                {state === "sending" ? E.sending : E.submit}
              </button>
            </div>
            <p className="text-xs text-ink/60">
              {E.privacy}{" "}
              <Link href={E.privacyHref} className="font-semibold text-gold-900 underline underline-offset-2">
                {E.privacyLink}
              </Link>
              .
            </p>
          </form>
        )}
      </div>
    </section>
  );
}

// ── icons (decorative) ──────────────────────────────────────────────────

function ArrowRight() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  );
}
function ArrowLeft() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 10H4M9 5l-5 5 5 5" />
    </svg>
  );
}
function ChevronDown() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 text-gold-700" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 6v4l2.5 2" />
    </svg>
  );
}
function CheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  );
}
function CheckCircle() {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-700 text-white" aria-hidden="true">
      <CheckIcon className="h-3 w-3" />
    </span>
  );
}
function DotIcon() {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] border-gold-700" aria-hidden="true">
      <span className="h-2 w-2 rounded-full bg-gold-700" />
    </span>
  );
}
function InfoIcon() {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] border-gold-500 font-serif text-[0.7rem] font-bold text-gold-900" aria-hidden="true">
      i
    </span>
  );
}
function AlertIcon() {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-900 text-[0.75rem] font-bold text-white" aria-hidden="true">
      !
    </span>
  );
}
