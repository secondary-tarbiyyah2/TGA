"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/learn/Icon";
import { Status, ui } from "@/components/learn/ui";
import { CATEGORIES, categoryOf, type ActionArea, type ActionItem, type Role } from "@/lib/learn/actionCentre";
import { useActionItems } from "@/components/learn/actions/useActionItems";
import { marksInPlace } from "@/components/learn/ActionCentreWidget";
import { MarkingPanel } from "@/components/learn/classwork/MarkingPanel";

/**
 * The top of Today: the few things to do now, one row each (category icon, title, a "Do now"
 * status dot with one line of detail, and the one action on the right). The idea of a short
 * "do this now" list comes from feedback 3 (11 Nov 2026); the look is TGA's own: one hairline
 * panel with thin rules, no coloured borders or tags. The same items as Waiting for
 * you (which then lists only this week's jobs), so nothing is shown twice. Nothing when there is
 * nothing to do now.
 */
export function NeedsYou({ role, skipAreas = [] }: { role: Role; skipAreas?: ActionArea[] }) {
  const { items } = useActionItems(role);
  const [marking, setMarking] = useState(false);
  const now = (items || []).filter((i) => i.urgency === "now" && !skipAreas.includes(i.area));
  if (!now.length) return null;
  const staff = role === "teach" || role === "admin";
  const icon = (i: ActionItem) => CATEGORIES.find((c) => c.key === categoryOf(i.area))?.icon || "circleAlert";

  return (
    <section data-guide="needs-you" aria-labelledby="needs-you">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="needs-you" className="t-section">
          Needs you now
        </h2>
        <span className="t-meta">
          {now.length} {now.length === 1 ? "item" : "items"}
        </span>
      </div>
      <ul className="divide-y divide-gold-light overflow-hidden rounded-[10px] border border-gold-light bg-white">
        {now.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3">
            <Icon name={icon(i)} size="sm" className="h-4 w-4 shrink-0 self-start text-ink-500 sm:mt-0.5" />
            <div className="min-w-0 flex-1 basis-60">
              <p className="text-sm font-semibold text-ink">{i.title}</p>
              <p className="mt-0.5 flex min-w-0 items-center gap-2 text-sm text-ink-500">
                <Status kind="overdue">Do now</Status>
                <span className="truncate">{i.detail}</span>
              </p>
            </div>
            {staff && marksInPlace(i) ? (
              <button type="button" onClick={() => setMarking(true)} aria-haspopup="dialog" className={`${ui.btnSecondary} ${ui.sm}`}>
                {i.cta}
              </button>
            ) : (
              <Link href={i.href} className={`${ui.btnSecondary} ${ui.sm}`}>
                {i.cta}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {marking && <MarkingPanel onClose={() => setMarking(false)} />}
    </section>
  );
}
