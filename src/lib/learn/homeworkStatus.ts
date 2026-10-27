import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Adds each row's homework (title etc.) to rows read from the homework_status
 * view. Embedding `homework:homework_id(...)` on that view does not work: the
 * API resolves it to homework_submissions and the whole query fails, which
 * made families see "No homework due". So read the homework separately.
 * Archived homework is hidden from families and pupils by RLS, so its
 * `homework` comes back null; callers filter on that as before.
 */
export async function attachHomework<T extends { homework_id: string }, H = Record<string, unknown>>(
  supabase: SupabaseClient,
  rows: T[] | null | undefined,
  columns: string,
): Promise<(T & { homework: H | null })[]> {
  const list = rows || [];
  const ids = [...new Set(list.map((r) => r.homework_id))];
  if (!ids.length) return [];
  const map = new Map<string, H>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabase.from("homework").select(`id, ${columns}`).in("id", ids.slice(i, i + 150));
    for (const h of (data as unknown as (H & { id: string })[]) || []) map.set(h.id, h);
  }
  return list.map((r) => ({ ...r, homework: map.get(r.homework_id) || null }));
}
