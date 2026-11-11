"use client";

/**
 * Standard page pieces for the page design system (docs/portal-redesign.md, "Page design system").
 * Each one is small, uses only the portal tokens and works on its own, so a page that is
 * not yet on a template can still use them:
 *
 *   Panel          a titled block on hairlines (lighter than a card; never a card in a card)
 *   SettingsGroup  a group of settings: label and description on the left, controls on the right
 *   SettingRow     one setting inside a group, in the same two columns
 *   SaveBar        Save and Cancel for a form, with its state (unsaved, saving, saved, error)
 *   Pagination     "Showing 1 to 25 of 214", per page, Previous and Next
 *   BulkActionBar  "3 selected" and what you can do to them, above a list
 *   Stepper        a workflow's stages: done, current, to come, or a problem
 *   toast          a short message in the corner that goes by itself ("Saved")
 */
import { useId, type ReactNode } from "react";
import { Icon } from "@/components/learn/Icon";
import { Select } from "@/components/learn/Select";
import { btn, ui } from "@/components/learn/ui";

// ── Panel ─────────────────────────────────────────────────────────────

/**
 * A titled block on a page: a heading row (title, one line of help, actions on the right)
 * over its content, framed by one hairline. `flush` drops the inner padding for a table or
 * a list that brings its own rows.
 */
