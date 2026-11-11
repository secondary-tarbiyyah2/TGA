"use client";

/**
 * Redesign building blocks (docs/portal-redesign.md, phase 2). Everything a
 * page needs beyond ui.tsx's buttons and fields:
 *
 *   ActionsMenu    occasional actions behind one "More" button, never a row of six buttons
 *   ConfirmDialog  the one confirmation dialog (use useConfirm(), not window.confirm)
 *   StatTile       a figure and its label, for dashboard and unit headers
 *   WorkflowBadge  the six review statuses with one colour and label each
 *   Eyebrow        the small "SUBJECT / YEAR" line above a workspace title
 *   WorkspaceHeader the compact header of a unit or lesson workspace
 *
 * Colour rules: forest green for actions and "you are here", gold only as an
 * accent, amber/red/green only for status.
 */
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/learn/Icon";
import { btn, Button } from "@/components/learn/ui";

// ── ActionsMenu ───────────────────────────────────────────────────────

export type MenuAction = {
  label: string;
  icon?: IconName;
  onSelect?: () => void;
  href?: string;
  disabled?: boolean;
  /** Draw it red and put it after a divider (Delete, Withdraw). */
  danger?: boolean;
  /** A heading line that groups the items after it. */
  section?: string;
  /** A second, quieter line under the label ("Work to hand in, marked by you"). */
  hint?: string;
  /** A short note on the right of the item ("Current"). */
  aside?: string;
  /** Not an action: a block drawn as-is in the menu (e.g. display settings), with a hairline above it. */
  content?: ReactNode;
};

/**
 * A "More actions" button that opens a menu. Keyboard: Enter/Space/Down opens
 * and focuses the first item; arrows move; Escape closes and returns focus.
 */
