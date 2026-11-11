"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export type SectionItem<K extends string> = { key: K; label: string; count?: number; countAlert?: boolean };

/**
 * A record's sections as a list down the left from tablet width, and on phones a
 * small board of section buttons, every section visible at once (owner, 11 Nov
 * 2026: no strip of tabs across the top; "section should in no way be dropdown"). Each section is a link (`hrefFor`) so the address
 * keeps the section, or a button when `onChange` is given instead.
 */
export function SectionNav<K extends string>({
  items,
  value,
  hrefFor,
  onChange,
  label,
  guide,
  id = "section-nav",
}: {
  items: SectionItem<K>[];
  value: K;
  hrefFor?: (key: K) => string;
  onChange?: (key: K) => void;
  label: string;
  guide?: string;
  id?: string;
}) {
  const router = useRouter();
  const go = (k: K) => {
    if (onChange) onChange(k);
    else if (hrefFor) router.replace(hrefFor(k), { scroll: false });
  };
  return (
    <nav data-guide={guide} aria-label={label} className="mb-5 md:mb-0 print:hidden">
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:hidden">
        {items.map((t) => {
          const active = t.key === value;
          const cls = `portal-section-tile ${active ? "portal-section-tile--active" : ""}`;
          const inner = (
            <>
              <span className="min-w-0">{t.label}</span>
              {t.count ? <span className={`tabular-nums ${t.countAlert ? "font-semibold text-amber-800" : "text-ink/60"}`}>{t.count}</span> : null}
            </>
          );
          return (
            <li key={t.key} className="min-w-0">
              {hrefFor && !onChange ? (
                <Link href={hrefFor(t.key)} scroll={false} aria-current={active ? "page" : undefined} className={cls}>
                  {inner}
                </Link>
              ) : (
                <button type="button" onClick={() => go(t.key)} aria-current={active ? "page" : undefined} className={cls}>
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <ul className="portal-section-nav hidden md:sticky md:top-[calc(var(--portal-topbar-h)+1.5rem)] md:block">
        {items.map((t) => {
          const active = t.key === value;
          const cls = `portal-section-link ${active ? "portal-section-link--active" : ""} flex w-full items-center justify-between gap-2 text-left`;
          const inner = (
            <>
              <span>{t.label}</span>
              {t.count ? <span className={`t-meta tabular-nums ${t.countAlert ? "font-semibold text-amber-800" : ""}`}>{t.count}</span> : null}
            </>
          );
          return (
            <li key={t.key}>
              {hrefFor && !onChange ? (
                <Link href={hrefFor(t.key)} scroll={false} aria-current={active ? "page" : undefined} className={cls}>
                  {inner}
                </Link>
              ) : (
                <button type="button" onClick={() => go(t.key)} aria-current={active ? "page" : undefined} className={cls}>
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The two-column frame a SectionNav sits in: the list on the left, the section on the right. */
export function SectionLayout({ nav, children }: { nav: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="md:grid md:grid-cols-[10.5rem_minmax(0,1fr)] md:gap-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10">
      {nav}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
