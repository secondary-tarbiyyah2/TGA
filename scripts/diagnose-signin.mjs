// One-off diagnostic: reproduces a password sign-in attempt exactly as the
// browser client would (using the anon key, not service role), and
// separately inspects the account's actual state via the service-role
// admin API — so a failed sign-in can be diagnosed from the real error
// instead of the UI's generic "Incorrect email or password" message.
//
// Usage: node scripts/diagnose-signin.mjs <email> <password>
// Requires SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const [email, password] = process.argv.slice(2);

if (!url || !anonKey || !serviceRoleKey || !email || !password) {
  console.error("Usage: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/diagnose-signin.mjs <email> <password>");
  process.exit(1);
}

const serviceClient = createClient(url, serviceRoleKey);
const anonClient = createClient(url, anonKey);

console.log("=== Account state (via service role) ===");
let page = 1;
let found = null;
for (;;) {
  const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error("listUsers error:", error.message); break; }
  found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (found || data.users.length < 200) break;
  page += 1;
}
if (!found) {
  console.log(`No user found with email ${email}`);
} else {
  console.log({
    id: found.id,
    email: found.email,
    email_confirmed_at: found.email_confirmed_at,
    confirmed_at: found.confirmed_at,
    banned_until: found.banned_until,
    created_at: found.created_at,
    last_sign_in_at: found.last_sign_in_at,
    app_metadata: found.app_metadata,
    identities: found.identities?.map((i) => ({ provider: i.provider, id: i.id })),
  });
}

console.log("");
console.log("=== Sign-in attempt (via anon key, exactly as the browser does) ===");
const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({ email, password });
if (signInError) {
  console.log("FAILED:", { name: signInError.name, status: signInError.status, code: signInError.code, message: signInError.message });
} else {
  console.log("SUCCESS:", { userId: signInData.user?.id, hasSession: !!signInData.session });
}
