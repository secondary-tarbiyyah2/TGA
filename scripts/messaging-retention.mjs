// Scheduled retention job for parent-teacher/staff messages (see
// .github/workflows/messaging-retention.yml and
// supabase/migrations/0013_messaging.sql's header for why deletion is
// ONLY ever done here, never client-side).
//
// Deletes every message_threads row (cascading to its
// message_thread_messages, via ON DELETE CASCADE) whose most recent
// message is older than messaging_settings.message_retention_days. A
// thread with no messages at all is left alone (created_at is not a proxy
// for "went stale" — it may just be a newly-opened, not-yet-used thread).
//
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceRoleKey);

const { data: settings, error: settingsErr } = await supabase
  .from("messaging_settings")
  .select("message_retention_days")
  .eq("id", true)
  .single();
if (settingsErr || !settings) {
  console.error("Could not read messaging_settings:", settingsErr?.message);
  process.exit(1);
}
const cutoff = new Date(Date.now() - settings.message_retention_days * 86400000).toISOString();

// This project has no generic SQL-execution RPC (deliberately — see 0004's
// service-role bypass reasoning), so "delete threads whose latest message
// is older than the cutoff" is done with plain per-thread calls below
// rather than a single aggregate SQL statement.
const { data: threads, error: threadsErr } = await supabase.from("message_threads").select("id");
if (threadsErr) {
  console.error("Could not list message_threads:", threadsErr.message);
  process.exit(1);
}

let deleted = 0;
for (const thread of threads || []) {
  const { data: lastMessage } = await supabase
    .from("message_thread_messages")
    .select("created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastMessage) continue; // never-used thread — leave it
  if (lastMessage.created_at >= cutoff) continue; // still within retention

  const { error: deleteErr } = await supabase.from("message_threads").delete().eq("id", thread.id);
  if (deleteErr) {
    console.error(`Failed to delete thread ${thread.id}:`, deleteErr.message);
    continue;
  }
  deleted += 1;
}

console.log(`Messaging retention: deleted ${deleted} thread(s) past ${settings.message_retention_days}-day retention.`);
if (process.env.GITHUB_STEP_SUMMARY) {
  await import("node:fs/promises").then((fs) =>
    fs.appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## Messaging retention\nDeleted ${deleted} thread(s) past the ${settings.message_retention_days}-day retention period.\n`
    )
  );
}

// Report this run into the central retention registry — see
// scripts/compliance-retention.mjs's header for why this job keeps
// deleting its own table but reports the run centrally.
await supabase.from("retention_job_runs").insert({ data_type: "Parent/staff/student messages", action: "delete", rows_affected: deleted, notes: null });
await supabase.from("retention_schedule").update({ last_run_at: new Date().toISOString() }).eq("data_type", "Parent/staff/student messages");
