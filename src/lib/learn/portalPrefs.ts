"use client";

// Each person's own portal preferences: pages pinned to the top of the menu,
// which menu categories are open, and which guided tours they have seen. Saved
// to `portal_prefs` (migrations 0200 and 0202, own row only) so they follow
// the person to any device, with a copy in this browser so the menu draws
// straight away. If the table can't be reached the browser copy still works.

import { useEffect, useSyncExternalStore } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export type PortalPrefs = { pinned: string[]; open: string[]; tours: string[]; /** The saved copy has been read (or could not be), so "tour seen" is known. */ ready: boolean };

const EMPTY: PortalPrefs = { pinned: [], open: [], tours: [], ready: false };
const MAX_PINS = 12;
const LOCAL = (userId: string) => `tga-prefs:${userId}`;

let userId: string | null = null;
let prefs: PortalPrefs = EMPTY;
let loadedFor: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** False once the server says it has no tours_seen column yet (migration 0202 not applied). */
let toursColumn = true;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function clean(list: unknown, max: number): string[] {
  return Array.isArray(list) ? [...new Set(list.filter((x): x is string => typeof x === "string" && x.length < 200))].slice(0, max) : [];
}

function readLocal(id: string): PortalPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(LOCAL(id)) || "null") as Partial<PortalPrefs> | null;
    if (raw) return { pinned: clean(raw.pinned, MAX_PINS), open: clean(raw.open, 60), tours: clean(raw.tours, 40), ready: false };
  } catch {
    /* storage unavailable */
  }
  return EMPTY;
}

function writeLocal() {
  if (!userId) return;
  try {
    window.localStorage.setItem(LOCAL(userId), JSON.stringify({ pinned: prefs.pinned, open: prefs.open, tours: prefs.tours }));
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
    const { error } = await supabase.from("portal_prefs").upsert(row, { onConflict: "user_id" });
    if (error && toursColumn && /tours_seen/.test(error.message)) {
      toursColumn = false;
      delete row.tours_seen;
      await supabase.from("portal_prefs").upsert(row, { onConflict: "user_id" });
    }
  }, 600);
}

async function load(id: string) {
  userId = id;
  prefs = readLocal(id);
  emit();
  const supabase = getSupabaseClient();
  type Row = { pinned_pages?: string[] | null; nav_open?: string[] | null; tours_seen?: string[] | null };
  let row: Row | null = null;
  let ok = false;
  if (supabase) {
    let res = await supabase.from("portal_prefs").select("pinned_pages, nav_open, tours_seen").eq("user_id", id).maybeSingle();
    if (res.error && /tours_seen/.test(res.error.message)) {
      toursColumn = false;
      res = await supabase.from("portal_prefs").select("pinned_pages, nav_open").eq("user_id", id).maybeSingle();
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
