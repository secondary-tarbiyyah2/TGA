#!/usr/bin/env node
// Emails the school when a scheduled or deploy workflow fails.
//
// Run by .github/workflows/alert-on-failure.yml, which GitHub triggers after
// any of the listed workflows finishes. Until this existed, a failing
// retention job, reminder run or deploy only ever emailed whoever last
// touched the workflow file — usually nobody who would act on it.
//
// Env (set by the workflow): WORKFLOW_NAME, WORKFLOW_URL, WORKFLOW_CONCLUSION,
// WORKFLOW_BRANCH, WORKFLOW_EVENT, OPS_ALERT_EMAIL (recipient, defaults to
// the admissions inbox), plus the mail provider variables sendMail.mjs reads.
import { mailConfigured, sendMail } from "./lib/sendMail.mjs";

const name = process.env.WORKFLOW_NAME || "(unknown workflow)";
const url = process.env.WORKFLOW_URL || "";
const conclusion = process.env.WORKFLOW_CONCLUSION || "failure";
const branch = process.env.WORKFLOW_BRANCH || "";
const event = process.env.WORKFLOW_EVENT || "";
const to = process.env.OPS_ALERT_EMAIL || process.env.ADMISSIONS_EMAIL || "globalacademy@tarbiyyah.co.uk";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const subject = `[TGA] ${name} ${conclusion}`;
const html = `
  <p>The GitHub Actions workflow <strong>${esc(name)}</strong> finished with status <strong>${esc(conclusion)}</strong>.</p>
  <p>Branch: ${esc(branch) || "–"} · Trigger: ${esc(event) || "–"}</p>
  <p><a href="${esc(url)}">Open the run</a> to see the log. If it is a scheduled job (reminders, retention, alerts) it will try again at its next slot; if it is a deploy, the live site/portal has NOT been updated.</p>
  <p style="color:#626870;font-size:13px">Sent by scripts/alert-workflow-failure.mjs.</p>`;

if (!mailConfigured()) {
  console.log(`::warning::${subject} — no mail provider configured (RESEND_API_KEY or AWS_SES_*), so nobody was emailed. Run: ${url}`);
  process.exit(0);
}

const result = await sendMail(to, subject, html);
if (!result.ok) {
  console.log(`::warning::Could not email ${to} about ${name}: ${result.detail}`);
  process.exit(0);
}
console.log(`Alert sent to ${to}: ${subject}`);
