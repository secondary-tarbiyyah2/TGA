/**
 * The portal's shared building blocks, so every page looks and behaves the
 * same: one set of buttons (primary, secondary, ghost, danger; two sizes),
 * one input style, one set of status chips and notices. Colour has a job:
 *
 *   forest green, the action you take and where you are (Save, selected tabs,
 *     chosen filters, links). In the portal the teal-* classes are forest too.
 *   gold, the brand accent only (logo, the active-page marker, key figures)
 *   amber, needs attention soon (due, late, waiting)
 *   red, a problem, or something that can't be undone (Delete)
 *   green, done (saved, returned, present)
 *
 * Sizes and shape, everywhere (Evergreen, owner's choice 11 Nov 2026; DESIGN.md):
 *   - buttons 40px with 11px corners (small 32px, 9px corners); text fields 44px
 *     with 11px corners; chips and tags are pills; cards have 18px corners.
 *   - primary is a forest gradient with an inner highlight; secondary is white
 *     with a soft edge and a tiny shadow; danger is the same shape in red.
 *   - every control is at least 44px tall on phones (an easy thumb target).
 *   - every control shows the same soft green focus ring when reached by keyboard.
 * The look itself lives in globals.css (.portal-btn, .portal-field, .portal-pill,
 * .portal-tag), so a change there reaches every page.
 *
 * Use these instead of writing button and input classes by hand. Prefer the
 * <Button>, <ButtonLink> and <IconButton> components for new code; the string
 * classes in `ui` stay for existing pages.
 */
import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "@/components/learn/Icon";

const focus = "focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--portal-focus-ring)]";

/** Shape and behaviour shared by every button, whatever its colour (globals.css: .portal-btn). */
const btnBase = "portal-btn inline-flex select-none items-center justify-center gap-2 text-center leading-tight disabled:cursor-not-allowed disabled:opacity-50";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  // Forest green: the portal's action colour. Gold only for the class hero's Join button.
  primary: "portal-btn--primary",
  secondary: "portal-btn--secondary",
  ghost: "portal-btn--ghost",
  danger: "portal-btn--danger",
  gold: "portal-btn--gold",
};

/** Smaller buttons for inside rows, tables and cards. Still 44px tall on phones. */
const SM = "portal-btn--sm";

/** The class string for a button of a given variant and size, for a <button>, <Link> or <a>. */
export function btn(variant: ButtonVariant = "secondary", size: ButtonSize = "md"): string {
  return `${btnBase} ${VARIANT[variant]}${size === "sm" ? ` ${SM}` : ""}`;
}

