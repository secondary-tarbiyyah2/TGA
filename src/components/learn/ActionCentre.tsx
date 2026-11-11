"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useFamilyChildren } from "@/lib/learn/classes";
import { Button, EmptyState, StatusChip, ui } from "@/components/learn/ui";
import { Icon, type IconName } from "@/components/learn/Icon";
import { ParentSetup } from "@/components/learn/ParentSetup";
import { PrintHeader } from "@/components/learn/print";
import { printElement } from "@/components/learn/printScope";
import { CATEGORIES, categoryOf, type ActionItem, type CategoryKey, type Role, type Urgency } from "@/lib/learn/actionCentre";
import { useActionItems } from "@/components/learn/actions/useActionItems";
import { SidePanel } from "@/components/learn/kit";
import { MarkingPanel } from "@/components/learn/classwork/MarkingPanel";

const URGENCY: Record<Urgency, { label: string; tone: "bad" | "warn" | "neutral" }> = {
  now: { label: "Do now", tone: "bad" },
  soon: { label: "This week", tone: "warn" },
  info: { label: "Good to know", tone: "neutral" },
};

/** Items marked done on this device: id -> the title it had. An item comes back by itself when its title changes (a new count, a new pupil). */
const doneKey = (role: Role) => `tga-ac-done:${role}`;
function readDone(role: Role): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(doneKey(role)) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function writeDone(role: Role, v: Record<string, string>) {
  try {
    window.localStorage.setItem(doneKey(role), JSON.stringify(v));
  } catch {
    /* fine: it just won't be remembered */
  }
}

/** The letterhead for whatever is being printed: shown only when its own parent is the thing printed, so a full list doesn't repeat it on every item. */
function OwnPrintHeader({ title }: { title: string }) {
  return (
    <div className="hidden print:[[data-print-active]>&]:block">
      <PrintHeader title={title} />
    </div>
  );
}

/** In Everything, each category shows this many items; "Show all" opens the category. */
const PER_SECTION = 4;

function readCat(): CategoryKey | "all" {
  if (typeof window === "undefined") return "all";
  const c = new URLSearchParams(window.location.search).get("cat");
  return CATEGORIES.some((k) => k.key === c) ? (c as CategoryKey) : "all";
}

/**
 * One page with everything that needs doing, for every role, in categories
 * (Safeguarding, Attendance, Classwork, Pupils and SEND, Qur'an, Admissions,
 * Recruitment, Documents) with counts. Items come from the data itself, so
 * they clear on their own once the thing is done. Each item can be opened,
 * marked done (hidden on this device until something about it changes) or
 * printed / saved as PDF on its own; a whole category or the full list can be
 * saved as PDF too. `?cat=attendance` opens a category directly.
 */
