"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchAllClasses, fetchChildClasses, fetchTeacherClasses, readRecentPages, type ClassSummary } from "@/lib/learn/classes";
import { visibleSidebar, type PortalArea } from "@/lib/learn/nav";

type Item = { id: string; group: "Recent" | "Pages" | "Classes" | "People"; label: string; hint?: string; href: string };
type PersonHit = { id: string; full_name: string | null; email: string | null };

const GROUPS: Item["group"][] = ["Recent", "Pages", "Classes", "People"];

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
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M13 13l4 4" />
    </svg>
  );
}

export function CommandPalette({ area, roles }: { area: PortalArea; roles: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [recent, setRecent] = useState<Item[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isHead = roles.some((r) => r === "head_teacher" || r === "admin");
  const canSearchPeople = area === "admin" && isHead;

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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openPalette, closePalette]);

  // Classes and recent pages load when the palette first opens.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    setRecent(
      readRecentPages(`/${area}/`).map((p) => ({ id: `recent:${p.href}`, group: "Recent", label: p.title, hint: p.subtitle, href: p.href }))
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

  const items = useMemo((): Item[] => {
    const q = query.trim().toLowerCase();
    const pages: Item[] = visibleSidebar(area, roles).map((p) => ({ id: `page:${p.href}`, group: "Pages", label: p.label, href: p.href }));
    const cls: Item[] = (classes || []).map((c) => ({
      id: `class:${c.id}`,
      group: "Classes",
      label: c.name,
      hint: [c.subject, c.yearGroup].filter(Boolean).join(" · ") || undefined,
      href: `/${area}/class?id=${c.id}`,
    }));
    const ppl: Item[] = people.map((p) => {
      const name = p.full_name || p.email || "Unnamed";
      return { id: `person:${p.id}`, group: "People", label: name, hint: p.full_name ? p.email || undefined : undefined, href: `/admin/people?q=${encodeURIComponent(name)}` };
    });
    if (!q) return [...recent.slice(0, 5), ...pages.slice(0, 8)];
    const match = (i: Item) => i.label.toLowerCase().includes(q) || (i.hint || "").toLowerCase().includes(q);
    return [...pages.filter(match).slice(0, 8), ...cls.filter(match).slice(0, 8), ...ppl];
  }, [query, area, roles, classes, people, recent]);

  useEffect(() => {
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
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink/65 hover:bg-cream hover:text-ink md:hidden"
      >
        <SearchIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={openPalette}
        aria-label="Search"
        className="mr-1 hidden h-9 w-56 items-center gap-2 rounded-full border border-gold-light bg-cream/50 px-3 text-sm text-ink/55 hover:bg-cream md:flex"
      >
        <SearchIcon className="h-4 w-4" />
        <span>Search…</span>
        <kbd className="ml-auto rounded border border-gold-light bg-white px-1.5 py-0.5 text-[11px] font-medium text-ink/55">Ctrl K</kbd>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="portal fixed inset-0 z-[100] flex items-start justify-center bg-ink/40 px-3 pt-[8vh] sm:pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && closePalette()}>
            <div role="dialog" aria-modal="true" aria-label="Search" className="flex max-h-[75vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gold-light bg-white shadow-2xl">
              <div className="flex items-center gap-2 border-b border-gold-light px-4">
                <SearchIcon className="h-5 w-5 shrink-0 text-ink/45" />
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
                  placeholder={canSearchPeople ? "Search pages, classes and people…" : "Search pages and classes…"}
                  className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink/40 focus:outline-none"
                />
                <button type="button" onClick={closePalette} className="rounded-md border border-gold-light px-2 py-1 text-xs font-medium text-ink/55 hover:bg-cream">
                  Esc
                </button>
              </div>

              <div ref={listRef} id="cmdk-list" role="listbox" aria-label="Results" className="overflow-y-auto p-2">
                {items.length === 0 ? (
                  <p className="px-3 py-10 text-center text-sm text-ink/60">
                    {loadingMore ? "Searching…" : searching ? `Nothing matches "${query.trim()}". Try a page, class${canSearchPeople ? " or person" : ""} name.` : "Start typing to search."}
                  </p>
                ) : (
                  GROUPS.map((g) => {
                    const groupItems = items.map((it, idx) => ({ it, idx })).filter((x) => x.it.group === g);
                    if (groupItems.length === 0) return null;
                    return (
                      <div key={g} role="group" aria-label={g} className="mb-1">
                        <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink/45">{g}</p>
                        {groupItems.map(({ it, idx }) => (
                          <div
                            key={it.id}
                            id={`cmdk-opt-${idx}`}
                            data-idx={idx}
                            role="option"
                            aria-selected={idx === active}
                            onMouseMove={() => setActive(idx)}
                            onClick={() => go(it)}
                            className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm ${idx === active ? "bg-cream text-ink" : "text-ink/80"}`}
                          >
                            <span className="truncate font-medium">{it.label}</span>
                            {it.hint && <span className="truncate text-xs text-ink/50">{it.hint}</span>}
                          </div>
                        ))}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="hidden items-center gap-4 border-t border-gold-light px-4 py-2 text-xs text-ink/50 sm:flex">
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
