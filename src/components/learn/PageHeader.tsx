"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/learn/Icon";
import { dashboardPathForArea, navItemFor, normalisePortalPath } from "@/lib/learn/nav";

export type Crumb = { label: string; href?: string };

/**
 * The page header every portal screen starts with (DESIGN.md, "Portal design system"): the
 * title, one line saying what the page is for, and the page's actions on the right. It sits
 * on the page, not inside a card, and takes as little height as it can.
 *
 * Where you are: on one of a category's own pages the sidebar lists the category's pages (no
 * strip of tabs across the top: owner, 11 Nov 2026), so the header shows only the category
 * name as a small eyebrow above the title, and no breadcrumb. Deeper
 * pages (a class, a pupil, a lesson) show a breadcrumb trail; on phones, one "back" link.
 * Crumbs are worked out from the sidebar when none are given: Today > Category > Page.
 *
 * Actions: give the screen's one main action as `action` (it goes last, on the right, where
 * people look for it); anything else goes in `actions`.
 */
export function PageHeader({
  crumbs,
  title,
  subtitle,
  actions,
  action,
  back,
  icon,
  figures,
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
  /** Kept for callers; page titles no longer carry an icon tile (owner brief, 10 Nov 2026). */
  icon?: IconName;
  /**
   * A compact line of figures under the title ("214 pupils  12 missing details"). A figure
   * with `href` or `onClick` opens the list behind it. Never a row of tiles.
   */
  figures?: Figure[];
}) {
  void icon;
  const pathname = usePathname();
  const nav = navItemFor(pathname || "");
  const home = nav ? dashboardPathForArea(nav.area) : null;

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
    // Messages > Inbox on the Inbox page) is left out: it goes nowhere.
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
  // is this page, e.g. Messages > Inbox) is dropped: on phones it made the
  // "back" link reload the same screen.
  const bare = (path: string) => normalisePortalPath(path.split(/[?#]/)[0]).replace(/(.)\/$/, "$1");
  const herePath = bare(pathname || "");
  trail = trail.filter((c, i) => i === trail.length - 1 || !c.href || bare(c.href) !== herePath);

  // Phones: one link back to the nearest section above this page.
  const parent = back === false ? null : back || [...trail.slice(0, -1)].reverse().find((c) => c.href) || null;
  const hasActions = !!(actions || action);
  // One of a category's own pages: the sidebar lists its sibling pages, so the header only
  // names the category in a small eyebrow above the title (no trail, no strip of tabs).
  const inSection = !!nav?.tab && trail.length <= 3 && !(crumbs && crumbs.length > 3);
  const category = inSection && nav ? nav.item.group || nav.item.label : null;

  return (
    <div className="mb-6 sm:mb-7">
      {category && category !== title && (
        <p className="t-eyebrow mb-1.5" data-page-category>
          {category}
        </p>
      )}
      {parent?.href && !inSection && (
        <Link href={parent.href} className="-ml-1 mb-1.5 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-sm font-medium text-ink-500 hover:text-forest-700 sm:hidden">
          <Icon name="chevronLeft" size="sm" />
          {parent.label}
        </Link>
      )}
      {trail.length > 1 && !inSection && <Breadcrumbs trail={trail} className="mb-2 hidden sm:block" />}
      <div className={`flex flex-col gap-3 ${hasActions ? "sm:flex-row sm:items-end sm:justify-between sm:gap-6" : ""}`}>
        <div className="min-w-0">
          <h1 className="t-title">{title}</h1>
          {subtitle && <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-ink-500">{subtitle}</p>}
          {figures && figures.length > 0 && <Figures figures={figures} />}
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

export type Figure = { value: React.ReactNode; label: string; href?: string; onClick?: () => void; tone?: "warn" };

/** The header's line of figures: the number, then its label; a link or button when it opens something. */
function Figures({ figures }: { figures: Figure[] }) {
  const cls = "flex items-baseline gap-1.5 rounded text-left text-sm";
  const hover = "hover:[&>.fig-label]:text-forest-700 hover:[&>.fig-label]:underline";
  return (
    <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5" data-page-figures>
      {figures.map((f) => {
        const inner = (
          <>
            <span className={`font-semibold tabular-nums ${f.tone === "warn" ? "text-amber-800" : "text-ink"}`}>{f.value}</span>
            <span className="fig-label text-ink-500">{f.label}</span>
          </>
        );
        return (
          <li key={f.label}>
            {f.href ? (
              <Link href={f.href} className={`${cls} ${hover}`}>
                {inner}
              </Link>
            ) : f.onClick ? (
              <button type="button" onClick={f.onClick} className={`${cls} ${hover}`}>
                {inner}
              </button>
            ) : (
              <span className={cls}>{inner}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The breadcrumb trail: quiet links, a chevron between, the page you are on last. */
export function Breadcrumbs({ trail, className = "" }: { trail: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-[0.8125rem] text-ink-500">
        {trail.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1">
            {i > 0 && <Icon name="chevronRight" className="h-3 w-3 text-ink/30" />}
            {c.href && i < trail.length - 1 ? (
              <Link href={c.href} className="truncate rounded px-0.5 transition-colors hover:text-forest-700">
                {c.label}
              </Link>
            ) : (
              <span aria-current={i === trail.length - 1 ? "page" : undefined} className={`truncate ${i === trail.length - 1 ? "font-medium text-ink-700" : ""}`}>
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

