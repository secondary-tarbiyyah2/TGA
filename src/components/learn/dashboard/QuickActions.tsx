"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/learn/Icon";

export type QuickAction = {
  label: string;
  icon: IconName;
  /** A short note under the label: who it is for, or how many are waiting. */
  hint?: string;
  /** Opens a panel or dialog over Today. */
  onSelect?: () => void;
  /** Goes to the page that does it (only for jobs big enough to need a page). */
  href?: string;
  /** Draws the eye: something is waiting behind it. */
  alert?: boolean;
};

/**
 * The compact row of everyday jobs at the very top of Today (owner, 11 Nov 2026: "quick
 * action should be at the top"). Small jobs open a panel or dialog over Today; the rest go to
 * their page. One row of equal buttons that wraps on narrow screens, never a long list.
 */
export function QuickActions({ actions, guide }: { actions: QuickAction[]; guide: string }) {
  const cls =
    "flex min-h-12 w-full items-center gap-2.5 rounded-[10px] border border-gold-light bg-white px-3 py-2 text-left transition-colors hover:border-forest-700/40 hover:bg-[var(--portal-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";
  return (
    <nav data-guide={guide} aria-label="Quick actions">
      <h2 className="sr-only">Quick actions</h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8">
        {actions.map((a) => {
          const inner = (
            <>
              <span className="portal-nav-icon shrink-0" aria-hidden="true">
                <Icon name={a.icon} size="sm" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{a.label}</span>
                {a.hint && <span className={`block truncate text-xs ${a.alert ? "font-medium text-amber-900" : "text-ink-500"}`}>{a.hint}</span>}
              </span>
            </>
          );
          return (
            <li key={a.label}>
              {a.href ? (
                <Link href={a.href} className={cls}>
                  {inner}
                </Link>
              ) : (
                <button type="button" onClick={a.onSelect} aria-haspopup="dialog" className={cls}>
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
