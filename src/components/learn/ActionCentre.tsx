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
        <span className="min-w-0 flex-1 truncate">{label}</span>
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
          <nav ref={navRef} aria-label="Categories" className="min-w-0 print:hidden lg:sticky lg:top-[76px] lg:self-start">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
              {navButton("all", "Everything", open.length, urgentAll, "layoutGrid")}
              {cats.map((c) => navButton(c.key, c.label, c.count, c.urgent, c.icon))}
            </div>
          </nav>

          <div ref={listRef} className="min-w-0 space-y-5">
            <OwnPrintHeader title={`Action centre: ${catLabel}`} />
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
              sections.map((s) => <CategorySection key={s.key} title={s.label} icon={s.icon} list={s.list} role={role} isDone={isDone} onDone={markDone} showTitle={cat === "all"} />)
            )}
          </div>
        </div>
      )}

      {staff && (
        <details className={`${ui.card} print:hidden`}>
          <summary className="cursor-pointer text-sm font-semibold text-ink">How missing homework is followed up</summary>
          <ol className="mt-2 space-y-1.5 text-sm text-ink/80">
            <li><b>Due date:</b> anything not handed in is marked missing by itself. No one has to mark it.</li>
            <li><b>1 day:</b> the pupil and parent see it in their own Action centre, and the pupil can hand it in late.</li>
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

function CategorySection({ title, icon, list, role, isDone, onDone, showTitle }: { title: string; icon: IconName; list: ActionItem[]; role: Role; isDone: (i: ActionItem) => boolean; onDone: (i: ActionItem, on: boolean) => void; showTitle: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const id = `ac-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section ref={ref} aria-labelledby={id} className="space-y-2">
      <OwnPrintHeader title={`Action centre: ${title}`} />
      <div className={`flex items-center gap-2 ${showTitle ? "" : "sr-only"}`}>
        <Icon name={icon} size="sm" className="h-4 w-4 text-ink/65" />
        <h2 id={id} className="mr-auto text-base font-semibold text-ink">
          {title} <span className="font-normal text-ink/65">· {list.length}</span>
        </h2>
        {showTitle && (
          <button type="button" onClick={() => printElement(ref.current)} className={`${ui.btnLink} !text-xs print:hidden`}>
            Save as PDF
          </button>
        )}
      </div>
      <ul className="space-y-2">
        {list.map((i) => (
          <ItemRow key={i.id} item={i} role={role} done={isDone(i)} onDone={(on) => onDone(i, on)} />
        ))}
      </ul>
    </section>
  );
}

function ItemRow({ item: i, role, done, onDone }: { item: ActionItem; role: Role; done: boolean; onDone: (on: boolean) => void }) {
  const ref = useRef<HTMLLIElement>(null);
  const u = URGENCY[i.urgency];
  return (
    <li ref={ref} className={`rounded-2xl border bg-white p-4 ${i.urgency === "now" && !done ? "border-red-200" : "border-gold-light"} ${done ? "opacity-70" : ""}`}>
      <OwnPrintHeader title={`Action centre: ${i.area}`} />
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-72">
          <p className="flex flex-wrap items-center gap-2 text-xs">
            <StatusChip tone={done ? "neutral" : u.tone}>{done ? "Marked done" : u.label}</StatusChip>
            <span className="font-medium text-ink/65">{i.area}</span>
          </p>
          <p className="mt-1.5 text-sm font-semibold text-ink">{i.title}</p>
          <p className="mt-0.5 text-sm text-ink/75">{i.detail}</p>
          {(i.people?.length || i.who) && (
            <p className="mt-1 text-xs text-ink/65">
              {role === "teach" && i.people
                ? i.people.map((p, n) => (
                    <span key={p.id}>
                      {n > 0 && ", "}
                      <Link href={`/teach/pupils?pupil=${p.id}`} className="font-medium text-teal-700 hover:underline">
                        {p.name}
                      </Link>
                    </span>
                  ))
                : i.people?.map((p) => p.name).join(", ")}
              {i.who ? ` ${i.who}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 print:hidden">
          <Link href={i.href} className={`${i.urgency === "now" && !done ? ui.btnPrimary : ui.btnSecondary} ${ui.sm}`}>
            {i.cta}
          </Link>
          <Button size="sm" variant="ghost" icon={done ? "refresh" : "check"} onClick={() => onDone(!done)} title={done ? "Put it back in the list" : "Hide it on this device until something about it changes"}>
            {done ? "Undo" : "Mark done"}
          </Button>
          <button type="button" onClick={() => printElement(ref.current)} aria-label={`Print or save as PDF: ${i.title}`} title="Print or save as PDF" className={ui.btnIcon}>
            <Icon name="printer" size="sm" />
          </button>
        </div>
      </div>
    </li>
  );
}
