// Nudges people who haven't signed a required document after a
// configurable delay. Reuses supabase.public.outstanding_signatures
// (0014_esignature.sql) as the source of truth for "who hasn't signed
// what" — never recomputed here — and the same best-effort-Resend-email +
// always-write-a-step-summary pattern as scripts/check-policy-reviews.mjs.
//
// "After a configurable delay" is read from signable_documents.synced_at
// (when this document version first became known) plus
// NUDGE_AFTER_DAYS (env var, default 7) — a person isn't nudged the
// instant a new policy version appears, only once they've had a
// reasonable window to act.
//
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. RESEND_API_KEY optional.
import { createClient } from "@supabase/supabase-js";
import { mailConfigured, sendMail } from "./lib/sendMail.mjs";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const nudgeAfterDays = Number(process.env.NUDGE_AFTER_DAYS || 7);

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceRoleKey);

// NOTE: this deliberately does NOT query the `outstanding_signatures` view
// — that view's row-restriction is a plain WHERE clause checking
// current_has_permission(), which reads auth.uid() from the request's JWT.
// The service-role key used here has no JWT/auth.uid() at all, so the view
// would (correctly, safely) return zero rows for it. Recomputing the same
// "outstanding" logic directly against the base tables via the
// service-role key (which legitimately bypasses RLS for this trusted,
// server-side job) gives the real answer instead.
const { data: docs, error: docsErr } = await supabase
  .from("signable_documents")
  .select("id, title, current_asset_id, target_roles, synced_at")
  .eq("requires_signature", true);
if (docsErr) {
  console.error("Could not read signable_documents:", docsErr.message);
  process.exit(1);
}

const cutoff = new Date(Date.now() - nudgeAfterDays * 86400000);
const dueDocs = (docs || []).filter((d) => new Date(d.synced_at) <= cutoff);

const due = [];
for (const doc of dueDocs) {
  const { data: targeted } = await supabase
    .from("user_roles")
    .select("user_id, profiles(id, full_name, email)")
    .in("role", doc.target_roles);
  const { data: signed } = await supabase
    .from("document_signatures")
    .select("signer_id")
    .eq("document_id", doc.id)
    .eq("asset_id_signed", doc.current_asset_id);
  const signedIds = new Set((signed || []).map((s) => s.signer_id));
  const seen = new Set();
  for (const row of targeted || []) {
    const profile = row.profiles;
    if (!profile || signedIds.has(row.user_id) || seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    due.push({ user_id: row.user_id, full_name: profile.full_name, email: profile.email, document_id: doc.id, title: doc.title });
  }
}

console.log(`${due.length} outstanding signature(s) past the ${nudgeAfterDays}-day grace window.`);

const summaryLines = ["## Outstanding signature nudges", `${due.length} outstanding signature(s) past the ${nudgeAfterDays}-day grace window.`, ""];
const byPerson = new Map();
for (const row of due) {
  if (!byPerson.has(row.user_id)) byPerson.set(row.user_id, { email: row.email, name: row.full_name, titles: [] });
  byPerson.get(row.user_id).titles.push(row.title);
}
for (const [, person] of byPerson) {
  summaryLines.push(`- ${person.name} (${person.email}): ${person.titles.join(", ")}`);
}
if (byPerson.size === 0) summaryLines.push("Nothing to nudge.");

if (process.env.GITHUB_STEP_SUMMARY) {
  await import("node:fs/promises").then((fs) => fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summaryLines.join("\n") + "\n"));
}

if (byPerson.size === 0 || !mailConfigured()) {
  if (byPerson.size > 0) console.log("(No emails sent — no email provider configured (AWS_SES_* or RESEND_API_KEY). The summary above is the notification for this run.)");
  process.exit(0);
}

let sent = 0;
for (const [, person] of byPerson) {
  if (!person.email) continue;
  const html = `<!DOCTYPE html><html><body style="font-family:Georgia,serif;color:#1B1E21;">
<h2 style="color:#5E4B1E;">Signature needed</h2>
<p>Dear ${person.name || "colleague"},</p>
<p>The following document(s) are awaiting your signature on the /learn portal:</p>
<ul>${person.titles.map((t) => `<li>${t}</li>`).join("")}</ul>
<p>Please sign in at your earliest convenience.</p>
</body></html>`;
  const res = await sendMail(person.email, `${person.titles.length} document(s) awaiting your signature`, html);

  if (res.ok) sent += 1;
}
console.log(`Sent ${sent} nudge email(s).`);
