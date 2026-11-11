"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchAllClasses, fetchChildClasses, fetchTeacherClasses, readRecentPages, type ClassSummary } from "@/lib/learn/classes";
import { isGroupedArea, navPageFor, visiblePages, type PortalArea } from "@/lib/learn/nav";
import { togglePin, usePortalPrefs } from "@/lib/learn/portalPrefs";
import { startTour } from "@/lib/learn/tours";
import { openGuidePanel } from "@/components/learn/guide/guideStore";
import { Icon, type IconName } from "@/components/learn/Icon";

type Item = { id: string; group: "Pinned" | "Recent" | "Actions" | "Pages" | "Classes" | "Lessons" | "Pupils" | "People"; label: string; hint?: string; href?: string; run?: () => void; keywords?: string; icon: IconName };
type PersonHit = { id: string; full_name: string | null; email: string | null };

const GROUPS: Item["group"][] = ["Pinned", "Recent", "Actions", "Pages", "Classes", "Lessons", "Pupils", "People"];

/** Common jobs, in plain words, so search finds "take a register" or "pay fees"
 * as well as page names. Each goes to the page where the job is done; one the
 * person can't open is left out. */
type QuickAction = { label: string; href: string; icon: IconName; keywords: string };
const ACTIONS: Record<PortalArea, QuickAction[]> = {
  admin: [
    { label: "Add a pupil", href: "/admin/pupils", icon: "plus", keywords: "new student enrol child record" },
    { label: "Take or check a register", href: "/admin/attendance", icon: "userCheck", keywords: "attendance present absent late" },
    { label: "Arrange staff cover", href: "/admin/absences", icon: "calendarX", keywords: "teacher off sick absent cover lesson" },
    { label: "Send an announcement", href: "/admin/announcements", icon: "megaphone", keywords: "notice all parents news post" },
    { label: "Message a family", href: "/admin/messages", icon: "messageSquare", keywords: "send email parent contact" },
    { label: "Invite someone to the portal", href: "/admin/people", icon: "idCard", keywords: "account login sign in password reset add staff parent" },
    { label: "Review new applications", href: "/admin/admissions", icon: "userRoundPlus", keywords: "admissions apply enquiry" },
    { label: "Approve lessons", href: "/admin/curriculum/review", icon: "clipboardCheck", keywords: "sign off review curriculum" },
    { label: "Issue term reports", href: "/admin/reports", icon: "fileText", keywords: "approve publish reports" },
  ],
  teach: [
    { label: "Take a register", href: "/teach/today", icon: "userCheck", keywords: "attendance present absent late lesson today" },
    { label: "Set work for a class", href: "/teach/classes", icon: "notebookPen", keywords: "homework classwork assignment create" },
    { label: "Mark work", href: "/teach/review", icon: "clipboardCheck", keywords: "marking feedback handed in submissions" },
    { label: "Message a family", href: "/teach/messages", icon: "messageSquare", keywords: "send email parent contact" },
    { label: "Log behaviour or praise", href: "/teach/behaviour", icon: "heartHandshake", keywords: "incident conduct sanction" },
    { label: "Award house points", href: "/teach/stars", icon: "trophy", keywords: "merit reward star of the week" },
    { label: "Write report comments", href: "/teach/reports", icon: "fileText", keywords: "term report" },
    { label: "Edit a lesson", href: "/teach/curriculum", icon: "pencil", keywords: "slides lesson plan change" },
  ],
  family: [
    { label: "Report an absence", href: "/family/absences", icon: "calendarX", keywords: "sick ill off away holiday" },
    { label: "Pay fees", href: "/family/fees", icon: "wallet", keywords: "payment invoice bank money" },
    { label: "Message a teacher", href: "/family/messages", icon: "messageSquare", keywords: "contact email ask office" },
    { label: "Book a parent evening slot", href: "/family/parent-evenings", icon: "calendarClock", keywords: "appointment meeting" },
    { label: "Update medical or contact details", href: "/family/child-details", icon: "contact", keywords: "address phone allergies consent" },
    { label: "See homework", href: "/family/todo", icon: "listChecks", keywords: "due missing classwork" },
  ],
  student: [
    { label: "Hand in homework", href: "/student/todo", icon: "listChecks", keywords: "submit classwork due upload" },
    { label: "Revise a unit", href: "/student/revision", icon: "target", keywords: "quiz practice test" },
    { label: "Join today's lessons", href: "/student/dashboard", icon: "monitor", keywords: "live lesson teams join" },
  ],
};
const COMMON_ACTIONS: QuickAction[] = [
  { label: "Report a concern", href: "/report-concern", icon: "shieldAlert", keywords: "safeguarding worry dsl unsafe" },
  { label: "Account settings", href: "/account", icon: "userRound", keywords: "password email name sign in pin notifications" },
  { label: "Install the app", href: "/install", icon: "download", keywords: "phone home screen app" },
];

