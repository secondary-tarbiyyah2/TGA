"use client";

// School features: switches the Headteacher turns on or off under Settings,
// School features (owner, 11 Nov 2026: "allow this to be turned on or off by
// headteacher ... turn off the function until it's fully developed, because we
// are opening"). Stored in the database (public.school_features, migration
// 0210), read once per session and cached; `useFeature("revision_packs")`
// answers whether a part of the portal is on.
//
// Switching something off hides it everywhere; no data is deleted. The parts
// that matter for safety or cost are also enforced on the server (lesson
// editing and the automatic revision packs in the database, AI in the
// ai-assist function).
//
// Only "react" is imported statically, so node unit tests can run this file
// (src/lib/learn/features.test.ts).

import { useEffect, useSyncExternalStore } from "react";

export type FeatureKey = "revision_packs" | "subject_lesson_editing" | "ai_helpers" | "house_points" | "guide_journeys" | "lesson_feedback";
export type FeatureMap = Record<FeatureKey, boolean>;

export type FeatureInfo = { key: FeatureKey; label: string; explain: string; on: string; off: string; default: boolean };

/** Every switch, in the order Settings lists them, with one plain line each. */
export const FEATURES: FeatureInfo[] = [
  {
    key: "revision_packs",
    label: "Revision packs",
    explain: "Unit revision packs, pupil revision quizzes and revision results. Off until the feature is fully ready; nothing is deleted.",
    on: "Teachers see each unit's revision pack, pupils see Revise, and draft packs are made when a unit is signed off.",
    off: "Hidden for everyone, and no draft packs are made. Turn on again to find everything as it was.",
    default: false,
  },
  {
    key: "subject_lesson_editing",
    label: "Only subject teachers can edit lessons",
    explain: "When on, a teacher edits only the lessons of the subjects they teach; the Headteacher edits all of them.",
    on: "Teachers edit their own subjects' lessons. Others can read them and leave feedback.",
    off: "Any teacher can edit any lesson.",
    default: true,
  },
  {
    key: "ai_helpers",
    label: "AI helpers",
    explain: "AI drafts for staff: report comments, weekly notes, revision questions and message sorting. Staff always check a draft before it is used.",
    on: "The \"Draft with AI\" buttons appear for staff.",
    off: "No AI buttons, and the server refuses AI requests.",
    default: true,
  },
  {
    key: "house_points",
    label: "House points",
    explain: "House points, the house leaderboard and Star of the Week. Merits and behaviour records are not affected.",
    on: "House points pages for staff and the leaderboard for pupils and families.",
    off: "The House points pages and leaderboards are hidden.",
    default: true,
  },
  {
    key: "guide_journeys",
    label: "Portal guide journeys",
    explain: "The \"A day in the life\" walk-throughs on the Portal guide page. The guide's page-by-page help stays.",
    on: "The walk-throughs are offered on the Portal guide page.",
    off: "Only the page-by-page guide is shown.",
    default: true,
  },
  {
    key: "lesson_feedback",
    label: "Lesson feedback",
    explain: "Staff leave notes on a lesson (\"this slide needs a picture\") and the Headteacher answers them.",
    on: "A Feedback button on every lesson, and notes waiting in Waiting for you.",
    off: "No Feedback buttons and no lesson notes in Waiting for you. Notes already sent are kept.",
    default: true,
  },
];

export const FEATURE_KEYS: FeatureKey[] = FEATURES.map((f) => f.key);

export const DEFAULT_FEATURES: FeatureMap = Object.fromEntries(FEATURES.map((f) => [f.key, f.default])) as FeatureMap;

export const isFeatureKey = (k: unknown): k is FeatureKey => typeof k === "string" && (FEATURE_KEYS as string[]).includes(k);

/** The switches from database rows; a missing or unknown row keeps its default. */
export function featureMapFrom(rows: { key: string; enabled: boolean }[] | null | undefined): FeatureMap {
  const out: FeatureMap = { ...DEFAULT_FEATURES };
  for (const r of rows || []) if (isFeatureKey(r.key) && typeof r.enabled === "boolean") out[r.key] = r.enabled;
  return out;
}

