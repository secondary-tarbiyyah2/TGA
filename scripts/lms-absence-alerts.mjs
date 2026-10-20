// Scheduled absence-alert + escalation job (see
// .github/workflows/lms-absence-alerts.yml).
//
// Trigger rule (a deliberate choice — documented, not hidden): a child
// counts as needing an alert once their lesson's SCHEDULED END TIME plus
// `lms_settings.absence_alert_delay_minutes` has passed, if by then there is
// still no 'present'/'late' attendance_records row for them AND no
// absence_notices row (an advance parent notice always counts as
// "explained" and is skipped entirely). This deliberately also catches a
// lesson a teacher simply never got round to registering, not only ones
// explicitly marked 'absent' — for a safeguarding-relevant signal, "nobody
// confirmed this child was present" is the thing that matters, not only an
// explicit tick.
//
// Idempotency: rather than adding new "alerted" columns to attendance
// tables, this reuses `audit_log` as the record of "an alert was already
// sent for this (lesson, child)" / "an escalation was already sent for this
// child" — see the ground rule to reuse the existing audit table rather
// than invent a parallel one.
//
// Per-run digests, not one email per absence: the Headteacher gets ONE
// email per run listing every newly-unexplained absence (not N separate
// emails), and the Safeguarding Lead gets ONE email per run listing every
// child who newly crossed the threshold. This is a practical choice to
// avoid alert fatigue defeating the purpose of the alert; it does not
// affect the guarantee that every case is escalated exactly once.
//
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Email requires
// RESEND_API_KEY (best-effort, same as elsewhere in this project — always
// logs to the run summary regardless). Safeguarding Lead / Headteacher
// contact details are read live from Sanity at runtime (this is a
// GitHub-Actions batch job, not a Next.js build step, so it can call
// Sanity's read API directly — same approach as
// scripts/check-policy-reviews.mjs) via NEXT_PUBLIC_SANITY_PROJECT_ID +
// SANITY_API_TOKEN.
import { createClient } from "@supabase/supabase-js";
import { createClient as createSanityClient } from "@sanity/client";
import { mailConfigured, sendMail } from "./lib/sendMail.mjs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceRoleKey);

// Sending goes through scripts/lib/sendMail.mjs (Amazon SES, then Resend).
async function sendEmail(to, subject, html) {
  return sendMail(to, subject, html);
}

function shell(bodyHtml) {
  return `<!DOCTYPE html><html><body style="font-family:Georgia,serif;color:#1B1E21;background:#FDFBF6;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #B08E45;border-radius:16px;overflow:hidden;">
<div style="background:#1B1E21;padding:20px 28px;"><span style="color:#B08E45;font-weight:bold;">Tarbiyyah Global Academy</span></div>
<div style="padding:28px;">${bodyHtml}</div>
</div></body></html>`;
}

// ── Sanity: safeguarding lead / headteacher contact ────────────────────
const sanityProjectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const sanityDataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const sanityToken = process.env.SANITY_API_TOKEN;
let safeguardingLeadContact = null;
let headteacherName = null;
let admissionsEmail = null;
if (sanityProjectId && sanityToken) {
  const sanity = createSanityClient({ projectId: sanityProjectId, dataset: sanityDataset, token: sanityToken, apiVersion: "2025-01-01", useCdn: false });
  const settings = await sanity.fetch(`*[_type == "siteSettings"][0]{ safeguardingLeadContact, headteacherName, admissionsEmail }`).catch(() => null);
  safeguardingLeadContact = settings?.safeguardingLeadContact || null;
  headteacherName = settings?.headteacherName || null;
  admissionsEmail = settings?.admissionsEmail || null;
} else {
  console.log("NEXT_PUBLIC_SANITY_PROJECT_ID/SANITY_API_TOKEN not set — Headteacher/Safeguarding Lead escalation emails will be skipped (unexplained absences are still logged to audit_log).");
}

// ── Settings ─────────────────────────────────────────────────────────────
const { data: settings, error: settingsErr } = await supabase
  .from("lms_settings")
  .select("absence_alert_delay_minutes, unexplained_absence_threshold, unexplained_absence_period_days")
  .eq("id", true)
  .single();
if (settingsErr || !settings) {
  console.error("Could not read lms_settings:", settingsErr?.message);
  process.exit(1);
}
const { absence_alert_delay_minutes: delayMinutes, unexplained_absence_threshold: threshold, unexplained_absence_period_days: periodDays } = settings;

const now = Date.now();
// Look back far enough that a lesson is never missed between runs (this
// runs hourly — see the workflow), but not so far that ancient lessons get
// re-scanned every single run.
const windowEnd = new Date(now - delayMinutes * 60 * 1000).toISOString();
const windowStart = new Date(now - delayMinutes * 60 * 1000 - 26 * 60 * 60 * 1000).toISOString();

// lesson_instances doesn't store a computed "scheduled end" timestamp
// directly (date + timetable_slots.end_time) — pull the join and compute
// client-side; the candidate set (last ~27h) is always small.
const { data: candidates, error: candidatesErr } = await supabase
  .from("lesson_instances")
  .select("id, date, timetable_slot_id, timetable_slots(class_id, end_time, classes(name, is_test))")
  .gte("date", windowStart.slice(0, 10))
  .lte("date", windowEnd.slice(0, 10));
if (candidatesErr) {
  console.error("Could not read lesson_instances:", candidatesErr.message);
  process.exit(1);
}

const dueLessons = (candidates || []).filter((li) => {
  const slot = li.timetable_slots;
  if (!slot?.end_time) return false;
  // Test classes (scripts/test-data.mjs) never raise absence alerts.
  if (slot.classes?.is_test) return false;
  const scheduledEnd = new Date(`${li.date}T${slot.end_time}`).getTime();
  return scheduledEnd + delayMinutes * 60 * 1000 <= now && scheduledEnd >= new Date(windowStart).getTime() - 24 * 60 * 60 * 1000;
});

