"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchAllClasses, fetchChildClasses, fetchTeacherClasses, readRecentPages, type ClassSummary } from "@/lib/learn/classes";
import { visiblePages, type PortalArea } from "@/lib/learn/nav";
import { Icon, type IconName } from "@/components/learn/Icon";

type Item = { id: string; group: "Recent" | "Pages" | "Classes" | "Lessons" | "Pupils" | "People"; label: string; hint?: string; href: string; keywords?: string; icon: IconName };
type PersonHit = { id: string; full_name: string | null; email: string | null };

const GROUPS: Item["group"][] = ["Recent", "Pages", "Classes", "Lessons", "Pupils", "People"];

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
  const [open, setOpen] = useState(false);
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
    // Every page, hub tabs included: "Absences" shows as "Absences · Attendance".
    const pages: Item[] = visiblePages(area, roles).map((p) => ({ id: `page:${p.href}`, group: "Pages", label: p.label, hint: p.parent, href: p.href, keywords: p.hint, icon: p.icon }));
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
    if (!q) return [...recent.slice(0, 5), ...pages.slice(0, 8)];
    const match = (i: Item) => `${i.label} ${i.hint || ""} ${i.keywords || ""}`.toLowerCase().includes(q);
    // Pages whose name matches come before ones that only match their description.
    const named = pages.filter((i) => `${i.label} ${i.hint || ""}`.toLowerCase().includes(q));
    const described = pages.filter((i) => !named.includes(i) && match(i));
    return [...[...named, ...described].slice(0, 8), ...cls.filter(match).slice(0, 6), ...lessonItems, ...pupilItems, ...ppl];
  }, [query, area, roles, classes, people, recent, lessonHits, pupilHits]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the highlighted result when the search text changes
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (item: Item) => {
    setOpen(false);
    router.push(item.href);
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
        title="Search (Ctrl K)"
        className="flex h-11 w-11 items-center justify-center rounded-full text-ink/65 hover:bg-cream hover:text-ink md:hidden"
      >
        <SearchIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={openPalette}
        aria-label="Search or jump to a page (Ctrl K)"
        className="mr-1 hidden h-10 w-64 items-center gap-2.5 rounded-xl border border-gold-light bg-[var(--portal-canvas)] px-3.5 text-sm text-ink/65 transition-colors hover:border-ink/25 hover:bg-white hover:text-ink md:flex lg:w-80 xl:w-96"
      >
        <SearchIcon className="h-4 w-4" />
        <span>Search or jump to a page</span>
        <kbd className="ml-auto rounded border border-gold-light bg-white px-1.5 py-0.5 text-[11px] font-medium text-ink/65">Ctrl K</kbd>
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
                  placeholder={canSearchPeople ? "Search pages, classes, lessons, pupils and people…" : canSearchLessons ? "Search pages, classes and lessons…" : "Search pages and classes…"}
                  className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink/65 focus:outline-none"
                />
                <button type="button" onClick={closePalette} aria-label="Close search" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-xs font-medium text-ink/65 hover:bg-cream sm:min-h-8 sm:min-w-0 sm:border sm:border-gold-light">
                  Esc
                </button>
              </div>

              <div ref={listRef} id="cmdk-list" role="listbox" aria-label="Results" className="overflow-y-auto p-2">
                {items.length === 0 ? (
                  <p className="px-3 py-10 text-center text-sm text-ink/65">
                    {loadingMore ? "Searching…" : searching ? `Nothing matches "${query.trim()}". Try a page, class${canSearchPeople ? " or person" : ""} name.` : "Start typing to search."}
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