/** Banner on a lesson the viewer cannot edit, matching the switches. */
export function lessonReadOnlyNote(f: Pick<FeatureMap, "subject_lesson_editing" | "lesson_feedback">): string {
  const read = f.lesson_feedback ? "You can read this lesson and leave feedback." : "You can read this lesson.";
  return `${read} ${f.subject_lesson_editing ? "Editing is for teachers of this subject and the Headteacher." : "Editing is for teachers and the Headteacher."}`;
}

// ── The per-session cache ──────────────────────────────────────────────────

export type FeatureLoader = () => Promise<{ key: string; enabled: boolean }[] | null>;
type Storage = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

const STORAGE_KEY = "tga-school-features";

/** The defaults until the database answers; then the saved switches. One
 * request per browser session (kept in sessionStorage), shared by every
 * component through `subscribe`. */
export function createFeatureStore(loader: FeatureLoader, storage?: Storage | null) {
  let value: FeatureMap = { ...DEFAULT_FEATURES };
  let loaded = false;
  let pending: Promise<FeatureMap> | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) {
      const rows = Object.entries(JSON.parse(raw) as Record<string, boolean>).map(([key, enabled]) => ({ key, enabled }));
      value = featureMapFrom(rows);
      loaded = true;
    }
  } catch {
    // A broken or blocked cache just means asking the database.
  }

  const save = (m: FeatureMap) => {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(m));
    } catch {
      // Private windows may refuse storage; the in-memory copy still works.
    }
  };

  return {
    get: (): FeatureMap => value,
    isLoaded: () => loaded,
    subscribe(l: () => void): () => void {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /** Reads the switches once per session; later calls reuse the answer. A failed read keeps the defaults and tries again next time. */
    load(): Promise<FeatureMap> {
      if (loaded) return Promise.resolve(value);
      if (!pending) {
        pending = loader()
          .then((rows) => {
            if (rows) {
              value = featureMapFrom(rows);
              loaded = true;
              save(value);
              emit();
            }
            return value;
          })
          .catch(() => value)
          .finally(() => {
            pending = null;
          });
      }
      return pending;
    },
    /** After the Headteacher saves a switch: this tab sees it straight away. */
    set(key: FeatureKey, enabled: boolean) {
      value = { ...value, [key]: enabled };
      save(value);
      emit();
    },
    /** Forget the cache (sign out, or a test). */
    reset() {
      value = { ...DEFAULT_FEATURES };
      loaded = false;
      try {
        storage?.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      emit();
    },
  };
}

export type FeatureStore = ReturnType<typeof createFeatureStore>;

const supabaseLoader: FeatureLoader = async () => {
  const { getSupabaseClient } = await import("@/lib/supabase/client");
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return null; // signed out: defaults until sign-in
  const { data, error } = await supabase.from("school_features").select("key, enabled");
  // Before migration 0210 is deployed the table is missing: use the defaults (and don't cache them).
  return error ? null : ((data as { key: string; enabled: boolean }[] | null) ?? null);
};

const browserStorage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

let store: FeatureStore | null = null;

/** The portal's one store (made on first use, in the browser). */
export function featureStore(): FeatureStore {
  if (!store) store = createFeatureStore(supabaseLoader, browserStorage());
  return store;
}

/** For tests: use another store (or null for the portal's own). */
export function setFeatureStore(s: FeatureStore | null) {
  store = s;
}

/** Every switch, for code outside React (the Action centre). */
export function loadFeatures(): Promise<FeatureMap> {
  return featureStore().load();
}

/** Every switch. Defaults until the database has answered (once per session). */
export function useFeatures(): FeatureMap {
  const s = featureStore();
  const value = useSyncExternalStore(s.subscribe, s.get, () => DEFAULT_FEATURES);
  useEffect(() => {
    void s.load();
  }, [s]);
  return value;
}

/** Is this part of the portal switched on? e.g. `useFeature("revision_packs")`. */
export function useFeature(name: FeatureKey): boolean {
  return useFeatures()[name];
}
