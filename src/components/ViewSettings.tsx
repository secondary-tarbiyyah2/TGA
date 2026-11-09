"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

/*
 * Display options for the public site and the portal: text size, easy
 * reading, contrast, motion and (portal only) dark mode. Chosen by the
 * visitor, applied at once as attributes on <html> (styles in globals.css,
 * "View settings") and remembered on this device under "tga-view".
 */

const KEY = "tga-view";
type Size = 0 | 1 | 2;
type View = { size: Size; reading: boolean; contrast: boolean; motion: boolean; dark: boolean; links: boolean };
const OFF: View = { size: 0, reading: false, contrast: false, motion: false, dark: false, links: false };

/** Older saves had `text: boolean` for "Larger text"; that is size 1 now. */
function read(): View {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || "{}") as Partial<View> & { text?: boolean };
    const size = raw.size === 1 || raw.size === 2 ? raw.size : raw.text ? 1 : 0;
    return { size, reading: !!raw.reading, contrast: !!raw.contrast, motion: !!raw.motion, dark: !!raw.dark, links: !!raw.links };
  } catch {
    return OFF;
  }
}

function write(v: View) {
  try {
    // `text` kept so a page still running the old code reads the same choice.
    window.localStorage.setItem(KEY, JSON.stringify({ ...v, text: v.size > 0 }));
  } catch {
    /* private mode: applies for this visit only */
  }
}

function apply(v: View) {
  const r = document.documentElement;
  r.toggleAttribute("data-large-text", v.size > 0);
  if (v.size === 2) r.setAttribute("data-text-size", "larger");
  else r.removeAttribute("data-text-size");
  r.toggleAttribute("data-reading", v.reading);
  r.toggleAttribute("data-contrast", v.contrast);
  r.toggleAttribute("data-reduce-motion", v.motion);
  r.toggleAttribute("data-dark", v.dark);
  r.toggleAttribute("data-links", v.links);
}

const isDefault = (v: View, portal: boolean) => v.size === 0 && !v.reading && !v.contrast && !v.motion && !v.links && (!portal || !v.dark);

const CHANGE_EVENT = "tga:view-change";