export function ActionCentre({ role }: { role: Role }) {
  const family = useFamilyChildren();
  const { items, failed } = useActionItems(role, { fresh: true });
  const [cat, setCat] = useState<CategoryKey | "all">("all");
  const [done, setDone] = useState<Record<string, string>>({});
  const [showDone, setShowDone] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const staff = role === "teach" || role === "admin";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL and browser storage are only readable after mount
    setCat(readCat());
    setDone(readDone(role));
  }, [role]);

  // On phones the categories are one scrolling row: keep the chosen one in view.
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [cat, items]);

  const choose = (c: CategoryKey | "all") => {
    setCat(c);
    try {
      const url = new URL(window.location.href);
      if (c === "all") url.searchParams.delete("cat");
      else url.searchParams.set("cat", c);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      /* the filter still works without the URL */
    }
  };

  const isDone = (i: ActionItem) => done[i.id] === i.title;
  const markDone = (i: ActionItem, on: boolean) => {
    const next = { ...done };
    if (on) next[i.id] = i.title;
    else delete next[i.id];
    // Forget entries for items that have gone, so the list doesn't grow forever.
    for (const id of Object.keys(next)) if (items && !items.some((x) => x.id === id)) delete next[id];
    setDone(next);
    writeDone(role, next);
  };

  const open = useMemo(() => (items || []).filter((i) => !isDone(i)), [items, done]); // eslint-disable-line react-hooks/exhaustive-deps -- isDone reads `done`
  const hiddenCount = (items || []).length - open.length;
  const visible = showDone ? items || [] : open;

  const cats = useMemo(
    () =>
      CATEGORIES.map((c) => {
        const list = open.filter((i) => categoryOf(i.area) === c.key);
        return { ...c, count: list.length, urgent: list.filter((i) => i.urgency === "now").length };
      }).filter((c) => c.count > 0 || (items || []).some((i) => categoryOf(i.area) === c.key)),
    [open, items],
  );
  const urgentAll = open.filter((i) => i.urgency === "now").length;
  const sections = CATEGORIES.filter((c) => cat === "all" || c.key === cat)
    .map((c) => ({ ...c, list: visible.filter((i) => categoryOf(i.area) === c.key) }))
    .filter((c) => c.list.length > 0);
  const catLabel = cat === "all" ? "Everything" : CATEGORIES.find((c) => c.key === cat)?.label || "";

  if (items === null) return <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" aria-label="Loading" />;

  const navButton = (key: CategoryKey | "all", label: string, count: number, urgent: number, icon: IconName | null) => {
    const on = cat === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => choose(key)}
        aria-pressed={on}
        className={`flex min-h-11 w-full shrink-0 items-center gap-2.5 rounded-xl px-3 text-left text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 max-lg:w-auto max-lg:border lg:min-h-10 ${
          on ? "bg-teal-700 text-white max-lg:border-teal-700" : "text-ink/80 hover:bg-white hover:text-ink max-lg:border-gold-light max-lg:bg-white"
        }`}
      >
        {icon && <Icon name={icon} size="sm" />}
        <span className="min-w-0 flex-1 break-words leading-snug">{label}</span>
        <span className={`rounded-full px-2 text-xs font-semibold leading-5 tabular-nums ${on ? "bg-white/20 text-white" : urgent ? "bg-red-100 text-red-800" : "bg-cream text-ink/70"}`}>
          {count}
          <span className="sr-only">{urgent ? `, ${urgent} to do now` : ""}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-5">
      {role === "family" && <ParentSetup hasChild={(family?.length || 0) > 0} />}
      {failed && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          Some items couldn&apos;t load. Refresh to try again.
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState title="All clear." icon="circleCheck" tile="tile-green">
          Nothing needs doing right now. New items appear here by themselves, and clear once the work is done.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav ref={navRef} data-guide="waiting-categories" aria-label="Categories" className="min-w-0 print:hidden lg:sticky lg:top-[76px] lg:self-start">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
              {navButton("all", "Everything", open.length, urgentAll, "layoutGrid")}
              {cats.map((c) => navButton(c.key, c.label, c.count, c.urgent, c.icon))}
            </div>
          </nav>

          <div ref={listRef} className="min-w-0 space-y-5">
            <OwnPrintHeader title={`Waiting for you: ${catLabel}`} />
            <div className={`${ui.toolbar} print:hidden`}>
              <p className="mr-auto text-sm text-ink/70">
                <span className="font-semibold text-ink">{catLabel}</span> · {sections.reduce((n, s) => n + s.list.length, 0)} {sections.reduce((n, s) => n + s.list.length, 0) === 1 ? "item" : "items"}
              </p>
              {hiddenCount > 0 && (
                <button type="button" onClick={() => setShowDone((v) => !v)} aria-pressed={showDone} className={ui.chip}>
                  {showDone ? "Hide" : "Show"} {hiddenCount} marked done
                </button>
              )}
              <Button size="sm" icon="printer" onClick={() => printElement(listRef.current)}>
                Save as PDF
              </Button>
            </div>

            {sections.length === 0 ? (
              <EmptyState title="Nothing here." icon="circleCheck" tile="tile-green">
                {hiddenCount ? "Everything left in this category is marked done." : "Nothing in this category needs doing right now."}
              </EmptyState>
            ) : (
              sections.map((s) => (
                <CategorySection
                  key={s.key}
                  title={s.label}
                  icon={s.icon}
                  list={s.list}
                  role={role}
                  isDone={isDone}
                  onDone={markDone}
                  showTitle={cat === "all"}
                  limit={cat === "all" ? PER_SECTION : undefined}
                  onShowAll={() => {
                    choose(s.key);
                    // Back to the top of the list, never further down the page.
                    listRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
                  }}
                />
              ))
            )}
          </div>
        </div>
      )}

      {staff && (
        <details className={`${ui.card} print:hidden`}>
          <summary className="cursor-pointer text-sm font-semibold text-ink">How missing homework is followed up</summary>
          <ol className="mt-2 space-y-1.5 text-sm text-ink/80">
            <li><b>Due date:</b> anything not handed in is marked missing by itself. No one has to mark it.</li>
            <li><b>1 day:</b> the pupil and parent see it under Waiting for you, and the pupil can hand it in late.</li>
            <li><b>2 days:</b> tell the parent.</li>
            <li><b>3 days:</b> chase the pupil and agree a day.</li>
            <li><b>5 days:</b> escalate to the head teacher.</li>
            <li><b>3 missed in 14 days:</b> a pattern. Speak to the parent and agree support.</li>
          </ol>
          <p className="mt-2 text-xs text-ink/65">The portal shows each stage and who is at it. It does not send emails or messages for you.</p>
        </details>
      )}
    </div>
  );
}