const headTeacherDigest = [];
const safeguardingDigest = [];
let parentEmailsSent = 0;

for (const li of dueLessons) {
  const classId = li.timetable_slots.class_id;
  const className = li.timetable_slots.classes?.name || "class";

  const [{ data: enrolments }, { data: attendance }, { data: notices }] = await Promise.all([
    supabase.from("enrolments").select("child_id, children(id, name, parent_user_id)").eq("class_id", classId),
    supabase.from("attendance_records").select("child_id, status").eq("lesson_instance_id", li.id),
    supabase.from("absence_notices").select("child_id").eq("lesson_instance_id", li.id),
  ]);
  const attendanceByChild = new Map((attendance || []).map((a) => [a.child_id, a.status]));
  const noticedChildIds = new Set((notices || []).map((n) => n.child_id));

  for (const e of enrolments || []) {
    const status = attendanceByChild.get(e.child_id);
    // Attended, or the teacher recorded that the pupil tried but couldn't connect.
    if (status === "present" || status === "late" || status === "not_engaged" || status === "technical") continue;
    if (noticedChildIds.has(e.child_id)) continue; // parent gave advance notice — explained, not alerted

    const alertKey = `${li.id}:${e.child_id}`;
    const { data: alreadyAlerted } = await supabase
      .from("audit_log")
      .select("id")
      .eq("action", "ABSENCE_ALERT_SENT")
      .eq("target_table", "attendance_records")
      .eq("target_id", alertKey)
      .maybeSingle();
    if (alreadyAlerted) continue;

    const child = e.children;
    if (!child) continue;

    // Parent email, best-effort.
    if (child.parent_user_id) {
      const { data: parentProfile } = await supabase.from("profiles").select("email, full_name").eq("id", child.parent_user_id).single();
      if (parentProfile?.email) {
        const result = await sendEmail(
          parentProfile.email,
          `${child.name} was not marked present — ${className}`,
          shell(`<p>Dear ${parentProfile.full_name || "Parent/Carer"},</p>
<p><strong>${child.name}</strong> was not marked present for <strong>${className}</strong> on ${li.date}.</p>
<p>If this was a planned absence, you can record the reason from your parent dashboard so it doesn't show as unexplained.</p>
<p>If you believe this is a mistake, please contact the school office.</p>`)
        );
        if (result.ok) parentEmailsSent++;
      }
    }

    await supabase.from("audit_log").insert({
      actor_id: null,
      actor_email: "scheduled-job:lms-absence-alerts",
      action: "ABSENCE_ALERT_SENT",
      target_table: "attendance_records",
      target_id: alertKey,
      changes: { child_id: e.child_id, lesson_instance_id: li.id, class_id: classId, date: li.date },
    });

    headTeacherDigest.push(`${child.name} — ${className} — ${li.date}`);

    // Rolling unexplained-absence count for this child.
    const periodStart = new Date(now - periodDays * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("action", "ABSENCE_ALERT_SENT")
      .eq("changes->>child_id", e.child_id)
      .gte("created_at", periodStart);

    if ((count || 0) >= threshold) {
      const { data: alreadyEscalated } = await supabase
        .from("audit_log")
        .select("id")
        .eq("action", "SAFEGUARDING_ESCALATION")
        .eq("target_table", "children")
        .eq("target_id", e.child_id)
        .gte("created_at", periodStart)
        .maybeSingle();
      if (!alreadyEscalated) {
        await supabase.from("audit_log").insert({
          actor_id: null,
          actor_email: "scheduled-job:lms-absence-alerts",
          action: "SAFEGUARDING_ESCALATION",
          target_table: "children",
          target_id: e.child_id,
          changes: { unexplained_count: count, period_days: periodDays, threshold },
        });
        safeguardingDigest.push(`${child.name} — ${count} unexplained absences in the last ${periodDays} days (threshold ${threshold})`);
      }
    }
  }
}

const headTeacherEmail = admissionsEmail; // no dedicated "headteacher email" field in siteSettings yet — see report
if (headTeacherDigest.length > 0 && headTeacherEmail) {
  await sendEmail(
    headTeacherEmail,
    `${headTeacherDigest.length} unexplained absence(s) today`,
    shell(`<p>${headteacherName ? `Dear ${headteacherName},` : "Hello,"}</p><ul>${headTeacherDigest.map((l) => `<li>${l}</li>`).join("")}</ul>`)
  );
}
if (safeguardingDigest.length > 0 && safeguardingLeadContact && safeguardingLeadContact.includes("@")) {
  await sendEmail(
    safeguardingLeadContact,
    `${safeguardingDigest.length} child(ren) crossed the unexplained-absence threshold`,
    shell(`<p>The following child(ren) have crossed the configured unexplained-absence threshold:</p><ul>${safeguardingDigest.map((l) => `<li>${l}</li>`).join("")}</ul>`)
  );
}

const summaryLines = [
  "## Absence alerts",
  `Checked ${dueLessons.length} lesson(s) past their alert window.`,
  `Parent alert emails sent: ${parentEmailsSent}.`,
  `Newly unexplained absences this run: ${headTeacherDigest.length}${headTeacherEmail ? "" : " (Headteacher digest skipped — no admissionsEmail configured in Site settings)"}.`,
  `Safeguarding escalations this run: ${safeguardingDigest.length}${safeguardingLeadContact ? "" : safeguardingDigest.length ? " (email skipped — no safeguardingLeadContact configured in Site settings)" : ""}.`,
];
console.log(summaryLines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) {
  await import("node:fs/promises").then((fs) => fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summaryLines.join("\n") + "\n"));
}