export function Panel({
  title,
  description,
  actions,
  children,
  flush = false,
  className = "",
  guide,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
  guide?: string;
  id?: string;
}) {
  const headingId = useId();
  return (
    <section id={id} data-guide={guide} aria-labelledby={title ? headingId : undefined} className={`min-w-0 rounded-[10px] border border-gold-light bg-[var(--portal-surface)] ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-gold-light/70 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && (
              <h2 id={headingId} className="t-section">
                {title}
              </h2>
            )}
            {description && <p className="t-meta mt-0.5 max-w-prose">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? "" : "px-4 py-4 sm:px-5"}>{children}</div>
    </section>
  );
}

// ── Settings ──────────────────────────────────────────────────────────

/**
 * A group of related settings: its name and a line saying what it changes on the left, the
 * controls on the right (one column on phones). Groups sit one under another, divided by a
 * hairline, inside a SettingsPage section.
 */
export function SettingsGroup({ title, description, children, aside, guide, id }: { title: ReactNode; description?: ReactNode; children: ReactNode; /** Extra help under the description (a link, a note). */ aside?: ReactNode; guide?: string; id?: string }) {
  return (
    <section id={id} data-guide={guide} className="grid gap-x-8 gap-y-3 border-t border-gold-light/70 py-5 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <div className="min-w-0">
        <h3 className="t-section">{title}</h3>
        {description && <p className="t-meta mt-1 leading-relaxed">{description}</p>}
        {aside && <div className="mt-2 text-sm">{aside}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** One setting: a label and its description beside the control, or above it on phones. */
export function SettingRow({ label, description, htmlFor, children, error }: { label: ReactNode; description?: ReactNode; htmlFor?: string; children: ReactNode; error?: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-1.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-start">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className={ui.label}>
          {label}
        </label>
        {description && <p className={`${ui.hint} mt-0.5`}>{description}</p>}
      </div>
      <div className="min-w-0">
        {children}
        {error && (
          <p role="alert" className={`${ui.error} mt-1`}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/**
 * Save and Cancel for a settings form or an editor, and what is happening: "Unsaved changes",
 * "Saving", "Saved", or the error. It sticks to the foot of the screen while there is
 * something to save, so you never scroll to find the button. Hidden when there is nothing to
 * say (idle).
 */
export function SaveBar({ state, onSave, onCancel, error, saveLabel = "Save changes", cancelLabel = "Cancel", disabled }: { state: SaveState; onSave: () => void; onCancel?: () => void; error?: ReactNode; saveLabel?: string; cancelLabel?: string; disabled?: boolean }) {
  if (state === "idle") return null;
  const busy = state === "saving";
  return (
    <div className="sticky bottom-0 z-[5] -mx-4 mt-4 border-t border-gold-light bg-[var(--portal-surface)]/95 px-4 py-2.5 backdrop-blur-sm sm:-mx-5 sm:px-5 print:hidden" data-save-bar>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p role="status" aria-live="polite" className={`mr-auto inline-flex items-center gap-1.5 text-sm ${state === "error" ? "font-medium text-red-700" : state === "saved" ? "text-forest-800" : "text-ink-500"}`}>
          {state === "dirty" && "Unsaved changes"}
          {state === "saving" && "Saving"}
          {state === "saved" && (
            <>
              <Icon name="check" size="sm" />
              Saved
            </>
          )}
          {state === "error" && (error || "That did not save. Try again.")}
        </p>
        {onCancel && state !== "saved" && (
          <button type="button" onClick={onCancel} disabled={busy} className={btn("ghost")}>
            {cancelLabel}
          </button>
        )}
        {state !== "saved" && (
          <button type="button" onClick={onSave} disabled={busy || disabled} className={btn("primary")}>
            {busy ? "Saving" : saveLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Lists ─────────────────────────────────────────────────────────────

export const PAGE_SIZES = [25, 50, 100, 0] as const; // 0 = all

/**
 * The foot of a list: how many are showing, how many per page, and Previous and Next. The
 * page number is zero-based. `size` 0 means all on one page.
 */
export function Pagination({ page, size, total, filteredFrom, onPage, onSize, sizes = PAGE_SIZES }: { page: number; size: number; total: number; /** The list's full length when filters have shrunk it. */ filteredFrom?: number; onPage: (page: number) => void; onSize?: (size: number) => void; sizes?: readonly number[] }) {
  const pages = size ? Math.max(1, Math.ceil(total / size)) : 1;
  const current = Math.min(page, pages - 1);
  const from = total ? current * (size || total) + 1 : 0;
  const to = size ? Math.min(total, (current + 1) * size) : total;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink/75">
      <p aria-live="polite" className="tabular-nums">
        Showing {from}–{to} of {total}
        {filteredFrom !== undefined && filteredFrom !== total ? ` (filtered from ${filteredFrom})` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onSize && (
          <label className="flex items-center gap-1.5 whitespace-nowrap">
            Per page
            <Select value={size} onChange={(e) => onSize(Number(e.target.value))} className={`${ui.select} !w-auto !py-1 pl-2.5 sm:!min-h-8`}>
              {sizes.map((n) => (
                <option key={n} value={n}>
                  {n || "All"}
                </option>
              ))}
            </Select>
          </label>
        )}
        {pages > 1 && (
          <nav aria-label="Pages" className="flex items-center gap-1">
            <button type="button" onClick={() => onPage(current - 1)} disabled={current === 0} className={btn("secondary", "sm")}>
              <Icon name="chevronLeft" size="sm" />
              Previous
            </button>
            <span className="px-1 tabular-nums">
              {current + 1} / {pages}
            </span>
            <button type="button" onClick={() => onPage(current + 1)} disabled={current >= pages - 1} className={btn("secondary", "sm")}>
              Next
              <Icon name="chevronRight" size="sm" />
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}

/**
 * Shown above a list while rows are ticked: how many, what you can do to all of them, and
 * Clear. Nothing is shown when none are ticked, so the list does not move until you tick one.
 */
export function BulkActionBar({ count, onClear, children, noun = "selected" }: { count: number; onClear: () => void; children: ReactNode; noun?: string }) {
  if (!count) return null;
  return (
    <div role="region" aria-label="Actions for the ticked rows" className="flex flex-wrap items-center gap-2 rounded-[10px] border border-forest-700/30 bg-forest-50 px-3 py-2 text-sm" data-bulk-bar>
      <span className="font-semibold tabular-nums text-forest-900">
        {count} {noun}
      </span>
      <span aria-hidden="true" className="h-4 w-px bg-forest-700/25" />
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <button type="button" onClick={onClear} className={`${btn("ghost", "sm")} ml-auto`}>
        Clear
      </button>
    </div>
  );
}

// ── Workflows ─────────────────────────────────────────────────────────

export type StepState = "done" | "current" | "todo" | "error";
export type Step = { key: string; label: string; state: StepState; /** A count or a short status under the label. */ meta?: ReactNode; href?: string; onClick?: () => void };

/**
 * A workflow's stages in order, each done, current, still to come, or with a problem. A step
 * with `href` or `onClick` can be opened. Wide screens show the stages in one row; phones show
 * them as a short list, so nothing scrolls sideways.
 */
export function Stepper({ steps, label = "Stages", guide }: { steps: Step[]; label?: string; guide?: string }) {
  return (
    <nav aria-label={label} data-guide={guide} className="print:hidden">
      <ol className="grid gap-1 sm:flex sm:gap-0">
        {steps.map((s, i) => {
          const dot =
            s.state === "done" ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest-700 text-white">
                <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            ) : s.state === "error" ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-red-600 bg-red-50 text-red-700">
                <Icon name="circleAlert" className="h-3.5 w-3.5" />
              </span>
            ) : (
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums ${s.state === "current" ? "border-forest-700 bg-[var(--portal-surface)] text-forest-800 ring-2 ring-forest-700/20" : "border-gold-light bg-[var(--portal-surface)] text-ink-500"}`}>{i + 1}</span>
            );
          const body = (
            <>
              {dot}
              <span className="min-w-0">
                <span className={`block text-sm leading-tight ${s.state === "current" ? "font-semibold text-ink" : s.state === "error" ? "font-medium text-red-800" : "font-medium text-ink-700"}`}>{s.label}</span>
                {s.meta && <span className="t-meta block leading-tight">{s.meta}</span>}
              </span>
            </>
          );
          const cls = "flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left sm:min-h-0";
          return (
            <li key={s.key} aria-current={s.state === "current" ? "step" : undefined} className="flex min-w-0 items-center sm:flex-1">
              {s.href ? (
                <a href={s.href} className={`${cls} hover:bg-[var(--portal-hover)]`}>
                  {body}
                </a>
              ) : s.onClick ? (
                <button type="button" onClick={s.onClick} className={`${cls} hover:bg-[var(--portal-hover)]`}>
                  {body}
                </button>
              ) : (
                <div className={cls}>{body}</div>
              )}
              {i < steps.length - 1 && <span aria-hidden="true" className={`mx-2 hidden h-px min-w-4 flex-1 sm:block ${s.state === "done" ? "bg-forest-700/50" : "bg-gold-light"}`} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ── Toasts ────────────────────────────────────────────────────────────

/**
 * A short message in the bottom corner that goes by itself after a few seconds ("Saved",
 * "Removed"). Read out to screen readers. For errors that need reading, use a Notice instead.
 */
export function toast(message: string, tone: "good" | "bad" | "info" = "good") {
  if (typeof document === "undefined") return;
  let host = document.getElementById("portal-toasts");
  if (!host) {
    host = document.createElement("div");
    host.id = "portal-toasts";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    host.className = "portal pointer-events-none fixed inset-x-4 bottom-20 z-[95] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:items-end";
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = `pointer-events-auto rounded-lg border px-3.5 py-2 text-sm font-medium shadow-[var(--portal-shadow-pop)] ${tone === "bad" ? "border-red-200 bg-red-50 text-red-800" : tone === "info" ? "border-gold-light bg-[var(--portal-surface)] text-ink" : "border-forest-200 bg-forest-50 text-forest-900"}`;
  el.textContent = message;
  host.appendChild(el);
  window.setTimeout(() => el.remove(), 3500);
}
