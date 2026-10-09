// Central retention job for the compliance registry (supabase/migrations/
// 0015_compliance.sql's `retention_schedule`). See that migration's header
// for why this job — not a disconnected sixth retention mechanism — is the
// one that actually deletes `login_attempts` and `data_rights_requests`,
// while the recording/messaging jobs keep deleting their own tables using
// their own settings singletons and simply get their run reported into
// `retention_job_runs` too (via --report-only, called from their own
// workflows) so this registry stays the one place to see every retention
// job's last run, in one list, regardless of which script performed it.
//
// Usage:
//   node scripts/compliance-retention.mjs                 — runs every
//     data type this script owns (login_attempts, data_rights_requests)
//   node scripts/compliance-retention.mjs --report-only "<Data type>" <count> <action>
//     — used by the recording/messaging retention scripts to log a run
//     they already performed, without this script re-touching their table.
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

async function logRun(dataType, action, rowsAffected, notes) {
  const { error } = await supabase.from("retention_job_runs").insert({ data_type: dataType, action, rows_affected: rowsAffected, notes });
  if (error) console.error(`Could not log retention_job_runs row for "${dataType}":`, error.message);
  await supabase.from("retention_schedule").update({ last_run_at: new Date().toISOString() }).eq("data_type", dataType);
}

if (process.argv[2] === "--report-only") {
  const [, , , dataType, countArg, action] = process.argv;
  const count = Number(countArg) || 0;
  await logRun(dataType, action === "anonymise" ? "anonymise" : "delete", count, "Reported by its own scheduled job.");
  console.log(`Reported "${dataType}": ${count} row(s), action=${action}.`);
  process.exit(0);
}

const summary = [];

// login_attempts: 90-day retention, plain deletion — this table has no
// client read/write policy at all (0007), so only this service-role job
// ever touches it.
{
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  const { error, count } = await supabase.from("login_attempts").delete({ count: "exact" }).lt("attempted_at", cutoff);
  if (error) {
    console.error("login_attempts cleanup failed:", error.message);
  } else {
    await logRun("Sign-in attempt log", "delete", count || 0, null);
    summary.push(`Sign-in attempt log: deleted ${count || 0} row(s) older than 90 days.`);
  }
}

// data_rights_requests: 3 years from completion — only COMPLETED requests
// are ever auto-deleted; open/in-progress requests are never touched by
// this job regardless of age.
{
  const cutoff = new Date(Date.now() - 3 * 365 * 86400000).toISOString();
  const { error, count } = await supabase
    .from("data_rights_requests")
    .delete({ count: "exact" })
    .eq("status", "completed")
    .lt("completed_at", cutoff);
  if (error) {
    console.error("data_rights_requests cleanup failed:", error.message);
  } else {
    await logRun("Data rights requests", "delete", count || 0, null);
    summary.push(`Data rights requests: deleted ${count || 0} completed request(s) older than 3 years.`);
  }
}

// trusted_devices ("remember this device" MFA-skip records, 0017): purge
// rows more than a day past their own expiry. The RPC re-derives nothing
// from the caller (it's a plain service-role delete via SQL function) —
// unlike trust_this_device/is_device_trusted, which run as the signed-in
// user, this one only ever runs as the service role from this job.
{
  const cutoff = new Date(Date.now() - 86400000).toISOString();
  const { error, count } = await supabase.from("trusted_devices").delete({ count: "exact" }).lt("expires_at", cutoff);
  if (error) {
    console.error("trusted_devices cleanup failed:", error.message);
  } else {
    await logRun("Trusted device records", "delete", count || 0, null);
    summary.push(`Trusted device records: deleted ${count || 0} row(s) expired more than a day ago.`);
  }
}

// feedback_tickets (0092): the attached activity log (pages visited,
// errors, browser details) is only needed while the ticket is being worked
// on, so it's cleared 90 days after the ticket is closed. The ticket itself
// and its uploaded files go 2 years after closing. Open tickets are never
// touched, whatever their age.
{
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  const { error, count } = await supabase
    .from("feedback_tickets")
    .update({ activity: [], environment: null }, { count: "exact" })
    .in("status", ["done", "wont_fix"])
    .lt("resolved_at", cutoff)
    .neq("activity", "[]");
  if (error) {
    console.error("feedback_tickets activity cleanup failed:", error.message);
  } else {
    await logRun("Feedback ticket activity logs", "delete", count || 0, null);
    summary.push(`Feedback ticket activity logs: cleared on ${count || 0} ticket(s) closed more than 90 days ago.`);
  }
}
{
  const cutoff = new Date(Date.now() - 2 * 365 * 86400000).toISOString();
  const { data: old, error: listError } = await supabase
    .from("feedback_tickets")
    .select("id, attachments")
    .in("status", ["done", "wont_fix"])
    .lt("resolved_at", cutoff);
  if (listError) {
    console.error("feedback_tickets listing failed:", listError.message);
  } else if (old && old.length > 0) {
    const paths = old.flatMap((t) => (Array.isArray(t.attachments) ? t.attachments.map((a) => a?.path).filter(Boolean) : []));
    if (paths.length > 0) {
      const { error: rmError } = await supabase.storage.from("feedback-attachments").remove(paths);
      if (rmError) console.error("feedback-attachments cleanup failed:", rmError.message);
    }
    const { error, count } = await supabase
      .from("feedback_tickets")
      .delete({ count: "exact" })
      .in(
        "id",
        old.map((t) => t.id),
      );
    if (error) {
      console.error("feedback_tickets cleanup failed:", error.message);
    } else {
      await logRun("Feedback tickets", "delete", count || 0, `${paths.length} file(s) removed`);
      summary.push(`Feedback tickets: deleted ${count || 0} ticket(s) closed more than 2 years ago, with ${paths.length} file(s).`);
    }
  } else {
    await logRun("Feedback tickets", "delete", 0, null);
  }
}

console.log(summary.join("\n") || "Nothing to report.");
if (process.env.GITHUB_STEP_SUMMARY) {
  await import("node:fs/promises").then((fs) =>
    fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `## Compliance retention\n${summary.map((s) => `- ${s}`).join("\n")}\n`)
  );
}
