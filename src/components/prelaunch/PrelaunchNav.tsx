"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- plain links on purpose, see below */

import { useEffect, useState, useSyncExternalStore } from "react";

// Plain <a> links on purpose: the holding pages are served at public addresses
// by .htaccess rewrites, so full page loads are the reliable way to move
// between them (see src/lib/prelaunch.ts).
export const PRELAUNCH_LINKS = [
  { href: "/", label: "Home" },
  { href: "/term-dates/", label: "Term dates" },
  { href: "/fees/", label: "Fees" },
  { href: "/curriculum/", label: "Subjects" },
  { href: "/careers/", label: "Careers" },
];

const noSubscribe = () => () => {};

function isCurrent(href: string, path: string | null) {
  if (path === null) return false;
  const p = path.endsWith("/") ? path : path + "/";
  return href === "/" ? p === "/" || p.startsWith("/coming-soon/index") : p === href;
}

export function PrelaunchNav() {
  const [open, setOpen] = useState(false);
  // null while rendering on the server, so no link is marked current until the browser knows the address.
  const path = useSyncExternalStore(noSubscribe, () => window.location.pathname, () => null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
        {PRELAUNCH_LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            aria-current={isCurrent(l.href, path) ? "page" : undefined}
            className="rounded-full px-3.5 py-2 text-sm font-medium text-ink/75 transition-colors hover:bg-gold-100 hover:text-ink aria-[current=page]:text-ink aria-[current=page]:underline aria-[current=page]:decoration-gold-500 aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8"
          >
            {l.label}
          </a>
        ))}
        <a href="/#register" className="ml-2 rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-900 hover:brightness-95">
          Register interest
        </a>
      </nav>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="prelaunch-menu"
        className="flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-gold-100 md:hidden"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu" id="prelaunch-menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 flex h-full w-[82%] max-w-xs flex-col bg-cream shadow-xl">
            <div className="flex h-20 items-center justify-end px-4">
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-gold-100">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <ul className="flex-1 px-4">
              {PRELAUNCH_LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    aria-current={isCurrent(l.href, path) ? "page" : undefined}
                    className="block rounded-xl px-4 py-3.5 text-lg font-medium text-ink/80 hover:bg-gold-100 aria-[current=page]:bg-gold-100 aria-[current=page]:text-ink"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="p-6">
              <p className="mb-3 text-center text-xs text-ink/55">Full website coming soon</p>
              <a href="/#register" onClick={() => setOpen(false)} className="block rounded-full bg-gold-500 px-5 py-3 text-center font-semibold text-ink-900">
                Register interest
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
