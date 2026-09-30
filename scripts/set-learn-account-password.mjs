// One-off support tool: sets a temporary password on an EXISTING /learn
// auth account, as a fallback when the one-time magic-link invite isn't
// working for some reason (e.g. the invite/redirect page hanging). Unlike
// scripts/seed-admin.mjs (which seeds the legacy /staff profiles/
// staff_members tables), this only touches the auth user itself — it
// assumes the account and its user_roles grant already exist (created via
// scripts/invite-first-head-teacher.mjs or learn-invite), and does nothing
// to roles/permissions.
//
// The /learn subdomain's login page already supports email+password sign-in directly, so this
// lets someone in immediately without depending on the invite link at all.
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Run via:
//   node scripts/set-learn-account-password.mjs <email>
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.argv[2] || "").trim().toLowerCase();

if (!url || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!email) {
  console.error("Usage: node scripts/set-learn-account-password.mjs <email>");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

function generatePassword() {
  return crypto.randomBytes(20).toString("base64").replace(/[+/=]/g, "").slice(0, 20) + "!A9";
}

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

const existing = await findUserByEmail(email);
if (!existing) {
  console.error(`No existing account found for ${email} — this tool only resets a password for an account that already exists.`);
  process.exit(1);
}

// TEMP_PASSWORD (optional, from the workflow's masked input) lets whoever
// runs this choose the password instead of reading it back from the log.
const chosen = (process.env.TEMP_PASSWORD || "").trim();
if (chosen && chosen.length < 12) {
  console.error("TEMP_PASSWORD must be at least 12 characters.");
  process.exit(1);
}
const tempPassword = chosen || generatePassword();
const { error } = await supabase.auth.admin.updateUserById(existing.id, { password: tempPassword, email_confirm: true });
if (error) throw error;

const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", existing.id);
const roleList = [...new Set((roleRows || []).map((r) => r.role))].join(", ") || "none";
// Annotation (no password in it) so the result is visible from the run page/API.
console.log(`::notice title=Password reset::${email} (roles: ${roleList}) can now sign in with the new password.`);

console.log("");
console.log("========================================");
console.log(`Password set for: ${email}`);
console.log(chosen ? "Password: the one entered when this workflow was run." : `Temporary password: ${tempPassword}`);
console.log("Sign in at https://learn.tarbiyyah.co.uk/login with this email and password.");
console.log("This password is shown ONCE — it is not stored anywhere. Change it after signing in.");
console.log("========================================");
