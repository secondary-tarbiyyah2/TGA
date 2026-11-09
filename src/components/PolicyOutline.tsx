"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { OutlineItem } from "@/lib/policyOutline";

/**
 * A policy with a numbered side outline, like the outline in Google Docs:
 * on wide screens a sticky list of the policy's sections on the left, with
 * the section being read highlighted; on phones and tablets a sticky
 * "Contents" button under the header that opens the same list. Used on the
 * public policy pages and in the portal's policy text preview.
 *
 * `top` is the height of the sticky header above it (80 on the public site,
 * 60 in the portal), so the outline and headings sit just underneath.
 */
export function PolicyOutline({
  outline,
  top,
  children,
  label = "Policy contents",
  bleed = true,
}: {
  outline: OutlineItem[];
  top: number;
  children: ReactNode;
  label?: string;
  /** The phone bar runs edge to edge across the site's Container padding (public site). */
  bleed?: boolean;
}) {
  const [active, setActive] = useState(outline[0]?.id ?? "");
  const [open, setOpen] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const sideList = useRef<HTMLOListElement>(null);
  const panelId = useId();
  const ids = outline.map((o) => o.id).join("|");

  // How far down the viewport a heading counts as "being read": under the
  // header, under the phone Contents bar when it shows, plus a little room.
  // A heading in the top quarter of what is visible counts as the section being read.
  const barHeight = useCallback(() => {
    const b = bar.current;
    return b && b.offsetParent !== null ? b.offsetHeight : 0;
  }, []);
  const readLine = useCallback(() => {
    const above = top + barHeight();
    return above + Math.max(24, (window.innerHeight - above) * 0.25);
  }, [top, barHeight]);

  // Highlight the section being read. Listens in the capture phase so it
  // works whichever element scrolls (the window on the site, the page in the portal).
  useEffect(() => {
    const list = ids.split("|").filter(Boolean);
    if (list.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = readLine();
      let current = list[0];
      for (const id of list) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= line) current = id;
        else break;
      }
      // At the very bottom of the page the last short sections can never
      // reach the line, so the last one visible wins.
      const doc = document.documentElement;
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 4) {
        for (const id of [...list].reverse()) {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top < window.innerHeight) {
            current = id;
            break;
          }
        }
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ids, readLine]);

  // Keep the highlighted entry in view inside the sidebar when the outline is long.
  useEffect(() => {
    const listEl = sideList.current;
    const item = listEl?.querySelector<HTMLElement>(`[data-id="${CSS.escape(active)}"]`);
    const box = listEl?.parentElement;
    if (!item || !box || box.scrollHeight <= box.clientHeight) return;
    const b = box.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    if (r.top < b.top || r.bottom > b.bottom) {
      box.scrollTo({ top: Math.max(0, box.scrollTop + (r.top - b.top) - box.clientHeight / 3) });
    }
  }, [active]);

  // The phone panel closes on Escape or a tap outside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (bar.current && !bar.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const jump = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    setOpen(false);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.hasAttribute("data-reduce-motion");
    // Measure after the phone panel has closed, so the offset is the bar's closed height.
    window.requestAnimationFrame(() => {
      const y = el.getBoundingClientRect().top + window.scrollY - (top + barHeight() + 16);
      window.scrollTo({ top: Math.max(0, y), behavior: reduce ? "instant" : "smooth" });
      el.focus({ preventScroll: true });
      setActive(id);
      try {
        window.history.replaceState(null, "", `#${id}`);
      } catch {
        /* address bar update is a nicety only */
      }
    });
  };

  if (outline.length < 2) return <>{children}</>;

  const current = outline.find((o) => o.id === active) ?? outline[0];
  const style = { "--outline-top": `${top}px` } as CSSProperties;

  const items = (where: "side" | "panel") =>
    outline.map((o) => {
      const on = o.id === active;
      return (
        <li key={o.id} data-id={o.id}>
          <a
            href={`#${o.id}`}
            onClick={(e) => jump(e, o.id)}
            aria-current={on ? "location" : undefined}
            className={`flex gap-2 rounded-r-lg border-l-2 py-1.5 pl-3 pr-2 text-sm leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold-700 ${
              on ? "border-gold-700 bg-gold-100 font-semibold text-ink" : "border-transparent text-ink/80 hover:bg-gold-100/60 hover:text-ink"
            } ${where === "panel" ? "py-2" : ""}`}
          >
            <span className="w-7 shrink-0 tabular-nums text-ink/65">{o.num}.</span>
            <span className="min-w-0">{o.label}</span>
          </a>
        </li>
      );
    });

  return (
    <div className="policy-outlined lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[17rem_minmax(0,1fr)] xl:gap-14" style={style}>
      {/* Phones and tablets: a Contents button that stays under the header. */}
      <div ref={bar} className={`sticky z-30 mb-6 py-2.5 lg:hidden ${bleed ? "-mx-5 border-b border-gold-light/50 bg-cream/95 px-5 backdrop-blur sm:-mx-8 sm:px-8" : "bg-white/95"}`} style={{ top }}>
        <button
          ref={toggle}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-3 rounded-full border border-gold-light/70 bg-white px-4 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-ink/70" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h10M4 18h13" />
          </svg>
          <span className="font-semibold text-ink">Contents</span>
          <span className="min-w-0 flex-1 truncate text-ink/70">
            <span className="sr-only">, now reading </span>
            {current.num}. {current.label}
          </span>
          <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-ink/70 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <nav id={panelId} aria-label={label} hidden={!open} className="mt-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-gold-light/60 bg-white p-2 shadow-lg">
          <ol className="space-y-0.5">{items("panel")}</ol>
        </nav>
      </div>

      {/* Wide screens: the outline stays in view on the left. */}
      <aside className="hidden lg:block">
        <nav aria-label={label} className="sticky max-h-[calc(100vh-var(--outline-top)-2rem)] overflow-y-auto pb-4" style={{ top: top + 16 }}>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-ink/65">Contents</p>
          <ol ref={sideList} className="space-y-0.5">
            {items("side")}
          </ol>
        </nav>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
