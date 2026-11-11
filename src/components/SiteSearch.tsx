"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/learn/Icon";
import { SITE_PAGES, type SitePage } from "@/lib/siteJourney";

// "Jump to a page": a search box over every public page, opened from the
// header button or with Ctrl+K / Cmd+K (or "/"). Combobox and listbox
// pattern: focus stays in the box, arrows move, Enter opens, Escape closes.

const OPEN_EVENT = "tga:open-search";

/** Opens the search from anywhere (e.g. the mobile menu). */
export function openSiteSearch() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function search(q: string): SitePage[] {
  const words = norm(q.trim()).split(/\s+/).filter(Boolean);
  if (words.length === 0) return SITE_PAGES;
  return SITE_PAGES.map((p) => {
    const title = norm(p.title);
    const hay = `${title} ${norm(p.desc)} ${norm(p.group)} ${norm(p.keywords ?? "")}`;
    if (!words.every((w) => hay.includes(w))) return null;
    return { p, score: title.startsWith(words[0]) ? 0 : title.includes(words[0]) ? 1 : 2 };
  })
    .filter((x): x is { p: SitePage; score: number } => x !== null)
    .sort((a, b) => a.score - b.score)
    .map((x) => x.p);
}

export function SiteSearchButton({ compact = false }: { compact?: boolean }) {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- platform is only known in the browser
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);
  return (
    <button
      type="button"
      onClick={openSiteSearch}
      aria-label="Search the site"
      title={mac ? "Search the site (⌘K)" : "Search the site (Ctrl K)"}
      // Icon only, also in the header: the bar must fit inside the page width, in line with the content below it.
      className={`group flex items-center gap-2 rounded-full border border-gold-light/70 bg-white/70 text-sm text-ink/70 transition-colors hover:border-gold-500 hover:text-ink ${compact ? "h-10 w-10 justify-center" : "h-9 w-9 justify-center"}`}
    >
      <Icon name="search" size="sm" className="h-4 w-4 text-gold-700" />
    </button>
  );
}

export function SiteSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const listId = useId();
  const results = useMemo(() => search(q), [q]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal only after mount (no document during the static build)
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function show() {
      returnTo.current = document.activeElement as HTMLElement | null;
      setQ("");
      setActive(0);
      setOpen(true);
    }
    function onKey(e: globalThis.KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        show();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        show();
      }
    }
    window.addEventListener(OPEN_EVENT, show);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, show);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function close() {
    setOpen(false);
    returnTo.current?.focus?.();
  }

  function go(p: SitePage | undefined) {
    if (!p) return;
    setOpen(false);
    if (/^https?:/.test(p.href) || p.href.endsWith(".pdf")) window.location.href = p.href;
    else router.push(p.href);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (results.length ? (a + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      e.preventDefault();
    }
  }

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, listId]);

  if (!mounted || !open) return null;

  // A group heading above the first page of each group (only while the box is empty).
  const headings = results.map((p, i) => (!q.trim() && (i === 0 || results[i - 1].group !== p.group) ? p.group : null));
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-ink-900/40 p-3 pt-[10vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-label="Search the site" className="search-panel w-full max-w-xl overflow-hidden rounded-2xl border border-gold-light/60 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-gold-light/50 px-4">
          <Icon name="search" className="h-5 w-5 text-gold-700" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            aria-label="Search pages"
            placeholder="Search pages, e.g. fees, term dates, apply"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink/50 focus:outline-none"
          />
          <button type="button" onClick={close} className="rounded-md border border-gold-light/70 px-1.5 py-0.5 font-mono text-[0.65rem] text-ink/70">
            Esc
          </button>
        </div>
        <ul id={listId} role="listbox" aria-label="Pages" className="max-h-[60vh] overflow-y-auto overscroll-contain p-2">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink/70">Nothing matches that. Try &ldquo;fees&rdquo; or &ldquo;apply&rdquo;.</li>}
          {results.map((p, i) => {
            const heading = headings[i];
            return (
              <li key={p.href} role="presentation">
                {heading && <p role="presentation" className="px-3 pb-1 pt-3 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-gold-700">{heading}</p>}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={() => go(p)}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${i === active ? "bg-gold-50 ring-1 ring-gold-300" : ""}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gold-light/60 bg-white text-gold-700">
                    <Icon name={p.icon} size="sm" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{p.title}</span>
                    {p.desc && <span className="block truncate text-xs text-ink/70">{p.desc}</span>}
                  </span>
                  {i === active && <Icon name="arrowRight" size="sm" className="h-4 w-4 text-gold-700" />}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-gold-light/50 px-4 py-2 font-mono text-[0.65rem] text-ink/70">
          <kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close
        </p>
      </div>
    </div>,
    document.body,
  );
}
