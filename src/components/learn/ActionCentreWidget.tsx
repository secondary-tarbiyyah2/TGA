"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/learn/Icon";
import { ui } from "@/components/learn/ui";
import { CATEGORIES, categoryOf, type ActionArea, type ActionItem, type Role } from "@/lib/learn/actionCentre";
import { useActionItems } from "@/components/learn/actions/useActionItems";
import { MarkingPanel } from "@/components/learn/classwork/MarkingPanel";

/** How many items each category shows on Today before "See all". */
const PER_CATEGORY = 2;

/** Work to mark opens the marking panel over the page; everything else goes to the page that does it. */
export const marksInPlace = (i: ActionItem) => i.area === "Marking" || /\/(teach|admin)\/(homework|review)$/.test(i.href);

/**
 * Today's "Waiting for you": what needs this person, sorted into tidy category boxes
 * (Attendance, Classwork, Pupils and SEND, Documents...) with a count each, the most urgent two
 * items in each with one clear button, and "See all" for the rest on the Waiting for you page
 * (owner, 11 Nov 2026: "things should be separated and compartmentalised"). Nothing at all when
 * all is clear. `extra` adds items only this page knows about (the head's lessons to approve);
 * `skipAreas` leaves out what Today already shows (a teacher's registers are in Your day);
 * `skipNow` leaves out the "do now" items when Needs you already lists them at the top.
 */
export function ActionCentreWidget({ role, extra = [], skipAreas = [], skipNow = false }: { role: Role; extra?: ActionItem[]; skipAreas?: ActionArea[]; skipNow?: boolean }) {
  const { items } = useActionItems(role);
  const [marking, setMarking] = useState(false);
  const staff = role === "teach" || role === "admin";
  const urgent = [...extra, ...(items || [])].filter((i) => i.urgency !== "info" && !(skipNow && i.urgency === "now") && !skipAreas.includes(i.area));
  if (items === null || !urgent.length) return null;
  const base = role === "teach" ? "/teach" : role === "admin" ? "/admin" : role === "family" ? "/family" : "/student";
  const rank = { now: 0, soon: 1, info: 2 } as const;
  const groups = CATEGORIES.map((c) => {
    const list = urgent.filter((i) => categoryOf(i.area) === c.key).sort((a, b) => rank[a.urgency] - rank[b.urgency]);
    return { ...c, list, now: list.filter((i) => i.urgency === "now").length };
  }).filter((c) => c.list.length > 0);

  return (
    <section data-guide="waiting-widget" aria-labelledby="ac-widget">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ac-widget" className="t-section">
          Waiting for you <span className="font-normal text-ink/60">· {urgent.length}</span>
        </h2>
        <Link href={`${base}/actions`} className="text-sm font-medium text-forest-700 hover:underline">
          Open Waiting for you
        </Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {groups.map((g) => {
          const headingId = `ac-w-${g.key}`;
          return (
            <li key={g.key} className={`flex flex-col rounded-[10px] border bg-white ${g.now ? "border-red-200" : "border-gold-light"}`}>
              <section aria-labelledby={headingId} className="flex flex-1 flex-col">
                <div className="flex items-center gap-2 border-b border-gold-light/70 px-4 py-2.5">
                  <Icon name={g.icon} size="sm" className="h-4 w-4 text-ink/65" />
                  <h3 id={headingId} className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                    {g.label}
                  </h3>
                  <span className={`rounded-full px-2 text-xs font-semibold leading-5 tabular-nums ${g.now ? "bg-red-100 text-red-800" : "bg-cream text-ink/70"}`}>
                    {g.list.length}
                    {g.now > 0 && <span className="sr-only">, {g.now} to do now</span>}
                  </span>
                </div>
                <ul className="flex-1 divide-y divide-gold-light/60">
                  {g.list.slice(0, PER_CATEGORY).map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
                      <div className="min-w-[11rem] flex-1">
                        <p className="line-clamp-2 text-sm font-medium text-ink">
                          {i.urgency === "now" && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-red-600 align-middle" aria-hidden="true" />}
                          {i.urgency === "now" && <span className="sr-only">Do now: </span>}
                          {i.title}
                        </p>
                      </div>
                      {staff && marksInPlace(i) ? (
                        <button type="button" onClick={() => setMarking(true)} aria-haspopup="dialog" className={`${ui.btnSecondary} ${ui.sm} shrink-0`}>
                          {i.cta}
                        </button>
                      ) : (
                        <Link href={i.href} className={`${ui.btnSecondary} ${ui.sm} shrink-0`}>
                          {i.cta}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
                {g.list.length > PER_CATEGORY && (
                  <Link href={`${base}/actions?cat=${g.key}`} className="flex min-h-11 items-center gap-1 border-t border-gold-light/70 px-4 text-sm font-medium text-forest-700 hover:bg-[var(--portal-hover)]">
                    See all {g.list.length} in {g.label}
                    <Icon name="chevronRight" size="sm" />
                  </Link>
                )}
              </section>
            </li>
          );
        })}
      </ul>
      {marking && <MarkingPanel onClose={() => setMarking(false)} />}
    </section>
  );
}
