"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/learn/Icon";
import { StatusChip, ui } from "@/components/learn/ui";
import { CATEGORIES, categoryOf, type CategoryKey, type Role } from "@/lib/learn/actionCentre";
import { useActionItems } from "@/components/learn/actions/useActionItems";

const SHOW = 6;

/**
 * The dashboard's "Waiting for you" list: everything that needs this person,
 * filtered in place by category (Admissions, Attendance, ...), each row with
 * its own button. Nothing at all when all is clear (the pinned sidebar link
 * already carries the count). The full list, with Mark done and printing,
 * stays on the Action centre page.
 */
export function ActionCentreWidget({ role }: { role: Role }) {
  const { items } = useActionItems(role);
  const [cat, setCat] = useState<CategoryKey | "all">("all");
  const urgent = (items || []).filter((i) => i.urgency !== "info");
  if (!urgent.length) return null;
  const base = role === "teach" ? "/teach" : role === "admin" ? "/admin" : role === "family" ? "/family" : "/student";
  const cats = CATEGORIES.map((c) => {
    const list = urgent.filter((i) => categoryOf(i.area) === c.key);
    return { ...c, count: list.length, now: list.some((i) => i.urgency === "now") };
  }).filter((c) => c.count > 0);
  const active = cat !== "all" && cats.some((c) => c.key === cat) ? cat : "all";
  const shown = active === "all" ? urgent : urgent.filter((i) => categoryOf(i.area) === active);

  return (
    <section aria-labelledby="ac-widget" className="rounded-2xl border border-gold-light bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ac-widget" className="text-base font-semibold text-ink">
          Waiting for you <span className="font-normal text-ink/60">· {urgent.length}</span>
        </h2>
        <Link href={`${base}/actions${active === "all" ? "" : `?cat=${active}`}`} className={`${ui.btnSecondary} ${ui.sm}`}>
          See everything
        </Link>
      </div>
      {cats.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Show">
          <button type="button" aria-pressed={active === "all"} onClick={() => setCat("all")} className={active === "all" ? ui.chipOn : ui.chip}>
            All
          </button>
          {cats.map((c) => (
            <button key={c.key} type="button" aria-pressed={active === c.key} onClick={() => setCat(c.key)} className={`${active === c.key ? ui.chipOn : ui.chip} gap-1.5`}>
              <Icon name={c.icon} size="sm" />
              {c.label}
              <span className={`rounded-full px-1.5 text-xs font-semibold tabular-nums ${c.now ? "bg-red-100 text-red-800" : "bg-cream text-ink/70"}`}>{c.count}</span>
            </button>
          ))}
        </div>
      )}
      <ul className="mt-3 divide-y divide-gold-light/70">
        {shown.slice(0, SHOW).map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <StatusChip tone={i.urgency === "now" ? "bad" : "warn"}>{i.area}</StatusChip>
            <div className="min-w-0 flex-1 basis-56">
              <p className="truncate text-sm font-semibold text-ink">{i.title}</p>
              {i.detail && <p className="truncate text-xs text-ink/65">{i.detail}</p>}
            </div>
            <Link href={i.href} className={`${ui.btnSecondary} ${ui.sm}`}>
              {i.cta || "Open"}
            </Link>
          </li>
        ))}
      </ul>
      {shown.length > SHOW && (
        <p className="mt-2 text-xs text-ink/60">
          and {shown.length - SHOW} more under{" "}
          <Link href={`${base}/actions${active === "all" ? "" : `?cat=${active}`}`} className="font-medium text-teal-700 hover:underline">
            Waiting for you
          </Link>
          .
        </p>
      )}
    </section>
  );
}
