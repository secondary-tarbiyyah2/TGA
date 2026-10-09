// Checks every policyLink's nextReview date against Sanity, and flags any
// due within the next 30 days. Always writes a summary (visible in the
// GitHub Actions run regardless of email working), and best-effort emails
// the Headteacher / admissions address via Resend — matching this
// project's established "never depend on email alone" pattern (Resend's
// sending domain isn't verified yet; see scripts/seed-admin.mjs and
// supabase/functions/*/index.ts for the same reasoning elsewhere).
//
// Requires NEXT_PUBLIC_SANITY_PROJECT_ID, SANITY_API_TOKEN (read is enough).
// RESEND_API_KEY is optional — if absent, this still reports via the step
// summary, it just skips the email.
import { createClient } from "@sanity/client";
import { mailConfigured, sendMail } from "./lib/sendMail.mjs";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const token = process.env.SANITY_API_TOKEN;
const WARNING_WINDOW_DAYS = 30;

if (!projectId || !token) {
  console.error("Missing NEXT_PUBLIC_SANITY_PROJECT_ID or SANITY_API_TOKEN");
  process.exit(1);
}

const client = createClient({ projectId, dataset, token, apiVersion: "2025-01-01", useCdn: false });

const policies = await client.fetch(`*[_type == "policyLink" && defined(nextReview)]{ title, number, nextReview } | order(nextReview asc)`);
const settings = await client.fetch(`*[_type == "siteSettings"][0]{ admissionsEmail, safeguardingLeadContact, headteacherName }`);

const now = new Date();
const cutoff = new Date(now.getTime() + WARNING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

const due = policies.filter((p) => {
  const d = new Date(p.nextReview);
  return d <= cutoff;
});

console.log(`Checked ${policies.length} polic${policies.length === 1 ? "y" : "ies"} with a review date; ${due.length} due within ${WARNING_WINDOW_DAYS} days.`);

if (due.length > 0) {
  console.log("\nDue for review:");
  for (const p of due) {
    const overdue = new Date(p.nextReview) < now;
    console.log(`  ${p.number} ${p.title} — ${p.nextReview}${overdue ? " (OVERDUE)" : ""}`);
  }
}

const summaryLines = [
  "## Policy review-date check",
  `Checked ${policies.length} polic${policies.length === 1 ? "y" : "ies"} with a review date.`,
  "",
];
if (due.length > 0) {
  summaryLines.push(`**${due.length} due within ${WARNING_WINDOW_DAYS} days:**`, "");
  for (const p of due) {
    const overdue = new Date(p.nextReview) < now;
    summaryLines.push(`- ${p.number} ${p.title} — ${p.nextReview}${overdue ? " **(OVERDUE)**" : ""}`);
  }
} else {
  summaryLines.push("Nothing due — no action needed.");
}
if (process.env.GITHUB_STEP_SUMMARY) {
  await import("node:fs/promises").then((fs) => fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summaryLines.join("\n") + "\n"));
}

if (due.length === 0) {
  process.exit(0);
}

const notifyEmail = settings?.safeguardingLeadContact || settings?.admissionsEmail;
if (!mailConfigured() || !notifyEmail) {
  console.log(`\n(No email sent — ${!mailConfigured() ? "no email provider configured (AWS_SES_* or RESEND_API_KEY)" : "no safeguardingLeadContact/admissionsEmail configured in Site settings"}. The list above is the notification for this run.)`);
  process.exit(0);
}

const html = `<!DOCTYPE html><html><body style="font-family:Georgia,serif;color:#1B1E21;">
<h2 style="color:#5E4B1E;">Policy review dates approaching</h2>
<p>${settings.headteacherName ? `Dear ${settings.headteacherName},` : "Hello,"}</p>
<p>The following ${due.length === 1 ? "policy is" : "policies are"} due for review within ${WARNING_WINDOW_DAYS} days:</p>
<ul>${due.map((p) => `<li><strong>${p.number} ${p.title}</strong> — due ${p.nextReview}${new Date(p.nextReview) < now ? " (overdue)" : ""}</li>`).join("")}</ul>
<p>Update the review date once each has been re-reviewed, via Sanity Studio.</p>
</body></html>`;

const res = await sendMail(notifyEmail, `${due.length} polic${due.length === 1 ? "y" : "ies"} due for review`, html);

if (res.ok) {
  console.log(`\nEmail sent to ${notifyEmail}.`);
} else {
  console.log(`\nEmail could not be sent (${res.detail}) — the list above is the notification for this run.`);
}
