"use client";

import Link from "next/link";
import { Icon } from "@/components/learn/Icon";
import { StatusChip, ui } from "@/components/learn/ui";
import { CATEGORIES, categoryOf, type Role } from "@/lib/learn/actionCentre";
import { useActionItems } from "@/components/learn/actions/useActionItems";

/**
 * The dashboard's window into the Action centre: one row of categories with
 * their counts (each opens that category in the Action centre) and the three
 * most urgent things. Nothing at all when all is clear (the pinned sidebar
 * link already carries the count). Everything is actioned on the one Action
 * centre page; this only points there.
 */
export function ActionCentreWidget({ role }: { role: Role }) {
  const { items } = useActionItems(role);
  const urgent = (items || []).filter((i) => i.urgency !== "info");
  if (!urgent.length) return null;
  const base = role === "teach" ? "/teach" : role === "admin" ? "/admin" : role === "family" ? "/family" : "/student";
  const cats = CATEGORIES.map((c) => {
    const list = urgent.filter((i) => categoryOf(i.area) === c.key);
    return { ...c, count: list.length, now: list.some((i) => i.urgency === "now") };
  }).filter((c) => c.count > 0);

  return (
    <section aria-labelledby="ac-widget" className="rounded-2xl border border-gold-light bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ac-widget" className="text-sm font-semibold text-ink">
          Needs you <span className="font-normal text-ink/60">· {urgent.length}</span>
        </h2>
        <Link href={`${base}/actions`} className={`${ui.btnSecondary} ${ui.sm}`}>
          Open Action centre
        </Link>
      </div>
      {cats.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="By category">
          {cats.map((c) => (
            <li key={c.key}>
              <Link href={`${base}/actions?cat=${c.key}`} className={`${ui.chip} gap-1.5`}>
                <Icon name={c.icon} size="sm" />
                {c.label}
                <span className={`rounded-full px-1.5 text-xs font-semibold tabular-nums ${c.now ? "bg-red-100 text-red-800" : "bg-cream text-ink/70"}`}>{c.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-3 space-y-2">
        {urgent.slice(0, 3).map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-2 text-sm text-ink">
            <StatusChip tone={i.urgency === "now" ? "bad" : "warn"}>{i.area}</StatusChip>
            <Link href={i.href} className="min-w-0 flex-1 truncate font-medium hover:underline">
              {i.title}
            </Link>
          </li>
        ))}
      </ul>
      {urgent.length > 3 && (
        <p className="mt-2 text-xs text-ink/60">
          and {urgent.length - 3} more in the{" "}
          <Link href={`${base}/actions`} className="font-medium text-teal-700 hover:underline">
            Action centre
          </Link>
          .
        </p>
      )}
    </section>
  );
}
