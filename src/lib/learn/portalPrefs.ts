"use client";

// Each person's own portal preferences: pages pinned to the top of the menu,
// which menu categories are open, which guided tours they have seen and how
// far they are through the Portal guide. Saved to `portal_prefs` (migrations
// 0200, 0202 and 0203, own row only) so they follow
// the person to any device, with a copy in this browser so the menu draws
// straight away. If the table can't be reached the browser copy still works.

import { useEffect, useSyncExternalStore } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/** Portal guide progress: pages learned (opened with Guide me, or their Show
 * me finished), the last page read (to resume), and how far each Day in the
 * life journey has got (the step to resume at; -1 when finished). */
export type GuideProgress = { learned: string[]; shown: string[]; last: string | null; journeys: Record<string, number> };

export type PortalPrefs = { pinned: string[]; open: string[]; tours: string[]; guide: GuideProgress; /** The saved copy has been read (or could not be), so "tour seen" is known. */ ready: boolean };

const EMPTY_GUIDE: GuideProgress = { learned: [], shown: [], last: null, journeys: {} };
const EMPTY: PortalPrefs = { pinned: [], open: [], tours: [], guide: EMPTY_GUIDE, ready: false };
const MAX_GUIDE_PAGES = 200;
const MAX_PINS = 12;
const LOCAL = (userId: string) => `tga-prefs:${userId}`;

let userId: string | null = null;
let prefs: PortalPrefs = EMPTY;
let loadedFor: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** False once the server says it has no tours_seen column yet (migration 0202 not applied). */
let toursColumn = true;
/** False once the server says it has no guide_progress column yet (migration 0203 not applied). */
let guideColumn = true;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function clean(list: unknown, max: number): string[] {
  return Array.isArray(list) ? [...new Set(list.filter((x): x is string => typeof x === "string" && x.length < 200))].slice(0, max) : [];
}

function cleanGuide(raw: unknown): GuideProgress {
  if (!raw || typeof raw !== "object") return EMPTY_GUIDE;
  const g = raw as Partial<GuideProgress>;
  const journeys: Record<string, number> = {};
  if (g.journeys && typeof g.journeys === "object") {
    for (const [k, v] of Object.entries(g.journeys).slice(0, 20)) if (typeof v === "number" && Number.isFinite(v) && k.length < 60) journeys[k] = Math.max(-1, Math.min(50, Math.trunc(v)));
  }
  return {
    learned: clean(g.learned, MAX_GUIDE_PAGES),
    shown: clean(g.shown, MAX_GUIDE_PAGES),
    last: typeof g.last === "string" && g.last.length < 200 ? g.last : null,
    journeys,
  };
}

/** Two copies of guide progress together: pages learned on either stay learned. */
function mergeGuide(a: GuideProgress, b: GuideProgress): GuideProgress {
  const journeys: Record<string, number> = { ...a.journeys };
  for (const [k, v] of Object.entries(b.journeys)) journeys[k] = journeys[k] === -1 || v === -1 ? -1 : Math.max(journeys[k] ?? 0, v);
  return {
    learned: [...new Set([...a.learned, ...b.learned])].slice(-MAX_GUIDE_PAGES),
    shown: [...new Set([...a.shown, ...b.shown])].slice(-MAX_GUIDE_PAGES),
    last: b.last || a.last,
    journeys,
  };
}

function readLocal(id: string): PortalPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(LOCAL(id)) || "null") as Partial<PortalPrefs> | null;
    if (raw) return { pinned: clean(raw.pinned, MAX_PINS), open: clean(raw.open, 60), tours: clean(raw.tours, 40), guide: cleanGuide(raw.guide), ready: false };
  } catch {
    /* storage unavailable */
  }
  return EMPTY;
}

function writeLocal() {
  if (!userId) return;
  try {
    window.localStorage.setItem(LOCAL(userId), JSON.stringify({ pinned: prefs.pinned, open: prefs.open, tours: prefs.tours, guide: prefs.guide }));
  } catch {
    /* ignore */
  }
}

function scheduleSave() {
  writeLocal();
  if (saveTimer) clearTimeout(saveTimer);
  const id = userId;
  saveTimer = setTimeout(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !id) return;
    const row: Record<string, unknown> = { user_id: id, pinned_pages: prefs.pinned, nav_open: prefs.open, updated_at: new Date().toISOString() };
    if (toursColumn) row.tours_seen = prefs.tours;
    if (guideColumn) row.guide_progress = prefs.guide;
    let { error } = await supabase.from("portal_prefs").upsert(row, { onConflict: "user_id" });
    // An older database without a newer column: save the rest (the browser copy keeps everything).
    for (let tries = 0; error && tries < 2; tries++) {
      if (guideColumn && /guide_progress/.test(error.message)) {
        guideColumn = false;
        delete row.guide_progress;
      } else if (toursColumn && /tours_seen/.test(error.message)) {
        toursColumn = false;
        delete row.tours_seen;
      } else break;
      ({ error } = await supabase.from("portal_prefs").upsert(row, { onConflict: "user_id" }));
    }
  }, 600);
}

