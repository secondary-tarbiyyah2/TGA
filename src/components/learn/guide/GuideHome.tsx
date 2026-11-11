"use client";

// The Portal guide home: the role's A to Z laid out as a journey map. Each
// menu category is a chapter, each page a stop on the line, ticked once you
// have read its guide (Guide me) or finished its Show me. Progress, a
// "carry on where you left off" button, and a searchable A to Z index of every
// page and common job. Opening a stop goes to the page with its guide open.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/learn/Icon";
import { PageHeader } from "@/components/learn/PageHeader";
import { Tabs } from "@/components/learn/Tabs";
import type { GuideEntry, GuideRole } from "@/content/portal-guide";
import { guideFilterFor, portalAreaFor, type PortalArea } from "@/lib/learn/nav";
import { useFeatures } from "@/lib/learn/features";
import { dashboardPathForRole, useLearnSession, type LearnRole } from "@/lib/learn/session";
import { resetGuideProgress, usePortalPrefs } from "@/lib/learn/portalPrefs";
import { askConfirm } from "@/components/learn/kit";
import { ui } from "@/components/learn/ui";
import { startTour, tourFor } from "@/lib/learn/tours";
import { GuideJourneys } from "./GuideJourneys";
import { useGuideContent } from "./useGuideContent";

/** Link to a page that opens its guide panel on arrival. */
export const guideHref = (href: string) => `${href}${href.includes("?") ? "&" : "?"}guide=1`;

const AREAS: PortalArea[] = ["admin", "teach", "family", "student"];

function useArea(): PortalArea | null {
  const pathname = usePathname() || "";
  const { roles } = useLearnSession();
  const [asked, setAsked] = useState<PortalArea | null>(null);
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("area") as PortalArea | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only readable after mount
    if (a && AREAS.includes(a)) setAsked(a);
  }, []);
  if (asked) return asked;
  const here = portalAreaFor(pathname);
  if (here) return here;
  return roles[0] ? portalAreaFor(dashboardPathForRole(roles[0].role as LearnRole)) : null;
}

type Item = { key: string; label: string; entry: GuideEntry; task: boolean };