const inputBase = "portal-field disabled:cursor-not-allowed";
const chipBase = "portal-pill";

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
  btnIcon: `${btnBase} portal-btn--ghost portal-btn--icon`,
  /** A quiet text-only action (e.g. "Remove" beside a row). */
  btnLink: `inline-flex min-h-11 items-center gap-1 rounded text-sm font-semibold text-forest-700 underline-offset-2 hover:underline sm:min-h-0 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`,
  btnLinkDanger: `inline-flex min-h-11 items-center gap-1 rounded text-sm font-semibold text-red-700 underline-offset-2 hover:underline sm:min-h-0 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`,
  /** Add after any button class to make it the small size (rows, tables, cards). */
  sm: SM,

  /** Text fields, selects and textareas. */
  input: inputBase,
  /** Same as input; named for readability on <select>. */
  select: inputBase,
  /** Same as input, with a comfortable minimum height for writing. */
  textarea: `${inputBase} min-h-[6rem] leading-relaxed`,
  label: "block text-sm font-semibold text-ink",
  hint: "text-xs text-ink-500",
  /** A field's error message, under the input. */
  error: "text-xs font-medium text-red-700",

  card: "rounded-2xl border border-gold-light bg-white p-5",
  /** A card's heading row: title on the left, one action on the right. */
  cardHead: "mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2",
  /** A card or section title. */
  sectionTitle: "t-section",
  /** A row of filters and actions above a list. Wraps on phones. */
  toolbar: "flex flex-wrap items-center gap-2",
  /** Vertical rhythm between the blocks of a page (cards, sections). */
  stack: "space-y-6",
  /** A comfortable line length for paragraphs, help text and forms. */
  readable: "max-w-prose",
  /** A form laid out at a sensible width: one column on phones, two from tablet. */
  formGrid: "grid max-w-3xl gap-4 sm:grid-cols-2",

  /** A filter pill; pass aria-pressed and use chipOn for the chosen one. */
  chip: chipBase,
  chipOn: `${chipBase} portal-pill--on`,
  /** A segmented control's track; its buttons carry aria-pressed (the chosen one is raised in white). */
  seg: "portal-seg",
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
          {description && <p className="mt-0.5 max-w-prose text-sm text-ink-500">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export type Tone = "neutral" | "info" | "good" | "warn" | "bad";

/** Tags (Evergreen): soft tinted pills, one tint per meaning. */
const TAG: Record<Tone, string> = {
  neutral: "portal-tag",
  info: "portal-tag portal-tag--info",
  good: "portal-tag portal-tag--ok",
  warn: "portal-tag portal-tag--warn",
  bad: "portal-tag portal-tag--bad",
};

/** A tag: a soft tinted pill ("Lesson note", "Due Thu", "Taken"). */
export function Tag({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`${TAG[tone]} ${className}`}>{children}</span>;
}

const AVATAR_TINTS = 6;
/** Initials of a name, skipping honorifics ("Ustadh Yusuf Ali" gives "YA"). */
export function initialsOf(name: string): string {
  const parts = (name || "")
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .map((p) => p.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean);
  while (parts.length > 1 && /^(ustadh|ustadha|ustaadh|ustaadha|shaykh|sheikh|shaykha|mr|mrs|ms|miss|dr|br|sr|brother|sister|imam|hafiz|hafidh|hafiza|maulana|mufti|qari|qariah)$/i.test(parts[0])) parts.shift();
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}
function tintOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % AVATAR_TINTS;
}

/** A round avatar: initials on a soft tint chosen from the name (decorative; the name sits beside it). */
export function Avatar({ name, seed, size = 34, className = "" }: { name: string; seed?: string; size?: number; className?: string }) {
  return (
    <span aria-hidden="true" data-tint={tintOf(seed || name)} className={`portal-initials ${className}`} style={size === 34 ? undefined : { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.34)) }}>
      {initialsOf(name)}
    </span>
  );
}

/** A thin progress bar (decorative: say the figure in words beside it). */
export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span aria-hidden="true" className={`portal-bar ${className}`}>
      <span style={{ width: `${v}%` }} />
    </span>
  );
}

/** An on/off switch: a sliding knob that carries a tick when on. Use for every yes/no setting. */
export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (next: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`group flex min-h-11 w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[var(--portal-row-hover)] ${focus}`}>
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
    <span aria-hidden="true" className={`relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-200 motion-reduce:transition-none ${checked ? "bg-forest-700" : "bg-[var(--portal-control-line)]"}`}>
      <span className={`absolute flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-[left] duration-200 motion-reduce:transition-none ${checked ? "left-[19px]" : "left-[3px]"}`}>
        <svg viewBox="0 0 24 24" className={`h-2.5 w-2.5 transition-opacity ${checked ? "text-forest-700 opacity-100" : "opacity-0"}`} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    </span>
  );
}

/** A small status label: Present, Late, Draft, Issued, Overdue… */
export function StatusChip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={TAG[tone]}>{children}</span>;
}

/**
 * The portal's status language (DESIGN.md): a small dot and a plain word, never a big
 * coloured badge. Colour only where it means something: green done, amber needs attention,
 * red overdue, grey waiting or unavailable.
 */
