// Removes subject-access export files once their 24-hour link has expired
// (plus a short grace period), so personal-data bundles never sit in storage
// indefinitely. Shared by subject-access-export (opportunistic clean-up on
// each export) and purge-data-exports (scheduled).
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "data-exports";
const FILE_NAMES = ["subject-access.json", "subject-access.html"];

export async function purgeExpiredExports(service: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h after the link expires
  const { data, error } = await service
    .from("data_export_log")
    .select("id, storage_prefix")
    .is("files_deleted_at", null)
    .lt("expires_at", cutoff)
    .limit(100);
  if (error || !data) return 0;

  let purged = 0;
  for (const row of data as { id: string; storage_prefix: string }[]) {
    const { error: rmErr } = await service.storage.from(BUCKET).remove(FILE_NAMES.map((n) => `${row.storage_prefix}/${n}`));
    if (rmErr) continue; // try again next time
    await service.from("data_export_log").update({ files_deleted_at: new Date().toISOString() }).eq("id", row.id);
    purged++;
  }
  return purged;
}