export function GuideHome({ userId, journeys }: { userId: string; journeys?: ReactNode }) {
  const area = useArea();
  const { roles } = useLearnSession();
  const roleNames = useMemo(() => roles.map((r) => r.role), [roles]);
  const content = useGuideContent();
  const prefs = usePortalPrefs(userId);
  const [view, setView] = useState<"map" | "az">("map");
  const [q, setQ] = useState("");

  // School features the Headteacher has switched off are left out of the guide (Settings, School features).
  const features = useFeatures();
  const filter = useMemo(() => guideFilterFor(features), [features]);
  const role: GuideRole | null = content && area ? content.guideRoleFor(area, roleNames) : null;
  const entries = useMemo(() => (role && content ? content.filterGuide(content.GUIDE[role], filter) : []), [role, content, filter]);
  const chapters = role && content ? content.guideChapters(role, filter) : [];
  const learned = new Set(prefs.guide.learned);
  const shown = new Set(prefs.guide.shown);
  const done = entries.filter((e) => learned.has(e.href)).length;
  const pct = entries.length ? Math.round((done / entries.length) * 100) : 0;
  const lastEntry = prefs.guide.last ? entries.find((e) => e.href === prefs.guide.last) : null;
  const nextEntry = entries.find((e) => !learned.has(e.href) && !e.detail) || null;

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const e of entries) {
      out.push({ key: e.href, label: e.name, entry: e, task: false });
      for (const t of e.tasks || []) out.push({ key: `${e.href}#${t}`, label: t.charAt(0).toUpperCase() + t.slice(1), entry: e, task: true });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label, "en-GB"));
  }, [entries]);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = items.filter((i) => {
    const hay = `${i.label} ${i.entry.name} ${i.entry.purpose} ${i.entry.category}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const letters = [...new Set(matches.map((i) => i.label[0].toUpperCase()))];

  if (!content || !role) return <p className="py-10 text-sm text-ink/70">Loading the guide…</p>;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        crumbs={[{ label: "Today", href: area ? `/${area}/dashboard` : "/" }, { label: "Portal guide" }]}
        title="Portal guide"
        subtitle={`Everything about using the portal in one place: a quick tour to start, a day in the life, then every page you can open, A to Z. Written for ${content.GUIDE_ROLE_LABEL[role].toLowerCase()}.`}
      />

      {/* One guide in three parts (owner, 11 Nov 2026: "portal guide and tour together and structured"). */}
      <nav aria-label="Parts of the Portal guide">
        <ol className="grid gap-px overflow-hidden rounded-[10px] border border-gold-light bg-gold-light sm:grid-cols-3">
          {[
            {
              n: 1,
              title: "Quick tour",
              body: "About two minutes on the real menu: where things are and how to find them.",
              done: area ? prefs.tours.includes(tourFor(area, roleNames).key) : false,
              action: (
                <button type="button" onClick={() => startTour()} className={`${ui.btnPrimary} ${ui.sm}`}>
                  <Icon name="compass" size="sm" />
                  Take the tour
                </button>
              ),
            },
            {
              n: 2,
              title: "A day in the life",
              body: "Walk through the pages you use together, in the order you use them.",
              done: content.filterJourneys(content.JOURNEYS[role], filter).length > 0 && content.filterJourneys(content.JOURNEYS[role], filter).every((j) => prefs.guide.journeys[j.id] === -1),
              action: (
                <a href="#journeys-title" className={`${ui.btnSecondary} ${ui.sm}`}>
                  See the journeys
                </a>
              ),
            },
            {
              n: 3,
              title: "Every page, A to Z",
              body: "What each page is for and how to use it. Press Guide me (or ?) on any page for its part of the guide.",
              done: entries.length > 0 && done === entries.length,
              action: (
                <a href="#guide-progress" className={`${ui.btnSecondary} ${ui.sm}`}>
                  {done} of {entries.length} learned
                </a>
              ),
            },
          ].map((p) => (
            <li key={p.n} className="flex flex-col gap-2 bg-[var(--portal-surface)] p-4">
              <p className="flex items-center gap-2">
                <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${p.done ? "bg-forest-700 text-white" : "border border-gold-light text-ink-700"}`}>
                  {p.done ? <Icon name="check" className="h-3.5 w-3.5" /> : p.n}
                </span>
                <span className="t-section">{p.title}</span>
                {p.done && <span className="sr-only">(done)</span>}
              </p>
              <p className="flex-1 text-sm text-ink-500">{p.body}</p>
              <div>{p.action}</div>
            </li>
          ))}
        </ol>
      </nav>

      {journeys ?? <GuideJourneys journeys={content.filterJourneys(content.JOURNEYS[role], filter)} progress={prefs.guide.journeys} />}

      <section aria-labelledby="guide-progress" className="guide-progress rounded-2xl border border-gold-light bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative h-20 w-20 shrink-0" aria-hidden="true">
            <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-gold-100)" strokeWidth="3.5" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-forest-700)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 97.4} 97.4`} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-ink">{pct}%</span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="guide-progress" className="text-lg font-semibold text-ink">
              {done} of {entries.length} pages learned
            </h2>
            <p className="mt-0.5 text-sm text-ink/70">A page is ticked when you open its guide with Guide me, or finish its Show me.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {lastEntry && (
                <Link href={guideHref(lastEntry.href)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">
                  <Icon name="play" className="h-4 w-4" />
                  Carry on: {lastEntry.name}
                </Link>
              )}
              {nextEntry && (
                <Link
                  href={guideHref(nextEntry.href)}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold ${lastEntry ? "border border-gold-light text-ink hover:bg-cream" : "bg-teal-700 text-white hover:bg-teal-800"}`}
                >
                  <Icon name="arrowRight" className="h-4 w-4" />
                  {lastEntry ? `Next: ${nextEntry.name}` : `Start with ${nextEntry.name}`}
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>


      <Tabs
        variant="switch"
        label="Portal guide views"
        guide="guide-views"
        items={[
          { key: "map", label: "Journey map" },
          { key: "az", label: "A to Z" },
        ]}
        value={view}
        onChange={setView}
      />

      {view === "map" ? (
        <ol className="guide-map relative space-y-4" aria-label="Chapters of the guide">
          {chapters.map((c, ci) => {
            const got = c.entries.filter((e) => learned.has(e.href)).length;
            const complete = got === c.entries.length;
            return (
              <li key={c.label} className="relative pl-12 sm:pl-14">
                {/* The line of the journey, and this chapter's station on it. */}
                {ci < chapters.length - 1 && <span aria-hidden="true" className="absolute bottom-[-1rem] left-[1.15rem] top-10 w-0.5 bg-gold-light sm:left-[1.4rem]" />}
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-1 flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold sm:h-11 sm:w-11 ${complete ? "border-forest-700 bg-forest-700 text-white" : got ? "border-forest-700 bg-white text-forest-900" : "border-gold-light bg-white text-ink/60"}`}
                >
                  {complete ? <Icon name="check" className="h-5 w-5" /> : ci + 1}
                </span>
                <section aria-labelledby={`ch-${ci}`} className="rounded-2xl border border-gold-light bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 id={`ch-${ci}`} className="text-[0.9375rem] font-semibold text-ink">
                      <span className="sr-only">Chapter {ci + 1}: </span>
                      {c.label}
                    </h2>
                    <span className="text-xs text-ink/65">
                      {got} of {c.entries.length} learned
                    </span>
                  </div>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {c.entries.map((e) => {
                      const ok = learned.has(e.href);
                      return (
                        <li key={e.href}>
                          <Stop entry={e} ok={ok} shown={shown.has(e.href)} />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </li>
            );
          })}
        </ol>
      ) : (
        <section aria-labelledby="az-title" className="rounded-2xl border border-gold-light bg-white p-4 sm:p-5">
          <h2 id="az-title" className="sr-only">
            A to Z of pages and jobs
          </h2>
          <label className="block">
            <span className="text-sm font-medium text-ink">Find a page or a job</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="For example: report an absence, take a register"
              className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2 text-sm"
              data-guide="guide-az-search"
            />
          </label>
          <p className="mt-2 text-xs text-ink/65" aria-live="polite">
            {matches.length} {matches.length === 1 ? "match" : "matches"}
          </p>
          {letters.length > 1 && (
            <nav aria-label="Jump to a letter" className="mt-3 flex flex-wrap gap-1">
              {letters.map((l) => (
                <a key={l} href={`#az-${l}`} className="flex h-9 min-w-9 items-center justify-center rounded-md border border-gold-light px-2 text-sm font-medium text-ink hover:bg-cream">
                  {l}
                </a>
              ))}
            </nav>
          )}
          <div className="mt-4 space-y-5">
            {letters.map((l) => (
              <section key={l} aria-labelledby={`az-${l}`}>
                <h3 id={`az-${l}`} className="scroll-mt-24 border-b border-gold-light pb-1 text-sm font-semibold text-gold-900">
                  {l}
                </h3>
                <ul className="mt-1 divide-y divide-gold-light/60">
                  {matches
                    .filter((i) => i.label[0].toUpperCase() === l)
                    .map((i) => (
                      <li key={i.key}>
                        <Link href={guideHref(i.entry.href)} className="flex min-h-11 items-center gap-3 py-2 hover:bg-cream/60">
                          <Icon name={i.task ? "arrowRight" : "fileText"} className="h-4 w-4 shrink-0 text-ink/55" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-ink">{i.label}</span>
                            <span className="block truncate text-xs text-ink/65">{i.task ? `${i.entry.name}, ${i.entry.category}` : i.entry.purpose}</span>
                          </span>
                          {learned.has(i.entry.href) && <Icon name="circleCheck" className="h-4 w-4 shrink-0 text-forest-700" />}
                        </Link>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
            {matches.length === 0 && <p className="py-6 text-center text-sm text-ink/70">Nothing matches. Try fewer or simpler words.</p>}
          </div>
        </section>
      )}

      {done > 0 && (
        <p className="text-center text-xs text-ink/65">
          <button
            type="button"
            className="underline hover:text-ink"
            onClick={async () => {
              if (await askConfirm("Clear your ticks and journeys and start the guide again?")) resetGuideProgress();
            }}
          >
            Start the guide again
          </button>
        </p>
      )}
    </div>
  );
}

function Stop({ entry, ok, shown }: { entry: GuideEntry; ok: boolean; shown: boolean }) {
  const inner = (
    <>
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${ok ? "border-forest-700 bg-forest-700 text-white" : "border-gold-light bg-white"}`}
      >
        {ok && <Icon name="check" className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{entry.name}</span>
        <span className="block text-xs leading-snug text-ink/65">{entry.purpose}</span>
        {shown && <span className="mt-0.5 block text-xs font-medium text-forest-900">Show me done</span>}
      </span>
      <span className="sr-only">{ok ? ", learned" : ", not learned yet"}</span>
    </>
  );
  const cls = "flex h-full gap-2.5 rounded-xl border border-transparent p-2 hover:border-gold-light hover:bg-cream/50";
  // A detail page (one class, one lesson) is opened from a list, so it has no link of its own.
  if (entry.detail) return <div className={cls}>{inner}<span className="sr-only">Opened from a list.</span></div>;
  return (
    <Link href={guideHref(entry.href)} className={cls}>
      {inner}
    </Link>
  );
}
