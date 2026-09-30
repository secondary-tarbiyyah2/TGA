"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { visiblePortalNav, isActivePath, type PortalArea, type PortalNavGroup } from "@/lib/learn/nav";

/** Closes on outside click and Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

const TAB_BASE =
  "relative flex h-11 items-center gap-1 px-3 text-sm font-medium transition-colors after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full";
const TAB_ACTIVE = "text-ink after:bg-teal-700";
const TAB_IDLE = "text-ink/60 hover:text-ink after:bg-transparent";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}>
      <path d="M5.5 7.5l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DropdownTab({ group, pathname }: { group: PortalNavGroup; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const active = group.items.some((i) => isActivePath(pathname, i.href));

  // Close after navigating to one of the items.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- closing a menu on route change
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${TAB_BASE} ${active ? TAB_ACTIVE : TAB_IDLE}`}
      >
        {group.label}
        <Chevron open={open} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-gold-light bg-white p-1.5 shadow-warm">
          {group.items.map((item) => {
            const itemActive = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                aria-current={itemActive ? "page" : undefined}
                className={`block rounded-lg px-3 py-2 transition-colors ${itemActive ? "bg-teal-100" : "hover:bg-cream"}`}
              >
                <span className={`block text-sm font-medium ${itemActive ? "text-teal-900" : "text-ink"}`}>{item.label}</span>
                {item.hint && <span className="block text-xs text-ink/55">{item.hint}</span>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Desktop: a row of tabs under the header, Moodle-style, with the active
 * tab underlined. */
export function PortalNav({ area, roles }: { area: PortalArea; roles: string[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Portal" className="-mx-3 flex items-center">
      {visiblePortalNav(area, roles).map((group) => {
        if (group.items.length > 1) return <DropdownTab key={group.label} group={group} pathname={pathname} />;
        const item = group.items[0];
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`${TAB_BASE} ${active ? TAB_ACTIVE : TAB_IDLE}`}
          >
            {group.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile: a menu button in the header that opens the same destinations as
 * a full-width panel. */
export function PortalMobileMenu({ area, roles }: { area: PortalArea; roles: string[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- closing a menu on route change
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={ref} className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-ink/70 hover:bg-cream"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5">
          {open ? (
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          ) : (
            <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          )}
        </svg>
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-50 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-b border-gold-light bg-white px-4 pb-4 pt-2 shadow-warm">
          {visiblePortalNav(area, roles).map((group) => (
            <div key={group.label} className="py-2">
              {group.items.length > 1 && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink/45">{group.label}</p>
              )}
              {group.items.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-lg px-3 py-2.5 text-sm font-medium ${active ? "bg-teal-100 text-teal-900" : "text-ink/80 hover:bg-cream"}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
