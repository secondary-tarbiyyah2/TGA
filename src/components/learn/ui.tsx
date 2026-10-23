/**
 * The portal's shared building blocks, so every page looks and behaves the
 * same: one primary action style, one secondary, one destructive; one input
 * style; one set of status chips and notices. Colour has a job:
 *
 *   gold   — the action you take (Save, Submit, Mark, Issue)
 *   teal   — where you are / what is selected (tabs, chosen filters, rows)
 *   amber  — needs attention soon (due, late, waiting)
 *   red    — a problem, or something that can't be undone (Delete)
 *   green  — done (saved, returned, present)
 *
 * Use these instead of writing button and input classes by hand.
 */
import type { ReactNode } from "react";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";

export const ui = {
  /** The main action on a screen or row. */
  btnPrimary: `inline-flex items-center justify-center gap-1.5 rounded-lg bg-gold-700 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-gold-900 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`,
  /** Every other action. */
  btnSecondary: `inline-flex items-center justify-center gap-1.5 rounded-lg border border-gold-light bg-white px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:opacity-50 ${focus}`,
  /** Deleting or removing for good. */
  btnDanger: `inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-700 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`,
  /** A quiet text-only action (e.g. "Remove" beside a row). */
  btnLink: `text-sm font-medium text-teal-700 hover:underline disabled:opacity-50 ${focus}`,
  btnLinkDanger: `text-sm font-medium text-red-700 hover:underline disabled:opacity-50 ${focus}`,
  /** Smaller buttons for inside rows and tables. */
  sm: "!px-2.5 !py-1 !text-xs",

  input: `block w-full rounded-lg border border-gold-light bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/65 disabled:bg-cream ${focus}`,
  label: "block text-sm font-medium text-ink",
  hint: "text-xs text-ink/65",

  card: "rounded-2xl border border-gold-light bg-white p-4 sm:p-5",
  /** A filter chip; pass aria-pressed and use chipOn for the chosen one. */
  chip: `rounded-full border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink/75 hover:bg-cream ${focus}`,
  chipOn: `rounded-full border border-teal-700 bg-teal-700 px-3 py-1.5 text-sm font-medium text-white ${focus}`,
} as const;

export type Tone = "neutral" | "info" | "good" | "warn" | "bad";

const CHIP: Record<Tone, string> = {
  neutral: "bg-cream text-ink/75 ring-gold-light",
  info: "bg-teal-100 text-teal-900 ring-teal-700/20",
  good: "bg-green-50 text-green-800 ring-green-600/20",
  warn: "bg-amber-50 text-amber-900 ring-amber-600/25",
  bad: "bg-red-50 text-red-800 ring-red-600/20",
};


/** An on/off switch: a sliding knob that carries a tick when on. Use for every yes/no setting. */
export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (next: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`group flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-cream ${focus}`}>
      <SwitchKnob checked={checked} />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink/65">{hint}</span>}
      </span>
    </button>
  );
}

/** The visual part of the switch, shared so every toggle in the portal looks identical. */
export function SwitchKnob({ checked }: { checked: boolean }) {
  return (
    <span aria-hidden="true" className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full shadow-inner transition-colors duration-200 ${checked ? "bg-teal-700" : "bg-ink/20"}`}>
      <span className={`absolute flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-[left] duration-200 motion-reduce:transition-none ${checked ? "left-[22px]" : "left-0.5"}`}>
        <svg viewBox="0 0 24 24" className={`h-3 w-3 transition-opacity ${checked ? "text-teal-700 opacity-100" : "opacity-0"}`} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    </span>
  );
}

/** A small status label: Present, Late, Draft, Issued, Overdue… */
export function StatusChip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${CHIP[tone]}`}>{children}</span>;
}

const NOTICE: Record<Exclude<Tone, "neutral">, string> = {
  info: "border-teal-700/20 bg-teal-100 text-teal-900",
  good: "border-green-200 bg-green-50 text-green-900",
  warn: "border-amber-200 bg-amber-50 text-amber-950",
  bad: "border-red-200 bg-red-50 text-red-800",
};

/** A message about what just happened or what needs doing. Errors are announced at once. */
export function Notice({ tone = "info", children }: { tone?: Exclude<Tone, "neutral">; children: ReactNode }) {
  return (
    <p role={tone === "bad" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${NOTICE[tone]}`}>
      {children}
    </p>
  );
}

/** "Nothing here yet" with what to do about it. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-gold-light bg-white px-5 py-8 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-ink/70">{children}</div>}
    </div>
  );
}
