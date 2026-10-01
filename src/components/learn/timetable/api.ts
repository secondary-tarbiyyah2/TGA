import { callEdgeFunction } from "@/lib/learn/edge";

export async function callFunction(name: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; detail?: string; run_id?: string; created?: number }> {
  // Shared helper: never throws or hangs, see src/lib/learn/edge.ts.
  return (await callEdgeFunction(name, body)) as never;
}

export const btn = "rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gold-900 disabled:opacity-50";
export const ghost = "rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/80 transition-colors hover:bg-cream disabled:opacity-50";
export const fieldCls = "mt-1 w-full rounded-lg border border-gold-light/70 bg-white px-3 py-2 text-sm text-ink";
export const chipCls = (on: boolean) =>
  `rounded-full border px-3 py-1 text-sm font-medium ${on ? "border-gold-500 bg-gold-500 text-ink" : "border-gold-light bg-white text-ink/70 hover:bg-cream"}`;

type SlotsClient = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Update a slot by hand and flag it `locked` so "Re-run keeping locked
 * lessons" preserves it. If the `locked` column does not exist yet
 * (migration 0056 not applied) the update is retried without it.
 */
export async function updateSlotLocked(supabase: SlotsClient, id: string, patch: Record<string, unknown>, locked = true): Promise<{ message: string; code?: string } | null> {
  const first = await supabase.from("timetable_slots").update({ ...patch, locked }).eq("id", id);
  if (!first.error) return null;
  if (!/locked/i.test(first.error.message || "")) return first.error;
  const second = await supabase.from("timetable_slots").update(patch).eq("id", id);
  return second.error || null;
}

/** Insert a slot flagged locked (hand-placed); retried without the flag if the column is missing. */
export async function insertSlotLocked(supabase: SlotsClient, row: Record<string, unknown>, locked = true): Promise<{ message: string; code?: string } | null> {
  const first = await supabase.from("timetable_slots").insert({ ...row, locked });
  if (!first.error) return null;
  if (!/locked/i.test(first.error.message || "")) return first.error;
  const second = await supabase.from("timetable_slots").insert(row);
  return second.error || null;
}