/** Every word typed must appear somewhere in the item (in any order), so
 * "register take" and "take a register" both find it. */
function matches(haystack: string, words: string[]): boolean {
  const h = haystack.toLowerCase();
  return words.every((w) => h.includes(w));
}
const FILLER = new Set(["a", "an", "the", "to", "my", "of", "for", "and", "i", "how", "do", "where", "is", "page", "find"]);

async function loadClasses(area: PortalArea, isHead: boolean): Promise<ClassSummary[]> {
  const supabase = getSupabaseClient();
  if (area === "teach") return fetchTeacherClasses();
  if (area === "admin") return isHead ? fetchAllClasses() : [];
  if (!supabase) return [];
  if (area === "family") {
    const { data } = await supabase.from("children").select("id");
    const ids = ((data as unknown as { id: string }[] | null) || []).map((c) => c.id);
    const lists = await Promise.all(ids.map((id) => fetchChildClasses(id)));
    const seen = new Map<string, ClassSummary>();
    lists.flat().forEach((c) => seen.set(c.id, c));
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase.from("student_accounts").select("child_id").eq("profile_id", user.id).maybeSingle();
  const childId = (data as unknown as { child_id: string } | null)?.child_id;
  return childId ? fetchChildClasses(childId) : [];
}

function SearchIcon({ className }: { className: string }) {
  return (
    <Icon name="search" className={className} />
  );
}

export function CommandPalette({ area, roles }: { area: PortalArea; roles: string[] }) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const prefs = usePortalPrefs(null);
  const [open, setOpen] = useState(false);
  // The shortcut as this computer writes it (Cmd on a Mac, Ctrl elsewhere).
  const [shortcut, setShortcut] = useState("Ctrl K");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the platform once after mount
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setShortcut("\u2318K");
  }, []);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [people, setPeople] = useState<PersonHit[]>([]);
  // Universal search (docs/portal-redesign.md): lessons and units for staff, pupils for the office.
  const [lessonHits, setLessonHits] = useState<{ id: string; title: string; subject: string; year: string; unit: string | null; lesson_no: number }[]>([]);
  const [pupilHits, setPupilHits] = useState<{ id: string; name: string }[]>([]);
  const [recent, setRecent] = useState<Item[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isHead = roles.some((r) => r === "head_teacher" || r === "admin");
  const canSearchPeople = area === "admin" && isHead;
  const canSearchLessons = (area === "admin" && isHead) || area === "teach";

  const openPalette = useCallback(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery("");
    setActive(0);
    setPeople([]);
    setOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    const el = returnFocus.current;
    if (el) window.setTimeout(() => el.focus(), 0);
  }, []);

  // Ctrl/Cmd+K toggles from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) closePalette();
        else openPalette();
      }
    };
    const onOpenEvent = () => {
      if (!open) openPalette();
    };
    window.addEventListener("tga:open-search", onOpenEvent);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("tga:open-search", onOpenEvent);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, openPalette, closePalette]);

  // Classes and recent pages load when the palette first opens.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read recent pages from this browser when the palette opens
    setRecent(
      readRecentPages(`/${area}/`).map((p) => ({ id: `recent:${p.href}`, group: "Recent", label: p.title, hint: p.subtitle, href: p.href, icon: "clock" }))
    );
    if (classes !== null) return;
    let cancelled = false;
    loadClasses(area, isHead)
      .then((c) => {
        if (!cancelled) setClasses(c);
      })
      .catch(() => {
        if (!cancelled) setClasses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, area, isHead, classes]);

  // Debounced people search (headteacher/admin only).
  useEffect(() => {
    const term = query.replace(/[%,()*\\]/g, " ").trim();
    if (!open || !canSearchPeople || term.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear people results when the search is too short
      setPeople([]);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
        .limit(6)
        .then(({ data }) => {
          if (!cancelled) setPeople((data as unknown as PersonHit[] | null) || []);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open, canSearchPeople]);

  // Debounced lesson, unit and pupil search.
  useEffect(() => {
    const term = query.replace(/[%,()*\\]/g, " ").trim();
    if (!open || term.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear results when the search is too short
      setLessonHits([]);
      setPupilHits([]);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (canSearchLessons)
        supabase
          .from("curriculum_lessons")
          .select("id, title, subject, year, unit, lesson_no")
          .or(`title.ilike.%${term}%,unit.ilike.%${term}%`)
          .order("year")
          .limit(8)
          .then(({ data }) => {
            if (!cancelled) setLessonHits((data as typeof lessonHits | null) || []);
          });
      if (canSearchPeople)
        supabase
          .from("children")
          .select("id, name")
          .ilike("name", `%${term}%`)
          .limit(6)
          .then(({ data }) => {
            if (!cancelled) setPupilHits((data as { id: string; name: string }[] | null) || []);
          });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open, canSearchLessons, canSearchPeople]);

  const items = useMemo((): Item[] => {
    const q = query.trim().toLowerCase();
    const words = q.split(/\s+/).filter((w) => w && !FILLER.has(w));
    // Every page, hub tabs and their sub-pages included: "Absences" shows with its category.
    const pageList = visiblePages(area, roles);
    const pages: Item[] = pageList.map((p) => ({ id: `page:${p.href}`, group: "Pages", label: p.label, hint: p.parent, href: p.href, keywords: `${p.hint || ""} ${p.keywords || ""}`, icon: p.icon }));
    const canOpen = (href: string) => !href.startsWith(`/${area}/`) || pageList.some((p) => p.href === href);
    const grouped = isGroupedArea(area);
    const here = navPageFor(pathname, area);
    const herePinned = !!here && prefs.pinned.includes(here.href);
    const actions: Item[] = [
      ...ACTIONS[area].filter((a) => canOpen(a.href)).map((a): Item => ({ id: `action:${a.label}`, group: "Actions", label: a.label, href: a.href, keywords: a.keywords, icon: a.icon })),
      ...(grouped && here && canOpen(here.href)
        ? [{ id: "action:pin", group: "Actions", label: herePinned ? `Unpin "${here.label}"` : `Pin "${here.label}" to the menu`, keywords: "pin favourite bookmark star shortcut unpin", icon: herePinned ? "pinOff" : "pin", run: () => togglePin(here.href) } as Item]
        : []),
      ...COMMON_ACTIONS.map((a): Item => ({ id: `action:${a.label}`, group: "Actions", label: a.label, href: a.href, keywords: a.keywords, icon: a.icon })),
      { id: "action:tour", group: "Actions", label: "Take the tour", keywords: "help guide how to use where is show me around getting started", icon: "compass", run: () => startTour() },
      { id: "action:guide", group: "Actions", label: "Open the Portal guide", href: `/guide?area=${area}`, keywords: "help guide manual a to z every page how do i explain instructions journey day in the life", icon: "bookOpenCheck" },
      { id: "action:guide-page", group: "Actions", label: "Guide me on this page", keywords: "help how does this page work explain show me what is this question mark", icon: "circleHelp", run: () => openGuidePanel() },
    ];
    const pinned: Item[] = grouped ? prefs.pinned.flatMap((h) => pages.filter((p) => p.href === h).map((p) => ({ ...p, id: `pinned:${h}`, group: "Pinned" as const, icon: "pin" as IconName }))) : [];
    const cls: Item[] = (classes || []).map((c) => ({
      id: `class:${c.id}`,
      group: "Classes",
      label: c.name,
      hint: [c.subject, c.yearGroup].filter(Boolean).join(" · ") || undefined,
      href: `/${area}/class?id=${c.id}`,
      icon: "presentation",
    }));
    const ppl: Item[] = people.map((p) => {
      const name = p.full_name || p.email || "Unnamed";
      return { id: `person:${p.id}`, group: "People", label: name, hint: p.full_name ? p.email || undefined : undefined, href: `/admin/people?q=${encodeURIComponent(name)}`, icon: "userRound" };
    });
    const lessonItems: Item[] = lessonHits.map((l) => ({
      id: `lesson:${l.id}`,
      group: "Lessons",
      label: l.title,
      hint: [l.subject, l.year.startsWith("y") ? `Year ${l.year.slice(1)}` : l.year, l.unit].filter(Boolean).join(" · "),
      href: `/${area}/curriculum/lesson?id=${l.id}`,
      icon: "bookOpen",
    }));
    const pupilItems: Item[] = pupilHits.map((p) => ({ id: `pupil:${p.id}`, group: "Pupils", label: p.name, href: `/admin/pupils?id=${p.id}`, icon: "backpack" }));
    if (!q) return [...pinned, ...recent.slice(0, 5), ...actions.slice(0, 4), ...pages.slice(0, 6)];
    const terms = words.length ? words : [q];
    const match = (i: Item) => matches(`${i.label} ${i.hint || ""} ${i.keywords || ""}`, terms);
    // Pages whose name matches come before ones that only match their description or keywords.
    const named = pages.filter((i) => matches(`${i.label} ${i.hint || ""}`, terms));
    const described = pages.filter((i) => !named.includes(i) && match(i));
    return [...actions.filter(match).slice(0, 4), ...[...named, ...described].slice(0, 8), ...cls.filter(match).slice(0, 6), ...lessonItems, ...pupilItems, ...ppl];
  }, [query, area, roles, classes, people, recent, lessonHits, pupilHits, pathname, prefs]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the highlighted result when the search text changes
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (item: Item) => {
    setOpen(false);
    if (item.run) item.run();
    else if (item.href) router.push(item.href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (items.length) setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length) setActive((a) => (a - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[active];
      if (item) go(item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
    } else if (e.key === "Tab") {
      e.preventDefault(); // keep focus in the dialog
    }
  };

  const searching = query.trim().length > 0;
  const loadingMore = searching && (classes === null || (canSearchPeople && query.trim().length >= 2 && people.length === 0));

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        aria-label="Search"
        title={`Search (${shortcut})`}
        data-tour="search"
        className="portal-icon-btn lg:hidden"
      >
        <SearchIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={openPalette}
        aria-label={`Search pages, people and jobs (${shortcut})`}
        aria-keyshortcuts="Control+K Meta+K"
        data-tour="search"
        className="portal-search hidden w-full lg:flex lg:max-w-[20rem] xl:max-w-[26rem]"
      >
        <SearchIcon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 text-left">
          <span className="hidden xl:inline">Search pages, people and jobs</span>
          <span className="xl:hidden">Search</span>
        </span>
        <kbd className="portal-kbd">{shortcut}</kbd>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="portal fixed inset-0 z-[100] flex items-start justify-center bg-ink/40 px-3 pt-[8vh] sm:pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && closePalette()}>
            <div role="dialog" aria-modal="true" aria-label="Search" className="flex max-h-[75vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gold-light bg-white shadow-2xl">
              <div className="flex items-center gap-2 border-b border-gold-light px-4">
                <SearchIcon className="h-5 w-5 shrink-0 text-ink/65" />
                <input
                  ref={inputRef}
                  autoFocus
                  type="text"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="cmdk-list"
                  aria-activedescendant={items[active] ? `cmdk-opt-${active}` : undefined}
                  aria-label="Search pages, classes and people"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKey}
                  placeholder={canSearchPeople ? "Search pages, jobs, classes, lessons and pupils…" : canSearchLessons ? "Search pages, jobs, classes and lessons…" : "Search pages, jobs and classes…"}
                  className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink/65 focus:outline-none"
                />
                <button type="button" onClick={closePalette} aria-label="Close search" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-xs font-medium text-ink/65 hover:bg-cream sm:min-h-8 sm:min-w-0 sm:border sm:border-gold-light">
                  Esc
                </button>
              </div>

              <div ref={listRef} id="cmdk-list" role="listbox" aria-label="Results" className="overflow-y-auto p-2">
                {items.length === 0 ? (
                  <p className="px-3 py-10 text-center text-sm text-ink/65">
                    {loadingMore ? "Searching…" : searching ? `Nothing matches "${query.trim()}". Try a page name or a job, such as \"register\" or \"fees\".` : "Start typing to search."}
                  </p>
                ) : (
                  GROUPS.map((g) => {
                    const groupItems = items.map((it, idx) => ({ it, idx })).filter((x) => x.it.group === g);
                    if (groupItems.length === 0) return null;
                    return (
                      <div key={g} role="group" aria-label={g} className="mb-1">
                        <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink/65">{g}</p>
                        {groupItems.map(({ it, idx }) => (
                          <div
                            key={it.id}
                            id={`cmdk-opt-${idx}`}
                            data-idx={idx}
                            role="option"
                            aria-selected={idx === active}
                            onMouseMove={() => setActive(idx)}
                            onClick={() => go(it)}
                            className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${idx === active ? "bg-cream text-ink" : "text-ink/80"}`}
                          >
                            <Icon name={it.icon} size="sm" className={`h-4 w-4 ${idx === active ? "text-teal-700" : "text-ink/45"}`} />
                            <span className="min-w-0 flex-1 truncate font-medium">{it.label}</span>
                            {it.hint && <span className="max-w-[45%] truncate text-xs text-ink/65">{it.hint}</span>}
                          </div>
                        ))}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="hidden items-center gap-4 border-t border-gold-light px-4 py-2 text-xs text-ink/65 sm:flex">
                <span>↑↓ to move</span>
                <span>Enter to open</span>
                <span>Esc to close</span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
