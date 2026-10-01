// Bootstraps the very first Headteacher account for /learn. Doesn't go
// through the learn-invite Edge Function (which requires the CALLER to
// already be a Headteacher/Admin under their own JWT) — there is by
// definition no one to authorize this yet. This script instead uses the
// service-role key directly, exactly as trusted as that Edge Function is,
// and does the same three things it would: create the auth account with no
// password, grant the head_teacher role, and generate a one-time setup
// link. Idempotent — safe to re-run (e.g. if the link expired unused).
//
// Never displays, logs, or emails a password — only the one-time link,
// which is itself shown ONCE, same handling as that Edge Function's output.
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Run via:
//   node scripts/invite-first-head-teacher.mjs owner@example.com "Full Name"
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.argv[2] || "").trim().toLowerCase();
const fullName = (process.argv[3] || "").trim();
// /learn lives on its own subdomain (see src/lib/learn/origin.ts and
// SETUP.md, "Moving /learn to its own subdomain") — LEARN_SITE_URL, not
// SITE_URL (the main marketing domain), is where the setup link must land.
const learnSiteUrl = process.env.LEARN_SITE_URL || "https://learn.tarbiyyah.co.uk";

if (!url || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!email || !fullName) {
  console.error('Usage: node scripts/invite-first-head-teacher.mjs <email> "<full name>"');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

async function findUserByEmail(targetEmail) {
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === targetEmail);
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

let userId;
let isNewUser = false;
const existing = await findUserByEmail(email);
if (existing) {
  userId = existing.id;
  console.log("User already existed — leaving auth account as-is, (re)granting role and generating a fresh setup link.");
} else {
  isNewUser = true;
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({ email, email_confirm: true });
  if (createErr) throw createErr;
  userId = created.user.id;
  console.log("Created new user (no password set).");
}

const { error: profileErr } = await supabase
  .from("profiles")
  .upsert({ id: userId, role: "admin", full_name: fullName, email }, { onConflict: "id" });
if (profileErr) throw profileErr;

const { error: roleErr } = await supabase
  .from("user_roles")
  .upsert(
    { user_id: userId, role: "head_teacher", scope_type: "none", scope_id: null, granted_by: null },
    { onConflict: "user_id,role,scope_type,scope_id" },
  );
if (roleErr) throw roleErr;

const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
  type: isNewUser ? "invite" : "recovery",
  email,
  options: { redirectTo: `${learnSiteUrl}/login/invite` },
});
if (linkErr) throw linkErr;

console.log("");
console.log("========================================");
console.log(`Headteacher account ready: ${email}`);
console.log("One-time setup link (sets their own password + MFA — never a password we hand over):");
console.log(linkData.properties.action_link);
console.log("This link is shown ONCE — it is not stored anywhere. Copy it now and share it with them directly.");
console.log("========================================");
