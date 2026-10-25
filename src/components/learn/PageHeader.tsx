"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/learn/Icon";
import { dashboardPathForArea, hubFor, navItemFor, tileFor } from "@/lib/learn/nav";

export type Crumb = { label: string; href?: string };

/**
 * The page header every portal screen starts with: a breadcrumb trail, a
 * coloured icon tile (the same tile the page has in the sidebar, so the two
 * match), the title and a one-line description, with the page's actions on
 * the right. Sits on the page background, not inside a card.
 *
 * Crumbs are worked out from the sidebar when none are given: Home › Section
 * › Hub › Page. Pass `crumbs` only for deeper pages (Home › Classes › 7A Maths).
 */
export function PageHeader({
  crumbs,
  title,
  subtitle,
  actions,
  icon,
}: {
  crumbs?: Crumb[];
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
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
    trail = [{ label: "Home", href: home || undefined }];
    if (nav.item.group) trail.push({ label: nav.item.group });
    const t = title.toLowerCase();
    const same = (label: string) => {
      const l = label.toLowerCase();
      return l === t || t.includes(l) || l.includes(t);
    };
    // A hub's name, then the tab, unless the page title already says it.
    if (nav.item.label !== "Home" && !same(nav.item.label) && !(nav.item.group && same(nav.item.group))) trail.push({ label: nav.item.label, href: nav.item.href });
    if (nav.tab && !same(nav.tab.label) && nav.tab.label !== nav.item.label) trail.push({ label: nav.tab.label, href: nav.tab.href });
    trail.push({ label: title });
  } else if (crumbs && crumbs[0] && /^(admin|site administration|overview|dashboard)$/i.test(crumbs[0].label)) {
    // Older pages named the root differently; it is always "Home".
    trail = [{ label: "Home", href: home || crumbs[0].href }, ...crumbs.slice(1)];
  }

  return (
    <div className="mb-6">
      {trail.length > 1 && (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1 text-[13px] text-ink/60">
            {trail.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && (
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 text-ink/30">
                    <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {c.href && i < trail.length - 1 ? (
                  <Link href={c.href} className="rounded px-0.5 hover:text-teal-700 hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current={i === trail.length - 1 ? "page" : undefined} className={i === trail.length - 1 ? "text-ink/80" : ""}>
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-4">
          {tileIcon && (
            <span className={`portal-tile portal-tile--lg ${tile}`} aria-hidden="true">
              <Icon name={tileIcon} />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-[1.65rem] font-semibold leading-tight tracking-tight text-ink sm:text-[1.85rem]">{title}</h1>
            {subtitle && <p className="mt-1 max-w-3xl text-sm text-ink/65">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
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
    <nav aria-label={`${hub.item.label} pages`} className="hub-tabs -mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 print:hidden">
      <ul className="flex min-w-max gap-1 border-b border-gold-light">
        {hub.tabs.map((t) => {
          const active = hub.active?.href === t.href;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                title={t.hint}
                className={`-mb-px flex items-center gap-2 border-b-[3px] px-3 py-2.5 text-sm font-medium transition-colors ${active ? "border-teal-700 text-ink" : "border-transparent text-ink/65 hover:border-gold-light hover:text-ink"}`}
              >
                <span className={`portal-tile !h-6 !w-6 !rounded-md ${tileFor(t.icon || hub.item.icon)} ${active ? "" : "opacity-80"}`} aria-hidden="true">
                  <Icon name={t.icon || hub.item.icon} className="h-3.5 w-3.5" />
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
