/**
 * The portal's shared building blocks, so every page looks and behaves the
 * same: one set of buttons (primary, secondary, ghost, danger; two sizes),
 * one input style, one set of status chips and notices. Colour has a job:
 *
 *   gold, the action you take (Save, Submit, Mark, Issue)
 *   teal, where you are / what is selected (tabs, chosen filters, rows)
 *   amber, needs attention soon (due, late, waiting)
 *   red, a problem, or something that can't be undone (Delete)
 *   green, done (saved, returned, present)
 *
 * Sizes and shape, everywhere:
 *   - controls (buttons, inputs, selects) have 0.5rem corners; chips are pills;
 *     cards have 1rem corners.
 *   - every control is at least 44px tall on phones (an easy thumb target) and
 *     40px (md) or 32px (sm) from the small-tablet breakpoint up.
 *   - every control shows the same 2px focus ring when reached by keyboard.
 *
 * Use these instead of writing button and input classes by hand. Prefer the
 * <Button>, <ButtonLink> and <IconButton> components for new code; the string
 * classes in `ui` stay for existing pages.
 */
import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "@/components/learn/Icon";

import { Select } from "@/components/ui/Dropdown";
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";

/** Shape and behaviour shared by every button, whatever its colour. */
const btnBase = `inline-flex min-h-11 select-none items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-center text-sm leading-tight transition-colors sm:min-h-10 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-gold-700 font-semibold text-white shadow-sm hover:bg-gold-900",
  secondary: "border border-gold-light bg-white font-medium text-ink hover:border-ink/25 hover:bg-cream",
  ghost: "font-medium text-ink/75 hover:bg-cream hover:text-ink",
  danger: "bg-red-700 font-semibold text-white shadow-sm hover:bg-red-800",
};

/** Smaller buttons for inside rows, tables and cards. Still 44px tall on phones. */
const SM = "!min-h-11 !gap-1 !px-2.5 !py-1 !text-xs sm:!min-h-8";

/** The class string for a button of a given variant and size, for a <button>, <Link> or <a>. */
export function btn(variant: ButtonVariant = "secondary", size: ButtonSize = "md"): string {
  return `${btnBase} ${VARIANT[variant]}${size === "sm" ? ` ${SM}` : ""}`;
}

const inputBase = `block w-full min-h-11 rounded-lg border border-gold-light bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/55 transition-colors hover:border-ink/25 sm:min-h-10 disabled:cursor-not-allowed disabled:bg-cream disabled:opacity-70 ${focus}`;
const chipBase = `inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors sm:min-h-8 sm:px-3 ${focus}`;

export const ui = {
  /** The main action on a screen or row. One per view. */
  btnPrimary: btn("primary"),
  /** Every other action. */
  btnSecondary: btn("secondary"),
  /** A quiet action that doesn't need a box (Cancel, Show more, toolbar actions). */
  btnGhost: btn("ghost"),
  /** Deleting or removing for good. */
  btnDanger: btn("danger"),
  /** A square, icon-only button: give it an aria-label. 44px on phones, 40px above. */
  btnIcon: `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink/65 transition-colors hover:bg-cream hover:text-ink sm:h-10 sm:w-10 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`,
  /** A quiet text-only action (e.g. "Remove" beside a row). */
  btnLink: `inline-flex min-h-11 items-center gap-1 rounded text-sm font-medium text-teal-700 underline-offset-2 hover:underline sm:min-h-0 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`,
  btnLinkDanger: `inline-flex min-h-11 items-center gap-1 rounded text-sm font-medium text-red-700 underline-offset-2 hover:underline sm:min-h-0 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`,
  /** Add after any button class to make it the small size (rows, tables, cards). */
  sm: SM,

  /** Text fields, selects and textareas. */
  input: inputBase,
  /** Same as input; named for readability on <Select allowEmpty>. */
  select: inputBase,
  /** Same as input, with a comfortable minimum height for writing. */
  textarea: `${inputBase} min-h-[6rem] leading-relaxed`,
  label: "block text-sm font-medium text-ink",
  hint: "text-xs text-ink/65",
  /** A field's error message, under the input. */
  error: "text-xs font-medium text-red-700",

  card: "rounded-2xl border border-gold-light bg-white p-4 sm:p-6",
  /** A card's heading row: title on the left, one action on the right. */
  cardHead: "mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2",
  /** A card or section title. */
  sectionTitle: "text-base font-semibold text-ink",
  /** A row of filters and actions above a list. Wraps on phones. */
  toolbar: "flex flex-wrap items-center gap-2",
  /** Vertical rhythm between the blocks of a page (cards, sections). */
  stack: "space-y-6",
  /** A comfortable line length for paragraphs, help text and forms. */
  readable: "max-w-prose",
  /** A form laid out at a sensible width: one column on phones, two from tablet. */
  formGrid: "grid max-w-3xl gap-4 sm:grid-cols-2",

  /** A filter chip; pass aria-pressed and use chipOn for the chosen one. */
  chip: `${chipBase} border-gold-light bg-white text-ink/75 hover:border-ink/25 hover:bg-cream hover:text-ink`,
  chipOn: `${chipBase} border-teal-700 bg-teal-700 text-white`,
} as const;

type BtnOwnProps = { variant?: ButtonVariant; size?: ButtonSize; icon?: IconName; iconRight?: IconName; className?: string; children?: ReactNode };

/** A button with the portal's look: `<Button variant="primary" icon="plus">Add pupil</Button>`. */
export function Button({ variant = "secondary", size = "md", icon, iconRight, className = "", children, type = "button", ...rest }: BtnOwnProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  return (
    <button type={type} className={`${btn(variant, size)} ${className}`} {...rest}>
      {icon && <Icon name={icon} size="sm" />}
      {children}
      {iconRight && <Icon name={iconRight} size="sm" />}
    </button>
  );
}

/** A link that looks like a button (for navigation, never for actions). */
export function ButtonLink({ variant = "secondary", size = "md", icon, iconRight, className = "", children, ...rest }: BtnOwnProps & Omit<ComponentProps<typeof Link>, "className" | "children">) {
  return (
    <Link className={`${btn(variant, size)} ${className}`} {...rest}>
      {icon && <Icon name={icon} size="sm" />}
      {children}
      {iconRight && <Icon name={iconRight} size="sm" />}
    </Link>
  );
}

/** A square icon-only button. `label` is required: it is read out and shown as a tooltip. */
export function IconButton({ icon, label, className = "", type = "button", ...rest }: { icon: IconName; label: string; className?: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children" | "aria-label">) {
  return (
    <button type={type} aria-label={label} title={label} className={`${ui.btnIcon} ${className}`} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

/** A labelled form field: label, the control, then a hint or an error. Pass the control's id as `htmlFor`. */
export function Field({ label, htmlFor, hint, error, children, className = "" }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={htmlFor} className={ui.label}>
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className={ui.error}>
          {error}
        </p>
      ) : (
        hint && <p className={ui.hint}>{hint}</p>
      )}
    </div>
  );
}

/** A titled block on a page: heading, an optional line of help, one optional action, then the content. */
export function Section({ title, description, action, children, className = "" }: { title: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${ui.card} ${className}`}>
      <div className={ui.cardHead}>
        <div className="min-w-0">
          <h2 className={ui.sectionTitle}>{title}</h2>
          {description && <p className="mt-0.5 max-w-prose text-sm text-ink/65">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

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
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`group flex min-h-11 w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-cream ${focus}`}>
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

const NOTICE_ICON: Record<Exclude<Tone, "neutral">, IconName> = {
  info: "info",
  good: "circleCheck",
  warn: "triangleAlert",
  bad: "circleAlert",
};

/** A message about what just happened or what needs doing. Errors are announced at once. */
export function Notice({ tone = "info", children }: { tone?: Exclude<Tone, "neutral">; children: ReactNode }) {
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${NOTICE[tone]}`}>
      <Icon name={NOTICE_ICON[tone]} size="sm" className="mt-0.5 h-4 w-4 opacity-80" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** "Nothing here yet" with what to do about it: an icon tile, the headline, one line of help and (ideally) the action that fills it. */
export function EmptyState({ title, children, icon = "inbox", tile = "tile-gold", action }: { title: string; children?: ReactNode; icon?: IconName; tile?: string; action?: ReactNode }) {
  return (
    <div className="portal-empty rounded-2xl border border-dashed border-gold-light px-5 py-10 text-center sm:py-12">
      <span className={`portal-tile portal-tile--lg mx-auto ${tile}`} aria-hidden="true">
        <Icon name={icon} />
      </span>
      <p className="mt-4 text-base font-semibold text-ink">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-ink/70">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
