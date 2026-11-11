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
 * their page. Equal buttons that wrap onto another row rather than shrink: each is at least
 * wide enough for its whole label (owner, 11 Nov 2026: "those words shouldn't cut off midway"),
 * so a label or its note is never cut with "...", at any width.
 */
export function QuickActions({ actions, guide }: { actions: QuickAction[]; guide: string }) {
  const cls =
    "flex h-full min-h-12 w-full items-center gap-2.5 rounded-[10px] border border-gold-light bg-white px-3 py-2 text-left transition-colors hover:border-forest-700/40 hover:bg-[var(--portal-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";
  return (
    <nav data-guide={guide} aria-label="Quick actions">
      <h2 className="sr-only">Quick actions</h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
        {actions.map((a) => {
          const inner = (
            <>
              <span className="portal-nav-icon shrink-0" aria-hidden="true">
                <Icon name={a.icon} size="sm" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-snug text-ink">{a.label}</span>
                {a.hint && <span className={`mt-0.5 block text-xs leading-snug ${a.alert ? "font-medium text-amber-900" : "text-ink-500"}`}>{a.hint}</span>}
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
