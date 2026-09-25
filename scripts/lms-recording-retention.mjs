// Scheduled retention job for lesson recordings (see
// .github/workflows/lms-recording-retention.yml).
//
// Two passes, in order:
//   1. Sync — for every meeting BBB reports recordings for that we don't
//      yet know about, insert a lesson_recordings row (status 'available',
//      retention_deletes_at = now + lms_settings.recording_retention_days
//      AT THE TIME the recording is first seen, not the lesson date — GDPR
//      retention counts from when the personal-data recording actually
//      started existing).
//   2. Delete — for every recording past its retention_deletes_at, delete
//      it from BBB AND remove the DB row (not a soft delete — the ground
//      rule is "automatic deletion", and keeping a dangling metadata row
//      after the content is gone serves no purpose and is itself retained
//      personal data about who was in the recording).
//
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BBB_SERVER_URL,
// BBB_SECRET. If BBB isn't configured yet, this exits cleanly (nothing to
// do) rather than failing the whole workflow — matches this project's
// "never depend on a not-yet-provisioned external service" pattern.
import { createClient } from "@supabase/supabase-js";
import { bbbConfigured, listAllRecordings, deleteRecording } from "./lib/bbb-node.mjs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceRoleKey);

const summary = [];

if (!bbbConfigured()) {
  console.log("BBB_SERVER_URL/BBB_SECRET not set — nothing to sync or delete yet. See SETUP.md.");
  if (process.env.GITHUB_STEP_SUMMARY) {
    await import("node:fs/promises").then((fs) =>
      fs.appendFile(process.env.GITHUB_STEP_SUMMARY, "## Recording retention\nBBB is not configured yet — skipped.\n")
    );
  }
  process.exit(0);
}

const { data: settings, error: settingsErr } = await supabase.from("lms_settings").select("recording_retention_days").eq("id", true).single();
if (settingsErr || !settings) {
  console.error("Could not read lms_settings:", settingsErr?.message);
  process.exit(1);
}
const retentionDays = settings.recording_retention_days;

// ── Pass 1: sync new recordings ─────────────────────────────────────────
const bbbRecordings = await listAllRecordings();
const { data: known } = await supabase.from("lesson_recordings").select("bbb_recording_id");
const knownIds = new Set((known || []).map((r) => r.bbb_recording_id));

let synced = 0;
for (const rec of bbbRecordings) {
  if (knownIds.has(rec.recordID)) continue;
  // meetingID is "lesson-<lesson_instance_id>" (see supabase/functions/lesson-join)
  const lessonInstanceId = rec.meetingID.startsWith("lesson-") ? rec.meetingID.slice("lesson-".length) : null;
  if (!lessonInstanceId) continue;
  const retentionDeletesAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("lesson_recordings").insert({
    lesson_instance_id: lessonInstanceId,
    bbb_recording_id: rec.recordID,
    status: "available",
    duration_seconds: rec.startTime && rec.endTime ? Math.round((rec.endTime - rec.startTime) / 1000) : null,
    recorded_at: rec.startTime ? new Date(rec.startTime).toISOString() : null,
    retention_deletes_at: retentionDeletesAt,
  });
  if (!error) synced++;
  else console.error(`Could not insert recording ${rec.recordID}: ${error.message}`);
}
summary.push(`Synced ${synced} new recording(s) from BBB.`);

// ── Pass 2: delete expired recordings ───────────────────────────────────
const { data: expired } = await supabase
  .from("lesson_recordings")
  .select("id, bbb_recording_id")
  .lte("retention_deletes_at", new Date().toISOString())
  .neq("status", "deleted");

let deleted = 0;
for (const rec of expired || []) {
  const bbbOk = await deleteRecording(rec.bbb_recording_id);
  if (!bbbOk) {
    console.error(`BBB deleteRecordings failed for ${rec.bbb_recording_id} — leaving the DB row so this retries next run.`);
    continue;
  }
  await supabase.from("lesson_recordings").delete().eq("id", rec.id);
  await supabase.from("audit_log").insert({
    actor_id: null,
    actor_email: "scheduled-job:lms-recording-retention",
    action: "RECORDING_RETENTION_DELETE",
    target_table: "lesson_recordings",
    target_id: rec.id,
    changes: null,
  });
  deleted++;
}
summary.push(`Deleted ${deleted} recording(s) past their ${retentionDays}-day retention date.`);

console.log(summary.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) {
  await import("node:fs/promises").then((fs) =>
    fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `## Recording retention\n${summary.map((l) => `- ${l}`).join("\n")}\n`)
  );
}

// Report this run into the central retention registry (0015_compliance.sql)
// so the compliance page's "when did each retention job last run" view
// covers this job too, without this job touching a table it doesn't own —
// see scripts/compliance-retention.mjs's header for the reasoning.
await supabase.from("retention_job_runs").insert({ data_type: "Lesson recordings", action: "delete", rows_affected: deleted, notes: null });
await supabase.from("retention_schedule").update({ last_run_at: new Date().toISOString() }).eq("data_type", "Lesson recordings");
