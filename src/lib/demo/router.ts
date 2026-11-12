"use client";

// Portal demo (NEXT_PUBLIC_DEMO=1 only): the portal runs as one page and
// keeps "where you are" in the address's #hash, because the demo is hosted
// as a single file under an unknown path where ordinary paths would not
// survive a reload. "#teach-dashboard" is /teach/dashboard; a page with a
// query is "#/teach/class?id=...&tab=classwork".
//
// Nothing here is imported by the real portal: the demo build points
// next/link, next/navigation and @/lib/supabase/client at src/lib/demo.

import { useSyncExternalStore } from "react";

export type DemoLocation = { pathname: string; search: string; key: string };

let knownPaths = new Set<string>(["/"]);
/** The portal's page paths (from the route table), so "#teach-dashboard" can be read back. */
export function setKnownPaths(paths: string[]) {
  knownPaths = new Set(paths);
}
const plainName = (path: string) => path.replace(/^\/+|\/+$/g, "").replace(/\//g, "-");

function normalisePath(p: string): string {
  let out = p.replace(/\/index\.html$/, "").replace(/\/+$/, "");
  if (!out.startsWith("/")) out = `/${out}`;
  out = out.replace(/^\/learn(?=\/|$)/, "") || "/";
  return out || "/";
}

/** Reads a #hash into a portal location, or null when the hash is an in-page anchor (#main). */
export function parseHash(hash: string): DemoLocation | null {
  const h = decodeURIComponent((hash || "").replace(/^#/, ""));
  if (!h) return { pathname: "/", search: "", key: "/" };
  if (h.startsWith("/")) {
    const q = h.indexOf("?");
    const pathname = normalisePath(q >= 0 ? h.slice(0, q) : h);
    const search = q >= 0 ? h.slice(q) : "";
    return { pathname, search: search === "?" ? "" : search, key: pathname + search };
  }
  for (const p of knownPaths) if (plainName(p) === h) return { pathname: p, search: "", key: p };
  return null;
}

/** The #hash for a portal path such as "/teach/class?id=1". */
export function hashFor(href: string): string {
  const q = href.indexOf("?");
  const path = normalisePath(q >= 0 ? href.slice(0, q) : href);
  const search = q >= 0 ? href.slice(q) : "";
  if (!search || search === "?") return path === "/" ? "#/" : `#${plainName(path)}`;
  return `#${path}${search}`;
}

let current: DemoLocation = { pathname: "/", search: "", key: "/" };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function readNow() {
  if (typeof window === "undefined") return;
  const next = parseHash(window.location.hash);
  if (!next) {
    // An in-page anchor such as the skip link: stay on the page and move to it.
    const id = decodeURIComponent(window.location.hash.slice(1));
    document.getElementById(id)?.focus?.();
    return;
  }
  if (next.key !== current.key) {
    current = next;
    emit();
  }
}

let started = false;
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  current = parseHash(window.location.hash) || current;
  window.addEventListener("hashchange", readNow);
  window.addEventListener("popstate", readNow);
}

export function subscribe(l: () => void) {
  start();
  listeners.add(l);
  return () => listeners.delete(l);
}
export function getLocation(): DemoLocation {
  start();
  return current;
}

/** Resolves an href against the page you are on: "/x", "?tab=y", "x?y", "#anchor". */
export function resolveHref(href: string): string | null {
  if (!href) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return null; // https:, mailto:, blob:
  if (href.startsWith("#")) {
    const loc = parseHash(href);
    return loc ? loc.key : null;
  }
  const base = new URL(`https://demo.invalid${current.pathname}${current.pathname.endsWith("/") ? "" : "/"}`);
  const u = new URL(href, href.startsWith("?") ? `https://demo.invalid${current.pathname}` : base);
  return normalisePath(u.pathname) + (u.search || "");
}

function setHash(hash: string, replace: boolean) {
  if (replace) {
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    // A marked state, so the app router's own history handling leaves it alone.
    History.prototype.replaceState.call(window.history, window.history.state, "", url);
  } else {
    window.location.hash = hash;
  }
  readNow();
}

export function navigate(href: string, opts: { replace?: boolean; scroll?: boolean } = {}) {
  if (typeof window === "undefined") return;
  const target = resolveHref(href);
  if (target === null) {
    // Leaving the portal (an email link, a payment page): never in the demo.
    if (/^(mailto|tel):/i.test(href)) window.location.href = href;
    else if (/^https?:/i.test(href)) window.open(href, "_blank", "noopener");
    return;
  }
  const before = current.pathname;
  setHash(hashFor(target), !!opts.replace);
  if (opts.scroll !== false && current.pathname !== before) window.scrollTo(0, 0);
}

const SERVER_LOCATION: DemoLocation = { pathname: "/", search: "", key: "/" };
export function useDemoLocation(): DemoLocation {
  return useSyncExternalStore(subscribe, getLocation, () => SERVER_LOCATION);
}

/** window.location stand-in for code that reads or sets the address directly (the demo build rewrites those calls to this). */
export const demoLoc = {
  get pathname() {
    return getLocation().pathname;
  },
  get search() {
    return getLocation().search;
  },
  get href() {
    return typeof window === "undefined" ? "" : window.location.href;
  },
  /** The page's address as if it were a normal path, for code that edits the query and writes it back. */
  get fullHref() {
    const loc = getLocation();
    return `${typeof window === "undefined" ? "https://demo.invalid" : window.location.origin}${loc.pathname}${loc.search}`;
  },
  set href(v: string) {
    navigate(v);
  },
  assign(v: string) {
    navigate(v);
  },
  replace(v: string) {
    navigate(v, { replace: true });
  },
  replaceState(_state: unknown, _unused: string, url?: string | URL | null) {
    if (url == null) return;
    const s = String(url);
    if (s.startsWith("#")) return; // an in-page anchor: keep the page
    const target = resolveHref(s.replace(/^https?:\/\/[^/]+/, ""));
    if (target !== null) setHash(hashFor(target), true);
  },
  pushState(_state: unknown, _unused: string, url?: string | URL | null) {
    if (url == null) return;
    const target = resolveHref(String(url).replace(/^https?:\/\/[^/]+/, ""));
    if (target !== null) setHash(hashFor(target), false);
  },
};

declare global {
  var __demoLoc: typeof demoLoc | undefined;
}
if (typeof window !== "undefined") globalThis.__demoLoc = demoLoc;
