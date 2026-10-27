// Admin-only staff management: invite a new staff/admin account, change a
// role, or (de)activate one. Deployed WITH JWT verification on (unlike the
// public booking functions), so a request with no valid Supabase session is
// rejected before it even reaches this code. That only proves "some
// logged-in user called this" though, the actual "are they an admin?"
// check below is what matters, using the caller's own JWT so it runs under
// their RLS (an admin can read any profile; anyone else can only read their
// own), never trusting a role the client merely claims to have.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const serviceClient = createClient(supabaseUrl, serviceRoleKey);

function generatePassword(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 20) + "!A9";
}

async function findUserByEmail(email: string) {
  let page = 1;
  for (;;) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function requireAdmin(authHeader: string | null) {
  if (!authHeader) return null;
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await callerClient.auth.getUser();
  if (!userData?.user) return null;
  const { data: profile } = await callerClient.from("profiles").select("id, role").eq("id", userData.user.id).single();
  if (profile?.role !== "admin") return null;
  return userData.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const admin = await requireAdmin(req.headers.get("Authorization"));
  if (!admin) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const action = String(body.action || "");

  if (action === "invite") {
    const email = String(body.email || "").trim().toLowerCase();
    const displayName = String(body.displayName || "").trim();
    const roleTitle = String(body.roleTitle || "").trim();
    const role = body.role === "admin" ? "admin" : body.role === "teacher" ? "teacher" : "staff";
    if (!email || !displayName || !roleTitle) return jsonResponse({ ok: false, error: "missing_fields" }, 400);

    // Creates the account directly with a temporary password rather than
    // GoTrue's inviteUserByEmail, that both creates the user AND requires
    // sending an email in one call, so it fails outright (as it did in
    // production) whenever email delivery isn't working. Email is instead
    // attempted afterwards, separately, and never blocks the account from
    // being created: the admin always gets the password back to hand over
    // however they can (copy it here, message it, etc).
    const tempPassword = generatePassword();
    let userId: string;
    let wasExisting = false;

    const existing = await findUserByEmail(email);
    if (existing) {
      wasExisting = true;
      userId = existing.id;
      const { error: resetErr } = await serviceClient.auth.admin.updateUserById(userId, { password: tempPassword });
      if (resetErr) return jsonResponse({ ok: false, error: "password_reset_failed", detail: resetErr.message }, 500);
    } else {
      const { data: created, error: createErr } = await serviceClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });
      if (createErr || !created?.user) {
        return jsonResponse({ ok: false, error: "create_failed", detail: createErr?.message }, 500);
      }
      userId = created.user.id;
    }

    const { error: profileErr } = await serviceClient
      .from("profiles")
      .upsert({ id: userId, role, full_name: displayName, email, must_change_password: true }, { onConflict: "id" });
    if (profileErr) return jsonResponse({ ok: false, error: "profile_create_failed", detail: profileErr.message }, 500);

    const { error: staffErr } = await serviceClient
      .from("staff_members")
      .upsert({ profile_id: userId, display_name: displayName, role_title: roleTitle, bookable: false, active: true }, { onConflict: "profile_id" });
    if (staffErr) return jsonResponse({ ok: false, error: "staff_create_failed", detail: staffErr.message }, 500);

    const siteUrl = Deno.env.get("SITE_URL") || "https://globalacademy.tarbiyyah.co.uk";
    const loginUrl = `${siteUrl}/staff`;
    let emailSent = false;
    try {
      const result = await sendEmail({
        to: email,
        toName: displayName,
        subject: wasExisting ? "Your Tarbiyyah Global Academy account password was reset" : "Your Tarbiyyah Global Academy staff account",
        html: emailShell(`
          <p>${wasExisting ? "Your account password has been reset." : "An account has been created for you."}</p>
          <p>Sign in at <a href="${loginUrl}">${loginUrl}</a> using the password option, with:</p>
          <p><strong>Email:</strong> ${email}<br/><strong>Temporary password:</strong> ${tempPassword}</p>
          <p>You'll be asked to set a new password on first sign-in.</p>
        `),
      });
      emailSent = result.ok;
    } catch {
      emailSent = false;
    }

    return jsonResponse({ ok: true, profileId: userId, tempPassword, loginUrl, emailSent });
  }

  if (action === "set_role") {
    const profileId = String(body.profileId || "");
    const role = body.role === "admin" ? "admin" : body.role === "teacher" ? "teacher" : "staff";
    if (!profileId) return jsonResponse({ ok: false, error: "missing_profile_id" }, 400);

    const { error } = await serviceClient.from("profiles").update({ role }).eq("id", profileId);
    if (error) return jsonResponse({ ok: false, error: "update_failed", detail: error.message }, 500);
    return jsonResponse({ ok: true });
  }

  if (action === "set_active") {
    const profileId = String(body.profileId || "");
    const active = Boolean(body.active);
    if (!profileId) return jsonResponse({ ok: false, error: "missing_profile_id" }, 400);

    const { error } = await serviceClient.from("staff_members").update({ active }).eq("profile_id", profileId);
    if (error) return jsonResponse({ ok: false, error: "update_failed", detail: error.message }, 500);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: false, error: "unknown_action" }, 400);
});
