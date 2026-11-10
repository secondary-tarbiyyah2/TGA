"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/learn/Icon";
import { dashboardPathForArea, hubFor, navItemFor, normalisePortalPath, tileFor } from "@/lib/learn/nav";

export type Crumb = { label: string; href?: string };

/**
 * The page header every portal screen starts with: a breadcrumb trail (on
 * phones, a single "back" link to the parent section instead), a coloured
 * icon tile (the same tile the page has in the sidebar, so the two match),
 * the title and a one-line description, with the page's actions on the
 * right. Sits on the page background, not inside a card.
 *
 * Crumbs are worked out from the sidebar when none are given: Today › Hub ›
 * Page. Pass `crumbs` only for deeper pages (Today › Classes › 7A Maths).
 *
 * Actions: give the screen's one main action as `action` (it goes last, on
 * the right, where people look for it); anything else goes in `actions`.
 */
export function PageHeader({
  crumbs,
  title,
  subtitle,
  actions,
  action,
  back,
  icon,
}: {
  crumbs?: Crumb[];
  title: string;
  subtitle?: React.ReactNode;
  /** Secondary actions (Export, Filters, Print). */
  actions?: React.ReactNode;
  /** The page's one primary action (e.g. a ui.btnPrimary "New report"). */
  action?: React.ReactNode;
  /** Where the phone back link goes. Defaults to the parent crumb; false hides it. */
  back?: Crumb | false;
  /** Override the tile icon (defaults to the sidebar item's). */
  icon?: IconName;
}) {
  const pathname = usePathname();
  const nav = navItemFor(pathname || "");
  const home = nav ? dashboardPathForArea(nav.area) : null;
  const tileIcon = icon || nav?.tab?.icon || nav?.item.icon;
  const tile = tileFor(tileIcon || "house");

  let trail: Crumb[] = crumbs || [];
  if (!crumbs && nav) {
    trail = [{ label: "Today", href: home || undefined }];
    const t = title.toLowerCase();
    const same = (label: string) => {
      const l = label.toLowerCase();
      return l === t || t.includes(l) || l.includes(t);
    };
    // A hub's name, then the tab, unless the page title already says it.
    // A crumb that would link back to this very page (a hub's first tab, e.g.
    // Messages › Inbox on the Inbox page) is left out: it goes nowhere.
    const here = normalisePortalPath(pathname || "").replace(/\/$/, "");
    const isHere = (href: string) => normalisePortalPath(href).replace(/\/$/, "") === here;
    // Families and pupils: on one of a hub's own pages the hub link is only
    // its first tab (a sibling, already in the tab strip), so "back" goes Home.
    const siblingHub = !!nav.tab && (nav.area === "family" || nav.area === "student");
    if (nav.item.label !== "Today" && !same(nav.item.label) && !isHere(nav.item.href) && !siblingHub) trail.push({ label: nav.item.label, href: nav.item.href });
    if (nav.tab && !same(nav.tab.label) && nav.tab.label !== nav.item.label && !isHere(nav.tab.href)) trail.push({ label: nav.tab.label, href: nav.tab.href });
    trail.push({ label: title });
  } else if (crumbs && crumbs[0] && /^(home|admin|site administration|overview|dashboard)$/i.test(crumbs[0].label)) {
    // Older pages named the root differently; it is always "Today".
    trail = [{ label: "Today", href: home || crumbs[0].href }, ...crumbs.slice(1)];
  }

  // A crumb that links to the page you are already on (a hub whose first tab
  // is this page, e.g. Messages › Inbox) is dropped: on phones it made the
  // "back" link reload the same screen.
  const bare = (path: string) => normalisePortalPath(path.split(/[?#]/)[0]).replace(/(.)\/$/, "$1");
  const herePath = bare(pathname || "");
  trail = trail.filter((c, i) => i === trail.length - 1 || !c.href || bare(c.href) !== herePath);

  // Phones: one link back to the nearest section above this page.
  const parent = back === false ? null : back || [...trail.slice(0, -1)].reverse().find((c) => c.href) || null;
  const hasActions = !!(actions || action);

  return (
    <div className="mb-6 sm:mb-8">
      {parent?.href && (
        <Link href={parent.href} className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-sm font-medium text-ink/70 hover:text-teal-700 sm:hidden">
          <Icon name="chevronLeft" size="sm" />
          {parent.label}
        </Link>
      )}
      {trail.length > 1 && (
        <nav aria-label="Breadcrumb" className="mb-3 hidden sm:block">
          <ol className="flex flex-wrap items-center gap-1 text-[13px] text-ink/60">
            {trail.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1">
                {i > 0 && <Icon name="chevronRight" className="h-3.5 w-3.5 text-ink/30" />}
                {c.href && i < trail.length - 1 ? (
                  <Link href={c.href} className="truncate rounded px-0.5 hover:text-teal-700 hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current={i === trail.length - 1 ? "page" : undefined} className={`truncate ${i === trail.length - 1 ? "text-ink/80" : ""}`}>
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className={`flex flex-col gap-4 ${hasActions ? "sm:flex-row sm:items-center sm:justify-between sm:gap-6" : ""}`}>
        <div className="flex min-w-0 items-center gap-4">
          {tileIcon && (
            <span className="hidden sm:block" aria-hidden="true">
              <span className={`portal-tile portal-tile--lg ${tile}`}>
                <Icon name={tileIcon} />
              </span>
            </span>
          )}
          <div className="min-w-0">
            <h1 className="portal-display text-2xl font-semibold leading-tight text-forest-900 sm:text-[1.875rem]">{title}</h1>
            {subtitle && <p className="mt-1 max-w-prose text-sm text-ink/65">{subtitle}</p>}
          </div>
        </div>
        {hasActions && (
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
            {actions}
            {action}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The tab strip of a hub (one sidebar entry, several pages: see HUBS in
 * nav.ts), drawn by the shell at the top of each of the hub's pages so the
 * pages themselves don't need to know. Nothing renders outside a hub.
 */
export function HubTabs({ roles }: { roles: string[] }) {
  const pathname = usePathname();
  const hub = hubFor(pathname || "", roles);
  if (!hub) return null;
  return (
    <nav aria-label={`${hub.item.label} pages`} className="hub-tabs portal-tabs -mx-4 mb-6 mt-4 overflow-x-auto px-4 sm:mx-0 sm:mt-6 sm:px-0 print:hidden">
      <ul className="hub-seg">
        {hub.tabs.map((t) => {
          const active = hub.active?.href === t.href;
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? "page" : undefined} title={t.hint}>
                <Icon name={t.icon || hub.item.icon} size="sm" className={`h-4 w-4 ${active ? "text-forest-700" : "text-ink/45"}`} />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
