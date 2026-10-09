// Checks every Single Central Record (supabase/migrations/0015_compliance.sql's
// `staff_vetting_records`) for a DBS renewal due within the warning window,
// or missing checks entirely for a current staff member. Always writes a
// summary (visible in the GitHub Actions run), and best-effort emails the
// Headteacher — same "never depend on email alone" pattern as
// scripts/check-policy-reviews.mjs.
//
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. RESEND_API_KEY is
// optional — if absent, this still reports via the step summary.
import { createClient } from "@supabase/supabase-js";
import { mailConfigured, sendMail } from "./lib/sendMail.mjs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WARNING_WINDOW_DAYS = 60;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceRoleKey);

// Every current staff member (any staff learn_role), left-joined against
// their vetting record — a staff member with NO row at all is exactly as
// reportable as one with an overdue DBS renewal date.
const { data: staffRoles, error: staffErr } = await supabase
  .from("user_roles")
  .select("user_id, role, profiles!inner(id, full_name, email)")
  .in("role", ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover"]);
if (staffErr) {
  console.error("Could not read user_roles:", staffErr.message);
  process.exit(1);
}
const staffById = new Map();
for (const r of staffRoles || []) {
  if (!staffById.has(r.user_id)) staffById.set(r.user_id, r.profiles);
}

const { data: records, error: recErr } = await supabase.from("staff_vetting_records").select("*");
if (recErr) {
  console.error("Could not read staff_vetting_records:", recErr.message);
  process.exit(1);
}
const recordByUser = new Map((records || []).map((r) => [r.user_id, r]));

const now = new Date();
const cutoff = new Date(now.getTime() + WARNING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

const flags = [];
for (const [userId, profile] of staffById) {
  const rec = recordByUser.get(userId);
  if (!rec) {
    flags.push({ name: profile.full_name, reason: "No vetting record on file at all" });
    continue;
  }
  if (!rec.dbs_renewal_due) {
    flags.push({ name: profile.full_name, reason: "No DBS renewal date recorded" });
  } else {
    const due = new Date(rec.dbs_renewal_due);
    if (due <= cutoff) flags.push({ name: profile.full_name, reason: `DBS renewal due ${rec.dbs_renewal_due}${due < now ? " (OVERDUE)" : ""}` });
  }
  if (!rec.right_to_work_verified) flags.push({ name: profile.full_name, reason: "Right-to-work not yet verified" });
  if (!rec.references_received) flags.push({ name: profile.full_name, reason: "References not yet received" });
}

console.log(`Checked ${staffById.size} staff member(s); ${flags.length} flag(s).`);
for (const f of flags) console.log(`  ${f.name} — ${f.reason}`);

const summaryLines = ["## Single Central Record expiry check", `Checked ${staffById.size} staff member(s).`, ""];
if (flags.length > 0) {
  summaryLines.push(`**${flags.length} flag(s):**`, "", ...flags.map((f) => `- ${f.name} — ${f.reason}`));
} else {
  summaryLines.push("Nothing to flag — every staff member's record is up to date.");
}
if (process.env.GITHUB_STEP_SUMMARY) {
  await import("node:fs/promises").then((fs) => fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summaryLines.join("\n") + "\n"));
}

if (flags.length === 0) process.exit(0);

const { data: headTeacherRole } = await supabase
  .from("user_roles")
  .select("profiles!inner(email, full_name)")
  .eq("role", "head_teacher")
  .limit(1)
  .maybeSingle();
const notifyEmail = headTeacherRole?.profiles?.email;

if (!mailConfigured() || !notifyEmail) {
  console.log(`\n(No email sent — ${!mailConfigured() ? "no email provider configured (AWS_SES_* or RESEND_API_KEY)" : "no head_teacher account found"}. The list above is the notification for this run.)`);
  process.exit(0);
}

const html = `<!DOCTYPE html><html><body style="font-family:Georgia,serif;color:#1B1E21;">
<h2 style="color:#5E4B1E;">Single Central Record — checks due</h2>
<p>Dear ${headTeacherRole.profiles.full_name || "Headteacher"},</p>
<p>The following ${flags.length === 1 ? "item needs" : "items need"} attention on the Single Central Record:</p>
<ul>${flags.map((f) => `<li><strong>${f.name}</strong> — ${f.reason}</li>`).join("")}</ul>
<p>Review and update these on the Compliance page under /learn/admin/compliance.</p>
</body></html>`;

const res = await sendMail(notifyEmail, `${flags.length} Single Central Record item(s) need attention`, html);

console.log(res.ok ? `\nEmail sent to ${notifyEmail}.` : `\nEmail could not be sent (${res.detail}) — the list above is the notification for this run.`);
