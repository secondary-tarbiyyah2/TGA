"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Container } from "./Container";
import { ViewSettingsMenu, ViewSettingsPanel } from "./ViewSettings";
import { primaryNav, primaryCta, secondaryCta, portalCta, isNavGroup, type NavGroup } from "@/lib/nav";

function DesktopDropdown({ group, open, onToggle, onClose }: { group: NavGroup; open: boolean; onToggle: () => void; onClose: () => void }) {
  const pathname = usePathname();
  const active = group.items.some((i) => i.href === pathname);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex items-center gap-1 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
          active || open ? "text-gold-700" : "text-ink/80 hover:text-gold-700"
        }`}
      >
        {group.label}
        <svg viewBox="0 0 12 8" width="10" height="7" aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-10 mt-2 min-w-[220px] rounded-2xl border border-gold-light/50 bg-white p-2 shadow-warm">
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={onClose}
              className="block rounded-lg px-4 py-2.5 text-sm text-ink/80 hover:bg-cream hover:text-gold-700"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Rendered via a portal into document.body, NOT as a descendant of <header>.
// <header> has `backdrop-blur` (backdrop-filter), which per the CSS spec
// creates a new containing block for any `position: fixed` descendant, the
// same way `transform` or `filter` do. A `fixed inset-0` drawer nested
// inside that header was being positioned relative to the header's own
// 80px-tall box instead of the viewport, collapsing to zero height and
// staying invisible even though its open/close state was toggling
// correctly. Verified with Playwright device emulation (iPhone/Android/
// tablet viewports): the drawer's computed height was exactly 0px while
// nested inside the blurred header, and became correct (full viewport
// height below the header) the moment it was rendered outside it. A portal
// is the robust fix, the drawer's positioning no longer depends on
// whatever CSS an ancestor happens to have now or in the future.
function MobileDrawer({ open, onClose, triggerRef }: { open: boolean; onClose: () => void; triggerRef: React.RefObject<HTMLButtonElement | null> }) {
  const [mobileOpenGroups, setMobileOpenGroups] = useState<Set<string>>(new Set());
  const [a11yOpen, setA11yOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- portals must not render during SSR/the first client render (no `document` yet); this flips true only after mount, matching React's documented createPortal-in-effect pattern
  useEffect(() => setMounted(true), []);

  function toggleMobileGroup(label: string) {
    setMobileOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function close() {
    onClose();
    triggerRef.current?.focus();
  }

  // Body scroll lock + focus trap + Escape-to-close, all scoped to exactly
  // while the drawer is open.
  useEffect(() => {
    if (!open) return;

    // Lock the page behind the drawer. overflow:hidden alone is ignored by
    // touch scrolling on iOS and some Android browsers (the page kept
    // scrolling under the open menu), so the body is pinned in place and
    // its scroll position restored on close.
    const scrollY = window.scrollY;
    const previous = { overflow: document.body.style.overflow, position: document.body.style.position, top: document.body.style.top, width: document.body.style.width };
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
    focusable?.[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab" || !focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous.overflow;
      document.body.style.position = previous.position;
      document.body.style.top = previous.top;
      document.body.style.width = previous.width;
      window.scrollTo(0, scrollY);
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close()/triggerRef are stable for this component's lifetime; re-running per open-state change only
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={panelRef}
      id="mobile-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="Site menu"
      className="fixed inset-0 z-[60] flex flex-col overflow-y-auto overscroll-contain bg-cream lg:hidden"
      style={{ height: "100dvh" }}
    >
      {/* The drawer carries its own top bar, so it fills the whole screen whatever the page behind it is doing. */}
      <div className="sticky top-0 z-10 flex h-20 shrink-0 items-center justify-between border-b border-gold-light/40 bg-cream px-5">
        <Link href="/" onClick={close} className="flex items-center" aria-label="Tarbiyyah Global Academy, home">
          <Image src="/brand/ga-wordmark.png" alt="" width={180} height={55} />
        </Link>
        <button type="button" onClick={close} aria-label="Close menu" className="rounded-md p-2 text-gold-700" style={{ touchAction: "manipulation" }}>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6l-12 12" /></svg>
        </button>
      </div>
      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 p-5">
        {primaryNav.map((entry) =>
          isNavGroup(entry) ? (
            <div key={entry.label} className="border-b border-gold-light/40">
              <button
                type="button"
                onClick={() => toggleMobileGroup(entry.label)}
                aria-expanded={mobileOpenGroups.has(entry.label)}
                className="flex w-full items-center justify-between px-2 py-3 text-left"
                style={{ minHeight: 48, touchAction: "manipulation" }}
              >
                <span>
                  <span className="block text-base font-semibold text-ink">{entry.label}</span>
                  {entry.blurb && <span className="block text-xs text-ink/60">{entry.blurb}</span>}
                </span>
                <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true" className={`transition-transform ${mobileOpenGroups.has(entry.label) ? "rotate-180" : ""}`}>
                  <path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {mobileOpenGroups.has(entry.label) && (
                <div className="pb-2 pl-4">
                  {entry.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={close}
                      className="flex items-center px-2 text-ink/75"
                      style={{ minHeight: 48, touchAction: "manipulation" }}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Link
              key={entry.href}
              href={entry.href}
              onClick={close}
              className="flex items-center border-b border-gold-light/40 px-2 text-base font-semibold text-ink"
              style={{ minHeight: 48, touchAction: "manipulation" }}
            >
              {entry.label}
            </Link>
          )
        )}
        <Link
          href={portalCta.href}
          onClick={close}
          className="flex items-center border-b border-gold-light/40 px-2 text-base font-medium text-ink/75"
          style={{ minHeight: 48, touchAction: "manipulation" }}
        >
          {portalCta.label}
        </Link>
      </nav>
      <div className="border-t border-gold-light/40 px-3 py-2">
        <button
          type="button"
          onClick={() => setA11yOpen((v) => !v)}
          aria-expanded={a11yOpen}
          aria-controls="mobile-a11y-panel"
          className="flex w-full items-center justify-between px-2 text-left text-sm font-semibold text-ink"
          style={{ minHeight: 48, touchAction: "manipulation" }}
        >
          <span className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
            Accessibility settings
          </span>
          <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true" className={`transition-transform ${a11yOpen ? "rotate-180" : ""}`}>
            <path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {a11yOpen && (
          <div id="mobile-a11y-panel" className="pb-2">
            <ViewSettingsPanel />
          </div>
        )}
      </div>
      <div className="sticky bottom-0 flex gap-3 border-t border-gold-light/40 bg-cream p-5">
        <Link
          href={primaryCta.href}
          onClick={close}
          className="flex flex-1 items-center justify-center rounded-full bg-gold-500 px-5 py-3.5 text-base font-semibold text-ink-900"
          style={{ touchAction: "manipulation" }}
        >
          {primaryCta.label}
        </Link>
        <Link
          href={secondaryCta.href}
          onClick={close}
          className="flex flex-1 items-center justify-center rounded-full border-[1.5px] border-gold-500 px-5 py-3.5 text-base font-semibold text-ink-900"
          style={{ touchAction: "manipulation" }}
        >
          {secondaryCta.label}
        </Link>
      </div>
    </div>,
    document.body,
  );
}

export function Header() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openDesktopMenu, setOpenDesktopMenu] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenDesktopMenu(null);
    }
    function onClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenDesktopMenu(null);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, []);

  // Closing the drawer on route change (e.g. browser back/forward, or a
  // link handled outside this component) keeps it from ever being left
  // open over a different page than the one the user tapped through to.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing drawer visibility to an external change (the route), not a render-cycle self-sync
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <header
      className={`sticky top-0 z-50 border-b bg-cream/95 backdrop-blur transition-colors ${
        scrolled ? "border-gold-light/50" : "border-transparent"
      }`}
    >
      <Container className="flex h-20 items-center justify-between gap-4">
        <Link href="/" className="flex items-center" aria-label="Tarbiyyah Global Academy, home">
          <Image src="/brand/ga-wordmark.png" alt="Tarbiyyah Global Academy" width={220} height={67} priority />
        </Link>

        <button
          ref={drawerTriggerRef}
          type="button"
          className="rounded-md p-2 text-gold-700 lg:hidden"
          style={{ touchAction: "manipulation" }}
          aria-expanded={drawerOpen}
          aria-controls="mobile-drawer"
          aria-label={drawerOpen ? "Close menu" : "Open menu"}
          onClick={() => setDrawerOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {drawerOpen ? <path d="M6 6l12 12M18 6l-12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
          </svg>
        </button>

        {/* Desktop nav */}
        <nav ref={navRef} aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {primaryNav.map((entry) =>
            isNavGroup(entry) ? (
              <DesktopDropdown
                key={entry.label}
                group={entry}
                open={openDesktopMenu === entry.label}
                onToggle={() => setOpenDesktopMenu((cur) => (cur === entry.label ? null : entry.label))}
                onClose={() => setOpenDesktopMenu(null)}
              />
            ) : (
              <Link
                key={entry.href}
                href={entry.href}
                aria-current={pathname === entry.href ? "page" : undefined}
                className={`rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  pathname === entry.href ? "text-gold-700" : "text-ink/80 hover:text-gold-700"
                }`}
              >
                {entry.label}
              </Link>
            )
          )}
          <ViewSettingsMenu />
          <Link href={portalCta.href} aria-label={portalCta.label} title={portalCta.label} className="ml-1 flex items-center gap-1.5 rounded-full border border-teal-700/30 px-3 py-2 text-sm font-medium text-teal-700 hover:border-teal-700 hover:bg-teal-100">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="5" y="11" width="14" height="9" rx="1.5" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            {portalCta.shortLabel}
          </Link>
          <Link href={secondaryCta.href} className="ml-2 hidden items-center justify-center rounded-full border-[1.5px] border-gold-500 px-4 py-2 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-100 xl:inline-flex">
            {secondaryCta.label}
          </Link>
          <Link href={primaryCta.href} className="ml-2 inline-flex items-center justify-center rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95">
            {primaryCta.label}
          </Link>
        </nav>
      </Container>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} triggerRef={drawerTriggerRef} />
    </header>
  );
}