async function load(id: string) {
  userId = id;
  prefs = readLocal(id);
  emit();
  const supabase = getSupabaseClient();
  type Row = { pinned_pages?: string[] | null; nav_open?: string[] | null; tours_seen?: string[] | null; guide_progress?: unknown };
  let row: Row | null = null;
  let ok = false;
  if (supabase) {
    const cols = () => ["pinned_pages", "nav_open", ...(toursColumn ? ["tours_seen"] : []), ...(guideColumn ? ["guide_progress"] : [])].join(", ");
    let res = await supabase.from("portal_prefs").select(cols()).eq("user_id", id).maybeSingle();
    for (let tries = 0; res.error && tries < 2; tries++) {
      if (guideColumn && /guide_progress/.test(res.error.message)) guideColumn = false;
      else if (toursColumn && /tours_seen/.test(res.error.message)) toursColumn = false;
      else break;
      res = await supabase.from("portal_prefs").select(cols()).eq("user_id", id).maybeSingle();
    }
    ok = !res.error;
    row = (res.data as Row | null) || null;
  }
  if (userId !== id) return;
  if (ok && row) {
    // Tours seen on this device but not yet saved stay seen.
    prefs = {
      pinned: clean(row.pinned_pages, MAX_PINS),
      open: clean(row.nav_open, 60),
      tours: [...new Set([...clean(row.tours_seen, 40), ...prefs.tours])],
      guide: mergeGuide(cleanGuide(row.guide_progress), prefs.guide),
      ready: true,
    };
    writeLocal();
  } else {
    prefs = { ...prefs, ready: true };
  }
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** This person's preferences, loaded once per sign-in and shared by every
 * component that asks (the desktop menu, the phone menu, search and tours).
 * Pass the signed-in user's id from the shell; other callers may pass null. */
export function usePortalPrefs(id: string | null | undefined): PortalPrefs {
  useEffect(() => {
    if (!id || loadedFor === id) return;
    loadedFor = id;
    void load(id);
  }, [id]);
  return useSyncExternalStore(
    subscribe,
    () => prefs,
    () => EMPTY,
  );
}

export function isPinned(href: string): boolean {
  return prefs.pinned.includes(href);
}

/** Pin a page to the top of the menu, or unpin it. Returns true when now pinned. */
export function togglePin(href: string): boolean {
  const on = !prefs.pinned.includes(href);
  prefs = { ...prefs, pinned: on ? [...prefs.pinned, href].slice(-MAX_PINS) : prefs.pinned.filter((h) => h !== href) };
  emit();
  scheduleSave();
  return on;
}

/** Open or close a menu category (key: "<area>:<category>"). */
export function setCategoryOpen(key: string, open: boolean) {
  const has = prefs.open.includes(key);
  if (open === has) return;
  prefs = { ...prefs, open: open ? [...prefs.open, key] : prefs.open.filter((k) => k !== key) };
  emit();
  scheduleSave();
}

/** Remember that this person has finished or skipped a tour (key such as "admin:v1" or "tip:planner"). */
export function markTourSeen(key: string) {
  if (prefs.tours.includes(key)) return;
  prefs = { ...prefs, tours: [...prefs.tours, key].slice(-40) };
  emit();
  scheduleSave();
}

/** Portal guide: this page has been learned (opened with Guide me, or its Show me finished). */
export function markGuideLearned(href: string, opts: { shown?: boolean } = {}) {
  const g = prefs.guide;
  const learned = g.learned.includes(href) ? g.learned : [...g.learned, href].slice(-MAX_GUIDE_PAGES);
  const shown = !opts.shown || g.shown.includes(href) ? g.shown : [...g.shown, href].slice(-MAX_GUIDE_PAGES);
  if (learned === g.learned && shown === g.shown && g.last === href) return;
  prefs = { ...prefs, guide: { ...g, learned, shown, last: href } };
  emit();
  scheduleSave();
}

/** Portal guide: where a Day in the life journey has got to (-1 when finished). */
export function setJourneyStep(id: string, step: number) {
  if (prefs.guide.journeys[id] === step) return;
  prefs = { ...prefs, guide: { ...prefs.guide, journeys: { ...prefs.guide.journeys, [id]: step } } };
  emit();
  scheduleSave();
}

/** Portal guide: start again (clears ticks and journeys for this person). */
export function resetGuideProgress() {
  prefs = { ...prefs, guide: EMPTY_GUIDE };
  emit();
  scheduleSave();
}
