"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/learn/Icon";

/**
 * A focused, full-screen view for a big task (a quiz builder, a set of assessment results,
 * a pupil sitting a quiz): one clear Back button, the task's title and its main actions in a
 * bar across the top, and the task itself filling the screen below. The page underneath stays
 * exactly where it was and is shown again on Back (owner, 11 Nov 2026: "big tasks get their own
 * focused page or full-screen view with a clear back button"; docs/owner-briefs/2026-11-11-feedback-2.md).
 *
 * Escape goes back too, unless something inside used it first (an open dropdown). Pass
 * `beforeClose` to ask before leaving unsaved work: return false to stay.
 */
export function FocusView({
  title,
  eyebrow,
  backLabel = "Back",
  onClose,
  beforeClose,
  actions,
  footer,
  children,
  width = "wide",
  label,
  dataGuide,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  backLabel?: string;
  onClose: () => void;
  beforeClose?: () => boolean | Promise<boolean>;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** "wide" for builders with a side column; "reading" for forms and one question at a time. */
  width?: "wide" | "reading";
  label?: string;
  dataGuide?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  const guardRef = useRef(beforeClose);
  useEffect(() => {
    closeRef.current = onClose;
    guardRef.current = beforeClose;
  }, [onClose, beforeClose]);

  const leave = async () => {
    if (guardRef.current && !(await guardRef.current())) return;
    closeRef.current();
  };
  const leaveRef = useRef(leave);
  useEffect(() => {
    leaveRef.current = leave;
  });

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) leaveRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      back?.focus?.();
    };
  }, []);

  // Rendered at the end of <body>, so nothing on the page (the phone tab bar, a sticky header in
  // its own stacking context) can show through. Dialogs and panels opened from inside stack above.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the portal target exists only in the browser
    setHost(document.body);
  }, []);

  const inner = width === "reading" ? "max-w-3xl" : "max-w-6xl";
  const view = (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-label={label}
      data-guide={dataGuide}
      className="portal portal-focus fixed inset-0 z-[85] flex flex-col bg-[var(--portal-canvas)] outline-none"
    >
      <header className="shrink-0 border-b border-gold-light bg-[var(--portal-surface)]">
        <div className={`mx-auto flex w-full ${inner} flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6`}>
          <button type="button" onClick={leave} className="portal-btn -ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-ink-700 hover:bg-[var(--portal-hover)] hover:text-ink sm:min-h-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest-700">
            <Icon name="arrowLeft" className="h-4 w-4" />
            {backLabel}
          </button>
          <span aria-hidden="true" className="hidden h-5 w-px bg-gold-light sm:block" />
          <div className="min-w-0 flex-1">
            {eyebrow && <div className="t-eyebrow truncate">{eyebrow}</div>}
            <h2 id={titleId} className="t-section truncate text-base">
              {title}
            </h2>
          </div>
          {actions && <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">{actions}</div>}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={`mx-auto w-full ${inner} px-4 py-5 sm:px-6 sm:py-6`}>{children}</div>
      </div>
      {footer && (
        <footer className="shrink-0 border-t border-gold-light bg-[var(--portal-surface)]">
          <div className={`mx-auto flex w-full ${inner} flex-wrap items-center gap-2 px-4 py-3 sm:px-6`}>{footer}</div>
        </footer>
      )}
    </div>
  );
  return host ? createPortal(view, host) : null;
}
