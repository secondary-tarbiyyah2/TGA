// Seeds (or resets) the first admin account WITHOUT depending on email —
// Resend can't send yet (sending-domain DNS isn't verified), so this uses
// the service-role admin API to create the account directly with a
// temporary password, rather than GoTrue's inviteUserByEmail (which both
// creates the user AND requires sending an email in one call, so it fails
// outright if email delivery is broken).
//
// Idempotent: if the user already exists, resets their password instead of
// failing, and upserts their profile/staff rows either way.
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
// Never commit these, never expose them to client code. Run via:
//   node scripts/seed-admin.mjs owner@example.com
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
  console.error("Usage: node scripts/seed-admin.mjs <email>");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

function generatePassword() {
  // 20 random bytes, base64url-ish (strip characters that are awkward to
  // read/type aloud when handing this over verbally), padded to a minimum
  // useful length.
  return crypto.randomBytes(20).toString("base64").replace(/[+/=]/g, "").slice(0, 20) + "!A9";
}

async function findUserByEmail(targetEmail) {
  // GoTrue's admin API has no direct "get by email" — page through
  // listUsers. Fine for this scale (one-off admin/teacher seeding, not a
  // hot path).
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

const tempPassword = generatePassword();
let userId;

const existing = await findUserByEmail(email);
if (existing) {
  userId = existing.id;
  const { error } = await supabase.auth.admin.updateUserById(userId, { password: tempPassword });
  if (error) throw error;
  console.log(`User already existed — reset their password instead.`);
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true, // no email sent; account is usable immediately
  });
  if (error) throw error;
  userId = data.user.id;
  console.log(`Created new user.`);
}

const { error: profileErr } = await supabase
  .from("profiles")
  .upsert({ id: userId, role: "admin", full_name: email, email, must_change_password: true }, { onConflict: "id" });
if (profileErr) throw profileErr;

const { error: staffErr } = await supabase
  .from("staff_members")
  .upsert({ profile_id: userId, display_name: email, role_title: "Admin", bookable: false, active: true }, { onConflict: "profile_id" });
if (staffErr) throw staffErr;

console.log("");
console.log("========================================");
console.log(`Admin account ready: ${email}`);
console.log(`Temporary password: ${tempPassword}`);
console.log("They must change this password on first sign-in.");
console.log("This password is shown ONCE — it is not stored anywhere.");
console.log("Sign in at /staff using the password option.");
console.log("========================================");