/** The saved choice, kept in step across every control on the page (the header button and the account menu). */
function useView(): [View, (next: View) => void] {
  const [view, setView] = useState<View>(OFF);
  useEffect(() => {
    const v = read();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the saved choice once after mount
    setView(v);
    apply(v);
    const sync = () => setView(read());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const update = useCallback((next: View) => {
    setView(next);
    apply(next);
    write(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [view, update];
}

/** Restores the saved view settings as soon as any page with a header opens. */
export function useRestoreView() {
  useEffect(() => {
    apply(read());
  }, []);
}

// ── Pieces ───────────────────────────────────────────────────────────

/** "A large, a small": the display icon (Lucide a-large-small). */
export function DisplayIcon({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 14h-5" />
      <path d="M16 16v-3.5a2.5 2.5 0 0 1 5 0V16" />
      <path d="M4.5 13h6" />
      <path d="m3 16 4.5-9 4.5 9" />
    </svg>
  );
}

type Choice<T> = { value: T; label: string; preview: ReactNode };

/**
 * One setting as a small card: a title and hint, then the choices side by
 * side, each with a live mini-preview. A radio group: arrow keys move and
 * choose, and only the chosen option is in the Tab order.
 */
function OptionCard<T extends string | number>({ title, hint, choices, value, onChange }: { title: string; hint: string; choices: Choice<T>[]; value: T; onChange: (v: T) => void }) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, choices.findIndex((c) => c.value === value));
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    let next = step ? (index + step + choices.length) % choices.length : e.key === "Home" ? 0 : e.key === "End" ? choices.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    next = Math.min(next, choices.length - 1);
    onChange(choices[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className="rounded-2xl border border-gold-light/80 bg-white p-3.5">
      <div className="mb-2.5 flex items-baseline justify-between gap-3 px-0.5">
        <p id={`${id}-t`} className="text-sm font-semibold text-ink">
          {title}
        </p>
        <p id={`${id}-h`} className="text-right text-xs text-ink/65">
          {hint}
        </p>
      </div>
      <div role="radiogroup" aria-labelledby={`${id}-t`} aria-describedby={`${id}-h`} onKeyDown={onKey} className={`grid gap-2 ${choices.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {choices.map((c, i) => {
          const on = c.value === value;
          return (
            <button
              key={String(c.value)}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(c.value)}
              className={`view-choice group relative flex flex-col items-stretch gap-1.5 rounded-xl border p-1.5 text-left transition-colors ${
                on ? "border-teal-700 bg-teal-50 ring-1 ring-inset ring-teal-700" : "border-gold-light/80 bg-white hover:border-ink/30 hover:bg-cream/60"
              }`}
            >
              <span aria-hidden="true" className="flex h-12 items-center justify-center overflow-hidden rounded-lg">
                {c.preview}
              </span>
              <span className="flex items-center justify-between gap-1 px-1 pb-0.5 text-[13px] font-medium text-ink">
                {c.label}
                <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? "border-teal-700 bg-teal-700 text-white" : "border-ink/25"}`}>
                  {on && (
                    <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Mini-previews: fixed colours so each shows what it will look like, whatever is on now.
const Sample = ({ size }: { size: number }) => (
  <span className="flex h-full w-full items-center justify-center bg-[#f7f4ec] font-serif font-semibold leading-none text-[#1b1e21]" style={{ fontSize: size }}>
    Aa
  </span>
);
const Lines = ({ easy }: { easy?: boolean }) => (
  <span className={`flex h-full w-full flex-col justify-center px-2.5 ${easy ? "gap-[7px] bg-[#fbf6e9]" : "gap-[4px] bg-white"}`}>
    {[100, 86, 64].map((w, i) => (
      <span key={i} className="block h-[3px] rounded-full bg-[#1b1e21]/45" style={{ width: `${easy ? w * 0.82 : w}%` }} />
    ))}
  </span>
);
const Contrast = ({ high }: { high?: boolean }) => (
  <span className={`flex h-full w-full items-center justify-center gap-2 ${high ? "bg-white" : "bg-[#f7f4ec]"}`}>
    <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${high ? "border-black text-black" : "border-[#d9cfb4] text-[#1b1e21]/60"}`}>Aa</span>
    <span className={`h-[3px] w-7 rounded-full ${high ? "bg-black" : "bg-[#1b1e21]/30"}`} />
  </span>
);
const Motion = ({ still }: { still?: boolean }) => (
  <span className="flex h-full w-full items-center justify-center bg-[#f7f4ec]">
    <span className="relative h-2 w-14 rounded-full bg-[#1b1e21]/10">
      <span className={`absolute top-0 h-2 w-2 rounded-full bg-[#0f6b66] ${still ? "left-0" : "view-preview-move"}`} />
    </span>
  </span>
);
const Theme = ({ dark }: { dark?: boolean }) => (
  <span className={`flex h-full w-full items-center gap-1.5 px-2 ${dark ? "bg-[#16181a]" : "bg-[#f7f4ec]"}`}>
    <span className={`h-8 w-3 rounded ${dark ? "bg-[#1f2225]" : "bg-white"}`} />
    <span className={`flex h-8 flex-1 flex-col justify-center gap-1 rounded px-1.5 ${dark ? "bg-[#1f2225]" : "bg-white"}`}>
      <span className={`block h-[3px] w-4/5 rounded-full ${dark ? "bg-[#e9e7e2]/60" : "bg-[#1b1e21]/45"}`} />
      <span className={`block h-[3px] w-1/2 rounded-full ${dark ? "bg-[#c8a858]" : "bg-[#8a6f2e]"}`} />
    </span>
  </span>
);

const SIZE_LABEL = ["Default", "Large", "Larger"] as const;

function LinkSample({ highlight = false }: { highlight?: boolean }) {
  return (
    <span aria-hidden="true" className={`inline-block rounded px-1.5 text-sm font-semibold text-gold-900 ${highlight ? "underline decoration-2 underline-offset-2 ring-2 ring-gold-900" : ""}`}>
      Fees
    </span>
  );
}

/** The display options as cards. Remembered on this device; dark mode only shows (and applies) in the portal. */
export function ViewSettingsPanel({ className = "", portal = false, showReset = true }: { className?: string; portal?: boolean; showReset?: boolean }) {
  const [view, setView] = useView();
  const [said, setSaid] = useState("");
  const set = (patch: Partial<View>, message: string) => {
    setView({ ...view, ...patch });
    setSaid(message);
  };
  return (
    <div className={`space-y-2.5 ${className}`}>
      <OptionCard<Size>
        title="Text size"
        hint="Everything gets bigger"
        value={view.size}
        onChange={(size) => set({ size }, `Text size: ${SIZE_LABEL[size]}.`)}
        choices={[
          { value: 0, label: "Default", preview: <Sample size={15} /> },
          { value: 1, label: "Large", preview: <Sample size={20} /> },
          { value: 2, label: "Larger", preview: <Sample size={26} /> },
        ]}
      />
      <OptionCard<"standard" | "easy">
        title="Reading"
        hint="Softer page, wider spacing"
        value={view.reading ? "easy" : "standard"}
        onChange={(v) => set({ reading: v === "easy" }, v === "easy" ? "Easy reading on." : "Easy reading off.")}
        choices={[
          { value: "standard", label: "Standard", preview: <Lines /> },
          { value: "easy", label: "Easy reading", preview: <Lines easy /> },
        ]}
      />
      <OptionCard<"standard" | "high">
        title="Contrast"
        hint="Darker text, stronger lines"
        value={view.contrast ? "high" : "standard"}
        onChange={(v) => set({ contrast: v === "high" }, v === "high" ? "High contrast on." : "High contrast off.")}
        choices={[
          { value: "standard", label: "Standard", preview: <Contrast /> },
          { value: "high", label: "High", preview: <Contrast high /> },
        ]}
      />
      <OptionCard<"standard" | "reduce">
        title="Motion"
        hint="Fewer animations"
        value={view.motion ? "reduce" : "standard"}
        onChange={(v) => set({ motion: v === "reduce" }, v === "reduce" ? "Reduced motion on." : "Reduced motion off.")}
        choices={[
          { value: "standard", label: "Standard", preview: <Motion /> },
          { value: "reduce", label: "Reduce", preview: <Motion still /> },
        ]}
      />
      <OptionCard<"standard" | "highlight">
        title="Links and focus"
        hint="Underline every link and show a bold outline on the item you are on"
        value={view.links ? "highlight" : "standard"}
        onChange={(v) => set({ links: v === "highlight" }, v === "highlight" ? "Links highlighted." : "Link highlighting off.")}
        choices={[
          { value: "standard", label: "Standard", preview: <LinkSample /> },
          { value: "highlight", label: "Highlight", preview: <LinkSample highlight /> },
        ]}
      />
      {portal && (
        <OptionCard<"light" | "dark">
          title="Theme"
          hint="Dark is easier in the evening"
          value={view.dark ? "dark" : "light"}
          onChange={(v) => set({ dark: v === "dark" }, v === "dark" ? "Dark mode on." : "Dark mode off.")}
          choices={[
            { value: "light", label: "Light", preview: <Theme /> },
            { value: "dark", label: "Dark", preview: <Theme dark /> },
          ]}
        />
      )}
      {showReset && (
        <div className="flex justify-end px-1">
          <button
            type="button"
            disabled={isDefault(view, portal)}
            onClick={() => set({ ...OFF, dark: portal ? false : view.dark }, "Display reset to default.")}
            className="rounded-md px-1 text-sm font-medium text-teal-800 underline-offset-2 hover:underline disabled:cursor-default disabled:text-ink/40 disabled:no-underline"
          >
            Reset to default
          </button>
        </div>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {said}
      </p>
    </div>
  );
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The "Display" button (a quiet icon in the public header, a text link in
 * the public footer, and the portal top bar) and its dialog:
 * the option cards, Reset, and Done. Focus stays inside while it is open,
 * Esc or Done closes it, and focus goes back to the button.
 */
export function ViewSettingsMenu({ variant = "site" }: { variant?: "site" | "portal" | "footer" }) {
  const portal = variant === "portal";
  const footer = variant === "footer";
  const [open, setOpen] = useState(false);
  const [view] = useView();
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => trigger.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = dialog.current;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Start on the first choice that is selected, so arrow keys work at once.
    (el?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') || el)?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  const changed = !isDefault(view, portal);
  // The accessible name must contain the visible label (WCAG 2.5.3): "Display" in the portal, "Accessibility and display" elsewhere.
  const name = portal ? "Display and accessibility options" : "Accessibility and display options";
  const label = changed ? `${name} (some are on)` : name;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title="Accessibility: text size, easy reading, contrast, motion and link highlighting"
        onClick={() => setOpen(true)}
        className={
          portal
            ? "portal-topbar-btn relative px-2.5 text-sm font-medium text-ink/80"
            : footer
              ? "relative inline-flex items-center gap-1.5 rounded text-cream/75 transition-colors hover:text-cream focus-visible:outline-gold-light"
              : "relative inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-medium text-ink/70 transition-colors hover:bg-gold-100 hover:text-ink"
        }
      >
        <DisplayIcon className={footer ? "h-4 w-4" : "h-[18px] w-[18px]"} />
        {portal && (
          <span aria-hidden="true" className="hidden md:inline">
            Display
          </span>
        )}
        {footer && <span aria-hidden="true">Accessibility and display</span>}
        {!portal && !footer && (
          <span aria-hidden="true" className="hidden 2xl:inline">
            Accessibility
          </span>
        )}
        {changed && (
          <span
            aria-hidden="true"
            className={`absolute h-2 w-2 rounded-full bg-gold-500 ${footer ? "-right-2.5 top-0" : portal ? "-right-0.5 -top-0.5 h-2.5 w-2.5 border-2 border-white" : "right-1 top-1 ring-2 ring-cream"}`}
          />
        )}
      </button>
      {open &&
        createPortal(
          <div
            className={`${portal ? "portal " : ""}fixed inset-0 z-[110] flex items-end justify-center bg-ink/40 sm:items-center sm:p-4`}
            onMouseDown={(e) => e.target === e.currentTarget && close()}
          >
            <div
              ref={dialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              className="view-dialog flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-gold-light/70 bg-cream shadow-warm focus:outline-none sm:rounded-3xl"
            >
              <div className="flex items-start gap-3 border-b border-gold-light/70 bg-white px-5 pb-4 pt-5">
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800">
                  <DisplayIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className="text-lg font-semibold leading-tight text-ink">
                    Accessibility and display
                  </h2>
                  <p className="mt-0.5 text-sm text-ink/70">Changes apply straight away and are remembered on this device.</p>
                </div>
                <button type="button" onClick={close} aria-label="Close" className="-mr-1 rounded-full p-2 text-ink/70 hover:bg-cream hover:text-ink">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6l-12 12" />
                  </svg>
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                <ViewSettingsPanel portal={portal} />
              </div>
              <div className="border-t border-gold-light/70 bg-white px-5 py-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
                <button type="button" onClick={close} className="w-full rounded-full bg-gold-500 px-4 py-2.5 text-sm font-semibold text-ink-900 hover:brightness-95">
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
