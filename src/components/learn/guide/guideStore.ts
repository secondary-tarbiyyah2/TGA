"use client";

// The Portal guide's shared state: whether the side panel is open, and the
// spotlight that "Show me" (and the Day in the life journeys) run on the live
// page. A tiny store so the top-bar button, the panel, search and the menu can
// all open the guide without passing props through the shell.

import { useSyncExternalStore } from "react";

export type SpotStep = {
  target?: string;
  title: string;
  body: string;
  /** Journeys: the page this step is on. */
  href?: string;
  /** Journeys: follow the first link inside this target to reach the page. */
  from?: string;
};
export type Spot = {
  /** "show" for a page's Show me; "journey" for a Day in the life journey. */
  kind: "show" | "journey";
  key: string;
  steps: SpotStep[];
  index: number;
  heading: string;
};

type State = { panel: boolean; spot: Spot | null };

let state: State = { panel: false, spot: null };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useGuideState(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

export const openGuidePanel = () => set({ panel: true });
export const closeGuidePanel = () => set({ panel: false });
export const toggleGuidePanel = () => set({ panel: !state.panel });
export const startSpot = (spot: Omit<Spot, "index"> & { index?: number }) => set({ spot: { ...spot, index: spot.index ?? 0 }, panel: false });
export const moveSpot = (index: number) => state.spot && set({ spot: { ...state.spot, index } });
export const endSpot = () => set({ spot: null });