export type StatusKind = "pending" | "in_progress" | "completed" | "attention" | "overdue" | "approved" | "unavailable";
export const STATUS: Record<StatusKind, { label: string; dot: string; text: string; tone: Tone }> = {
  pending: { label: "Pending", dot: "bg-ink/30", text: "text-ink-700", tone: "neutral" },
  in_progress: { label: "In progress", dot: "bg-forest-500", text: "text-ink-700", tone: "info" },
  completed: { label: "Completed", dot: "bg-forest-700", text: "text-forest-800", tone: "good" },
  attention: { label: "Needs attention", dot: "bg-amber-500", text: "text-amber-900", tone: "warn" },
  overdue: { label: "Overdue", dot: "bg-red-600", text: "text-red-800", tone: "bad" },
  approved: { label: "Approved", dot: "bg-forest-700", text: "text-forest-800", tone: "good" },
  unavailable: { label: "Unavailable", dot: "border border-ink/35 bg-transparent", text: "text-ink-500", tone: "neutral" },
};

/** A status: a soft tinted pill with a word. `children` replaces the word ("4 of 6 approved"). */
export function Status({ kind, children, className = "" }: { kind: StatusKind; children?: ReactNode; className?: string }) {
  const s = STATUS[kind];
  return <span className={`${TAG[s.tone]} ${className}`}>{children ?? s.label}</span>;
}

const NOTICE: Record<Exclude<Tone, "neutral">, string> = {
  info: "border-[color-mix(in_oklab,var(--tone-info)_18%,transparent)] bg-[var(--tone-info-bg)] text-[var(--tone-info)]",
  good: "border-[color-mix(in_oklab,var(--tone-ok)_18%,transparent)] bg-[var(--tone-ok-bg)] text-[var(--tone-ok)]",
  warn: "border-[color-mix(in_oklab,var(--tone-warn)_18%,transparent)] bg-[var(--tone-warn-bg)] text-[var(--tone-warn)]",
  bad: "border-[color-mix(in_oklab,var(--tone-bad)_18%,transparent)] bg-[var(--tone-bad-bg)] text-[var(--tone-bad)]",
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
    <div role={tone === "bad" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${NOTICE[tone]}`}>
      <Icon name={NOTICE_ICON[tone]} size="sm" className="mt-0.5 h-4 w-4 opacity-80" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * One titled part of a long form ("About the pupil", "Parent", "Classes"),
 * so a form reads as a few short groups instead of one long column. The
 * title is the group's <legend>, so screen readers announce it with each
 * field. Put several in a row; a hairline and space separate them.
 * Layout only: the fields inside keep their own names, values and handlers.
 */
export function FormSection({ title, description, children, className = "" }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={`portal-form-section min-w-0 border-0 p-0 ${className}`}>
      <legend className="float-left w-full p-0 text-[0.8125rem] font-semibold uppercase tracking-[0.06em] text-ink-700">{title}</legend>
      {description && <p className="clear-both pt-1 text-xs leading-relaxed text-ink/65">{description}</p>}
      <div className="clear-both space-y-4 pt-3">{children}</div>
    </fieldset>
  );
}

/**
 * Loading: a thin moving line and a few words, announced to screen readers. Deliberately not
 * shaped like the content that is coming (owner brief: placeholders must never look like the
 * permanent page). `rows` is kept for callers and sets how much room it takes.
 */
export function LoadingState({ rows = 4, label = "Loading", className = "" }: { rows?: number; label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--portal-control-line)] px-5 ${className}`} style={{ minHeight: `${Math.max(6, Math.min(rows, 8) * 1.75)}rem` }}>
      <div className="portal-progress w-32" aria-hidden="true" />
      <p className="t-meta">{label.replace(/\u2026$|\.\.\.$/, "")}</p>
    </div>
  );
}

/** "Nothing here yet" with what to do about it: a quiet icon, the headline, one line of help and (ideally) the action that fills it. */
export function EmptyState({ title, children, icon = "inbox", action }: { title: string; children?: ReactNode; icon?: IconName; /** Kept for callers; empty states no longer use coloured tiles. */ tile?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--portal-control-line)] bg-[var(--portal-surface)] px-5 py-10 text-center sm:py-12">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-50 text-forest-700" aria-hidden="true">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="t-section mt-3">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-ink-500">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
