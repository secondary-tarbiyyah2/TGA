"use client";

// Each person's own portal preferences: pages pinned to the top of the menu and
// which menu categories are open. Saved to `portal_prefs` (migration 0200, own
// row only) so they follow the person to any device, with a copy in this
// browser so the menu draws straight away. If the table can't be reached the
// browser copy still works.

import { useEffect, useSyncExternalStore } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export type PortalPrefs = { pinned: string[]; open: string[] };

const EMPTY: PortalPrefs = { pinned: [], open: [] };
const MAX_PINS = 12;
const LOCAL = (userId: string) => `tga-prefs:${userId}`;

let userId: string | null = null;
let prefs: PortalPrefs = EMPTY;
let loadedFor: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function clean(list: unknown, max: number): string[] {
  return Array.isArray(list) ? [...new Set(list.filter((x): x is string => typeof x === "string" && x.length < 200))].slice(0, max) : [];
}

function readLocal(id: string): PortalPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(LOCAL(id)) || "null") as Partial<PortalPrefs> | null;
    if (raw) return { pinned: clean(raw.pinned, MAX_PINS), open: clean(raw.open, 60) };
  } catch {
    /* storage unavailable */
  }
  return EMPTY;
}

function writeLocal() {
  if (!userId) return;
  try {
    window.localStorage.setItem(LOCAL(userId), JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

function scheduleSave() {
  writeLocal();
  if (saveTimer) clearTimeout(saveTimer);
  const id = userId;
  saveTimer = setTimeout(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !id) return;
    void supabase
      .from("portal_prefs")
      .upsert({ user_id: id, pinned_pages: prefs.pinned, nav_open: prefs.open, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .then(() => undefined);
  }, 600);
}

async function load(id: string) {
  userId = id;
  prefs = readLocal(id);
  emit();
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { data, error } = await supabase.from("portal_prefs").select("pinned_pages, nav_open").eq("user_id", id).maybeSingle();
  if (error || !data || userId !== id) return;
  const row = data as { pinned_pages?: string[] | null; nav_open?: string[] | null };
  prefs = { pinned: clean(row.pinned_pages, MAX_PINS), open: clean(row.nav_open, 60) };
  writeLocal();
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** This person's preferences, loaded once per sign-in and shared by every
 * component that asks (the desktop menu, the phone menu and search). */
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