export function ActionsMenu({
  items,
  label = "More actions",
  trigger,
  align = "right",
  size = "md",
  triggerContent,
  triggerClassName,
  header,
  menuClassName = "min-w-[13.5rem]",
  placement = "below",
  onOpenChange,
}: {
  items: MenuAction[];
  /** Accessible name; also the visible text when `trigger` is "text" or "primary". */
  label?: string;
  /** "icon" (three dots, default), "text" (label and a chevron) or "primary" (the page's main button, with a chevron). */
  trigger?: "icon" | "text" | "primary";
  align?: "left" | "right";
  size?: "sm" | "md";
  /** A custom trigger (e.g. the account avatar); `label` stays its accessible name. */
  triggerContent?: ReactNode;
  triggerClassName?: string;
  /** A non-interactive block at the top of the menu (e.g. who is signed in). */
  header?: ReactNode;
  /** Width of the open menu. */
  menuClassName?: string;
  /** Open under the trigger (default) or above it (a trigger at the foot of the screen). */
  placement?: "below" | "above";
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  // The side the menu opens to: `align`, flipped when that would run off a phone screen.
  const [side, setSide] = useState(align);
  const id = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const shown = items.filter((i) => i.section || i.onSelect || i.href || i.content);
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  const hasIcons = shown.some((i) => i.icon);

  const focusItem = (n: number) => {
    const els = listRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([aria-disabled=true])");
    if (!els || !els.length) return;
    els[(n + els.length) % els.length].focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest?.(`[data-menu="${id}"]`)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    // Move focus into the menu once it has rendered.
    const t = window.setTimeout(() => {
      const list = listRef.current;
      const r = list?.getBoundingClientRect();
      if (r && r.left < 8) setSide("left");
      else if (r && r.right > window.innerWidth - 8) setSide("right");
      list?.querySelector<HTMLElement>("[role=menuitem]:not([aria-disabled=true])")?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, id]);

  const onListKey = (e: React.KeyboardEvent) => {
    const els = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([aria-disabled=true])") || []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    // Inside a `content` block (its own buttons and switches), keys behave as usual; only Escape closes.
    if (i < 0 && e.key !== "Escape" && (e.target as HTMLElement).closest?.("[data-menu-content]")) return;
    const move: Record<string, number> = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: -1 };
    if (e.key in move) {
      e.preventDefault();
      focusItem(move[e.key]);
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      if (e.key === "Escape") btnRef.current?.focus();
    }
  };

  const small = size === "sm";
  return (
    <div className="relative inline-flex" data-menu={id}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={trigger === "text" || trigger === "primary" ? undefined : label}
        title={trigger === "text" || trigger === "primary" || triggerContent ? undefined : label}
        onClick={() => {
          setSide(align);
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={
          triggerContent
            ? triggerClassName || "inline-flex items-center rounded-lg hover:bg-cream"
            : trigger === "primary"
              ? `${btn("primary", small ? "sm" : "md")}`
              : trigger === "text"
            ? `${btn("secondary", small ? "sm" : "md")}`
            : `${btn("secondary", small ? "sm" : "md")} portal-btn--icon ${small ? "sm:!w-8 sm:!min-w-8" : ""}`
        }
      >
        {triggerContent ? (
          triggerContent
        ) : trigger === "text" || trigger === "primary" ? (
          <>
            {label}
            <Icon name="chevronDown" size="sm" />
          </>
        ) : (
          <Icon name="ellipsis" size={small ? "sm" : "md"} />
        )}
      </button>
      {open && (
        <div
          ref={listRef}
          role="menu"
          aria-label={label}
          onKeyDown={onListKey}
          className={`portal-menu absolute z-40 max-h-[min(80vh,40rem)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-[var(--portal-line)] bg-white p-1.5 shadow-lg ${placement === "above" ? "bottom-full mb-1.5" : "top-full mt-1"} ${menuClassName} ${side === "right" ? "right-0" : "left-0"}`}
        >
          {header && (
            <div role="presentation" className="-mx-1 -mt-1 mb-1 border-b border-gold-light px-4 py-3">
              {header}
            </div>
          )}
          {shown.map((it, i) => {
            if (it.content)
              return (
                <div key={`c${i}`} role="none" data-menu-content="" className="-mx-1 my-1 border-t border-gold-light px-1 pt-1">
                  {it.content}
                </div>
              );
            if (it.section)
              return (
                <p key={`s${i}`} role="presentation" className="px-3 pb-1 pt-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink/55">
                  {it.section}
                </p>
              );
            const cls = `flex min-h-10 w-full items-center gap-2.5 rounded-[0.625rem] px-2.5 py-1.5 text-left text-sm font-medium outline-none focus:bg-[var(--portal-hover)] hover:bg-[var(--portal-hover)] ${
              it.danger ? "text-red-700" : "text-ink"
            } ${it.disabled ? "pointer-events-none opacity-45" : ""}`;
            const inner = (
              <>
                {it.icon ? <Icon name={it.icon} size="sm" className={`h-4 w-4 shrink-0 ${it.danger ? "" : "text-ink-500"}`} /> : hasIcons ? <span className="w-4 shrink-0" aria-hidden="true" /> : null}
                {it.hint ? (
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{it.label}</span>
                    <span className="block text-xs text-ink/65">{it.hint}</span>
                  </span>
                ) : (
                  <span className="min-w-0 flex-1">{it.label}</span>
                )}
                {it.aside && <span className="shrink-0 text-xs font-medium text-teal-700">{it.aside}</span>}
              </>
            );
            const divider = it.danger && i > 0 && !shown[i - 1].danger ? <hr className="my-1 border-gold-light" /> : null;
            return (
              <div key={`${it.label}${i}`} role="none">
                {divider}
                {it.href ? (
                  <Link href={it.href} role="menuitem" aria-disabled={it.disabled || undefined} tabIndex={-1} onClick={() => setOpen(false)} className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    aria-disabled={it.disabled || undefined}
                    onClick={() => {
                      if (it.disabled) return;
                      setOpen(false);
                      it.onSelect?.();
                    }}
                    className={cls}
                  >
                    {inner}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Dialogs ───────────────────────────────────────────────────────────

/**
 * The portal's dialog frame: a title, the content and a footer of actions.
 * Escape and the backdrop close it; focus moves into it and back out.
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  size = "md",
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const el = ref.current?.querySelector<HTMLElement>("[data-autofocus], button, [href], input, select, textarea");
    el?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && closeRef.current();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      back?.focus?.();
    };
  }, []);
  const width = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-lg";
  return (
    <div className="portal fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="portal-scrim absolute inset-0 bg-ink/40" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`portal-menu relative flex max-h-[92vh] w-full ${width} flex-col overflow-hidden rounded-t-[1.375rem] border border-[var(--portal-line)] bg-white shadow-xl sm:rounded-[1.375rem]`}>
        <div className="px-6 pb-2 pt-6">
          <h2 id={titleId} className="text-lg font-bold tracking-[-0.015em] text-ink">
            {title}
          </h2>
          {description && <div className="mt-1 text-sm text-ink-500">{description}</div>}
        </div>
        {children && <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">{children}</div>}
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 px-6 pb-6 pt-4">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * A panel that slides in from the right (a sheet from the bottom on phones) to show the
 * detail of something picked on the page without leaving it: progressive disclosure. Escape,
 * the close button and the backdrop close it; focus moves into it and back out.
 */
export function SidePanel({ title, eyebrow, onClose, children, footer, label, size = "md" }: { title: ReactNode; eyebrow?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; label?: string; /** "lg" for forms (setting work, a pupil's details); "md" for a record's detail. */ size?: "md" | "lg" }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // The latest onClose, so a parent re-rendering (typing in a form inside) never re-runs the
  // open effect and pulls focus back to the panel.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    // Escape closes the panel, unless something inside it (an open dropdown) used it first.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && closeRef.current();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      back?.focus?.();
    };
  }, []);
  const width = size === "lg" ? "sm:w-[min(44rem,94vw)]" : "sm:w-[min(36rem,92vw)]";
  return (
    <div className="portal fixed inset-0 z-[90] flex items-end justify-end sm:items-stretch sm:p-3">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="portal-scrim absolute inset-0 bg-ink/35" />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-label={label} className={`portal-sheet relative flex ${size === "lg" ? "max-h-[94dvh]" : "max-h-[88vh]"} w-full flex-col overflow-hidden rounded-t-[1.375rem] bg-white shadow-xl outline-none sm:max-h-none ${width} sm:rounded-[1.375rem] sm:border sm:border-[var(--portal-line)]`}>
        <div className="flex items-start gap-3 border-b border-[var(--portal-line-soft)] px-6 py-5">
          <div className="min-w-0 flex-1">
            {eyebrow && <div className="t-eyebrow mb-1">{eyebrow}</div>}
            <h2 id={titleId} className="text-lg font-bold tracking-[-0.015em] text-ink">
              {title}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={`${btn("secondary")} portal-btn--icon -mr-1 -mt-1 shrink-0`}>
            <Icon name="x" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center gap-2 border-t border-[var(--portal-line-soft)] bg-[var(--portal-row-hover)] px-6 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

type ConfirmOptions = { title: string; description?: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean; /** A notice: one OK button, no Cancel. */ noCancel?: boolean };

/** One confirmation, the same everywhere. Prefer `useConfirm()`. */
export function ConfirmDialog({ title, description, confirmLabel = "Confirm", cancelLabel = "Cancel", danger, noCancel, onConfirm, onCancel }: ConfirmOptions & { onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog
      title={title}
      description={description}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          {!noCancel && (
            <Button variant="ghost" onClick={onCancel}>
              {cancelLabel}
            </Button>
          )}
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

// The mounted provider's ask(), for askConfirm() in plain event handlers.
let activeAsk: ((o: ConfirmOptions) => Promise<boolean>) | null = null;

const DANGER_VERBS = /^(delete|remove|void|cancel|reject|recall|withdraw|close|stop|reset|take|clock|mark .* as (left|unsuccessful|withdrawn))\b/i;

/**
 * `if (!(await askConfirm("Delete this item? Pupils will no longer see it."))) return;`
 * The portal's own dialog in place of window.confirm (docs/portal-redesign.md):
 * the first sentence (up to the first "?") is the title, the rest the
 * explanation; "Delete…", "Remove…", "Void…" and the like get a red button
 * named after the verb. Outside the portal shell it falls back to the browser.
 */
export function askConfirm(message: string, opts: Partial<ConfirmOptions> = {}): Promise<boolean> {
  const cut = message.indexOf("?");
  const title = cut > 0 && cut < message.length - 1 ? message.slice(0, cut + 1) : message;
  const rest = cut > 0 && cut < message.length - 1 ? message.slice(cut + 1).trim() : "";
  const verb = /^(\w+)/.exec(title)?.[1] || "";
  const danger = DANGER_VERBS.test(title);
  const o: ConfirmOptions = {
    title,
    description: rest || undefined,
    danger,
    confirmLabel: verb && verb.length <= 12 && /^[A-Z]/.test(verb) ? verb : "Confirm",
    ...opts,
  };
  if (activeAsk) return activeAsk(o);
  return Promise.resolve(typeof window !== "undefined" && window.confirm(message));
}

/**
 * `await askNotice("Can't accept yet", "Mark the documents as received first.")`
 * The portal's own message box in place of window.alert: a title, an
 * explanation and one OK button. Outside the portal shell it falls back to the browser.
 */
export function askNotice(title: string, description?: string): Promise<void> {
  const o: ConfirmOptions = { title, description, confirmLabel: "OK", noCancel: true };
  if (activeAsk) return activeAsk(o).then(() => undefined);
  if (typeof window !== "undefined") window.alert(description ? `${title}\n\n${description}` : title);
  return Promise.resolve();
}

/** Mounted once by the portal shell; pages call useConfirm(). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...o, resolve })), []);
  useEffect(() => {
    activeAsk = ask;
    return () => {
      if (activeAsk === ask) activeAsk = null;
    };
  }, [ask]);
  const done = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {pending && <ConfirmDialog {...pending} onConfirm={() => done(true)} onCancel={() => done(false)} />}
    </ConfirmContext.Provider>
  );
}

/**
 * `const confirm = useConfirm(); if (!(await confirm({ title: "Delete this lesson?", danger: true }))) return;`
 * Falls back to the browser's confirm outside the portal shell.
 */
export function useConfirm(): (o: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  return ctx || ((o) => Promise.resolve(typeof window !== "undefined" && window.confirm(o.title)));
}

// ── Loading ─────────────────────────────────────────────────────────

/**
 * The portal's one loading state: a few soft placeholder bars where the
 * content will appear (not a bare "Loading…" line), announced politely to
 * screen readers. `lines` sets how tall it is; `bare` drops the card.
 */
export function Loading({ label = "Loading", lines = 3, bare = false, className = "" }: { label?: string; lines?: number; bare?: boolean; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center justify-center gap-2.5 ${bare ? "py-4" : "rounded-2xl border border-dashed border-[var(--portal-control-line)] px-5"} ${className}`} style={bare ? undefined : { minHeight: `${Math.max(4.5, Math.min(lines, 8) * 1.5)}rem` }}>
      <div className="portal-progress w-28" aria-hidden="true" />
      <p className="t-meta">{label.replace(/\u2026$|\.\.\.$/, "")}</p>
    </div>
  );
}

// ── Figures and statuses ──────────────────────────────────────────────

/** A figure and its label. `href` makes it a link; `tone` colours only the figure. */
export function StatTile({ value, label, hint, href, tone = "neutral" }: { value: ReactNode; label: string; hint?: string; href?: string; tone?: "neutral" | "accent" | "warn" | "bad" }) {
  const colour = tone === "accent" ? "text-gold-700" : tone === "warn" ? "text-amber-800" : tone === "bad" ? "text-red-700" : "text-forest-900";
  const body = (
    <>
      <span className="block text-[0.8125rem] font-medium text-ink-500">{label}</span>
      <span className={`portal-display mt-1 block text-[1.75rem] font-bold leading-[1.1] tracking-[-0.02em] tabular-nums ${colour}`}>{value}</span>
      {hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </>
  );
  const cls = "block min-w-0 px-5 py-4";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:bg-[var(--portal-row-hover)]`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A row of StatTiles separated by hairlines, in one panel (not four cards). */
export function StatStrip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-2 overflow-hidden divide-[var(--portal-line-soft)] rounded-2xl border border-gold-light bg-white sm:grid-cols-4 sm:divide-x [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-[var(--portal-line-soft)] sm:[&>*:nth-child(n+3)]:border-t-0 ${className}`}>{children}</div>;
}

export type WorkflowStatus = "draft" | "submitted" | "in_review" | "changes_needed" | "approved" | "published";

export const WORKFLOW: Record<WorkflowStatus, { label: string; dot: string; text: string }> = {
  draft: { label: "Draft", dot: "bg-ink/35", text: "text-ink/75" },
  submitted: { label: "Submitted", dot: "bg-gold-500", text: "text-gold-900" },
  in_review: { label: "Under review", dot: "bg-amber-500", text: "text-amber-900" },
  changes_needed: { label: "Changes requested", dot: "bg-red-600", text: "text-red-800" },
  approved: { label: "Approved", dot: "bg-forest-500", text: "text-forest-800" },
  published: { label: "Published", dot: "bg-forest-700", text: "text-forest-900" },
};

/** A review status: a coloured dot and its name (quiet; never a big coloured badge). */
export function WorkflowBadge({ status, className = "" }: { status: WorkflowStatus | null | undefined; className?: string }) {
  const s = WORKFLOW[status || "draft"];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium ${s.text} ${className}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ── Workspace headers ─────────────────────────────────────────────────

/** "ART & DESIGN / YEAR 7": the context line above a workspace title. Parts with an href are links. */
export function Eyebrow({ parts }: { parts: { label: string; href?: string }[] }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-gold-700">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <span aria-hidden="true">/</span>}
          {p.href ? (
            <Link href={p.href} className="underline-offset-2 hover:text-forest-700 hover:underline">
              {p.label}
            </Link>
          ) : (
            p.label
          )}
        </span>
      ))}
    </p>
  );
}

/**
 * The compact header of a unit or lesson workspace: context line, title, a
 * line of description, a status, the figures, and at most one primary action
 * plus a menu. Information first, actions second.
 */
export function WorkspaceHeader({
  eyebrow,
  title,
  meta,
  description,
  status,
  stats,
  primary,
  menu,
}: {
  eyebrow?: { label: string; href?: string }[];
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  stats?: { value: ReactNode; label: string }[];
  primary?: ReactNode;
  menu?: MenuAction[];
}) {
  return (
    <header className="pb-6">
      {eyebrow && <Eyebrow parts={eyebrow} />}
      <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-[min(100%,18rem)] flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="t-title min-w-0 [overflow-wrap:anywhere]">{title}</h1>
            {status}
          </div>
          {meta && <div className="mt-1 text-[0.8125rem] text-ink-500">{meta}</div>}
          {description && <p className="mt-2 max-w-prose text-sm text-ink-700">{description}</p>}
        </div>
        {(primary || (menu && menu.length > 0)) && (
          <div className="flex shrink-0 items-center gap-1.5">
            {primary}
            {menu && menu.length > 0 && <ActionsMenu items={menu} />}
          </div>
        )}
      </div>
      {stats && stats.length > 0 && (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
          {stats.map((s) => (
            <div key={s.label} className="flex items-baseline gap-2">
              <dt className="order-2 text-sm text-ink-500">{s.label}</dt>
              <dd className="order-1 text-lg font-semibold tabular-nums text-ink">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