function CategorySection({
  title,
  icon,
  list,
  role,
  isDone,
  onDone,
  showTitle,
  limit,
  onShowAll,
}: {
  title: string;
  icon: IconName;
  list: ActionItem[];
  role: Role;
  isDone: (i: ActionItem) => boolean;
  onDone: (i: ActionItem, on: boolean) => void;
  showTitle: boolean;
  /** Show only this many, with "Show all" (the Everything view), so no category runs on and on. */
  limit?: number;
  onShowAll: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const id = `ac-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  const now = list.filter((i) => i.urgency === "now" && !isDone(i)).length;
  return (
    <section ref={ref} aria-labelledby={id} className={showTitle ? "overflow-hidden rounded-[10px] border border-gold-light bg-white" : "space-y-2"}>
      <OwnPrintHeader title={`Waiting for you: ${title}`} />
      <div className={`flex items-center gap-2 ${showTitle ? "border-b border-gold-light bg-cream/40 px-4 py-2.5" : "sr-only"}`}>
        <Icon name={icon} size="sm" className="h-4 w-4 text-ink/65" />
        <h2 id={id} className="mr-auto text-base font-semibold text-ink">
          {title} <span className="font-normal text-ink/65">· {list.length}</span>
          {now > 0 && <span className="ml-2 rounded-full bg-red-100 px-2 text-xs font-semibold leading-5 text-red-800">{now} to do now</span>}
        </h2>
        {showTitle && (
          <button type="button" onClick={() => printElement(ref.current)} className={`${ui.btnLink} !text-xs print:hidden`}>
            Save as PDF
          </button>
        )}
      </div>
      <ul data-guide="waiting-list" className={showTitle ? "divide-y divide-gold-light/70" : "space-y-2"}>
        {list.map((i, n) => (
          <ItemRow key={i.id} item={i} role={role} done={isDone(i)} onDone={(on) => onDone(i, on)} flat={showTitle} printOnly={!!limit && n >= limit} />
        ))}
      </ul>
      {limit && list.length > limit && (
        <button type="button" onClick={onShowAll} className="flex min-h-11 w-full items-center gap-1 border-t border-gold-light/70 px-4 text-left text-sm font-medium text-forest-700 hover:bg-[var(--portal-hover)] print:hidden">
          Show all {list.length} in {title}
          <Icon name="chevronRight" size="sm" />
        </button>
      )}
    </section>
  );
}

/** Work to mark is marked in a panel right here; everything else opens the page that does it. */
const marksInPlace = (i: ActionItem) => i.area === "Marking" || /\/(teach|admin)\/(homework|review)$/.test(i.href);

/**
 * One item in the list: what it is, how urgent, and its one action as a button on the row
 * (marking opens in place). "Details" opens everything about it beside the list (every pupil
 * named, Mark done, print or save as PDF; docs/portal-structure.md, pattern 4).
 */
function ItemRow({ item: i, role, done, onDone, flat = false, printOnly = false }: { item: ActionItem; role: Role; done: boolean; onDone: (on: boolean) => void; /** Inside a category box: no border of its own. */ flat?: boolean; /** Past the category's first few: kept for Save as PDF, hidden on screen. */ printOnly?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const u = URGENCY[i.urgency];
  const pupilHref = (id: string) => (role === "teach" ? `/teach/pupils?pupil=${id}` : role === "admin" ? `/admin/pupils?id=${id}` : null);
  const inPlace = marksInPlace(i) && (role === "teach" || role === "admin");
  const primary = i.urgency === "now" && !done;
  // The one clear action, on the row itself (owner, 11 Nov 2026); the detail (every pupil
  // named, Mark done, print) opens beside the list from "Details".
  const action = inPlace ? (
    <button type="button" onClick={() => setMarking(true)} aria-haspopup="dialog" className={`${primary ? ui.btnPrimary : ui.btnSecondary} ${ui.sm}`}>
      Mark work here
    </button>
  ) : (
    <Link href={i.href} className={`${primary ? ui.btnPrimary : ui.btnSecondary} ${ui.sm}`}>
      {i.cta}
    </Link>
  );
  return (
    <li className={`${flat ? "" : `rounded-[10px] border bg-white ${i.urgency === "now" && !done ? "border-red-200" : "border-gold-light"}`} ${done ? "opacity-70" : ""} ${printOnly ? "hidden print:block" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-0 flex-1 basis-72">
          <p className="text-sm font-semibold text-ink">{i.title}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-ink/70">{i.detail}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusChip tone={done ? "neutral" : u.tone}>{done ? "Marked done" : u.label}</StatusChip>
          {action}
          <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Details: ${i.title}`} title="Details, mark done or print" className={ui.btnIcon}>
            <Icon name="ellipsis" size="sm" />
          </button>
        </div>
      </div>
      {open && (
        <SidePanel
          title={i.title}
          eyebrow={`${i.area} · ${done ? "Marked done" : u.label}`}
          onClose={() => setOpen(false)}
          footer={
            <>
              {marksInPlace(i) && (role === "teach" || role === "admin") ? (
                <button type="button" onClick={() => { setOpen(false); setMarking(true); }} className={i.urgency === "now" && !done ? ui.btnPrimary : ui.btnSecondary}>
                  Mark work here
                </button>
              ) : (
                <Link href={i.href} className={i.urgency === "now" && !done ? ui.btnPrimary : ui.btnSecondary}>
                  {i.cta}
                </Link>
              )}
              <Button variant="ghost" icon={done ? "refresh" : "check"} onClick={() => onDone(!done)} title={done ? "Put it back in the list" : "Hide it on this device until something about it changes"}>
                {done ? "Undo" : "Mark done"}
              </Button>
              <button type="button" onClick={() => printElement(ref.current)} aria-label={`Print or save as PDF: ${i.title}`} title="Print or save as PDF" className={`${ui.btnIcon} ml-auto`}>
                <Icon name="printer" size="sm" />
              </button>
            </>
          }
        >
          <div ref={ref} data-guide="waiting-detail" className="space-y-4">
            <OwnPrintHeader title={`Waiting for you: ${i.area}`} />
            <p className="hidden text-base font-semibold text-ink print:block">{i.title}</p>
            <p className="text-sm text-ink-700">{i.detail}</p>
            {(i.people?.length || i.who) && (
              <section>
                <h3 className="t-eyebrow mb-1.5">Who</h3>
                <ul className="divide-y divide-gold-light text-sm">
                  {(i.people || []).map((p) => {
                    const href = pupilHref(p.id);
                    return (
                      <li key={p.id} className="py-2">
                        {href ? (
                          <Link href={href} className="font-medium text-forest-700 hover:underline">
                            {p.name}
                          </Link>
                        ) : (
                          p.name
                        )}
                      </li>
                    );
                  })}
                </ul>
                {i.who && <p className="mt-1 text-xs text-ink-500">{i.who}</p>}
              </section>
            )}
            <p className="t-meta">{done ? "You marked this done on this device. It comes back by itself if something about it changes." : "This clears by itself once the work is done."}</p>
          </div>
        </SidePanel>
      )}
      {marking && <MarkingPanel onClose={() => setMarking(false)} />}
    </li>
  );
}
