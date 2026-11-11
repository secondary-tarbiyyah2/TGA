"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Select } from "@/components/learn/Select";

export type SectionItem<K extends string> = { key: K; label: string; count?: number; countAlert?: boolean };

/**
 * A record's sections as a list down the left on wide screens and a dropdown on
 * phones (owner, 11 Nov 2026: no strip of tabs across the top; the same pattern
 * as a class's sections). Each section is a link (`hrefFor`) so the address
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
    <nav data-guide={guide} aria-label={label} className="mb-5 lg:mb-0 print:hidden">
      <div className="lg:hidden">
        <label className="t-eyebrow mb-1 block" htmlFor={id}>
          Section
        </label>
        <Select id={id} value={value} onChange={(e) => go(e.target.value as K)} className="w-full">
          {items.map((t) => (
            <option key={t.key} value={t.key}>
              {t.count ? `${t.label} (${t.count})` : t.label}
            </option>
          ))}
        </Select>
      </div>
      <ul className="portal-section-nav hidden lg:sticky lg:top-[calc(var(--portal-topbar-h)+1.5rem)] lg:block">
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
    <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10">
      {nav}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
