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
