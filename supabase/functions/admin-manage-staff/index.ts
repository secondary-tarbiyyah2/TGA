// Staff management for the legacy /staff booking panel: invite a new
// staff/admin account, change a legacy role, or (de)activate one. Deployed
// WITH JWT verification, so a request with no valid session never reaches
// this code; the role check below is what actually matters.
//
// The caller must hold Headteacher or Admin in user_roles (their own rows,
// under their own RLS). The old check read the legacy profiles.role column,
// which learn-invite sets to 'admin' for Admissions staff too, so an
// Admissions clerk could reset the Headteacher's password through this
// function and read it back from the response. That is why:
//   - an invite for an email that already has an account is refused
//     (nothing here ever resets an existing password; re-invites go through
//     learn-invite, which sends a one-time link rather than a password);
//   - set_role / set_active on an account holding Headteacher or Admin
//     needs the caller to be the Headteacher.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";
import { escapeHtml, findUserByEmail, mayActOn, requireRoles, rolesOf } from "../_shared/auth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const serviceClient = createClient(supabaseUrl, serviceRoleKey);

/** 20 random base64 characters plus a fixed suffix that satisfies complexity rules. */
function generatePassword(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 20) + "!A9";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const admin = await requireRoles(req.headers.get("Authorization"), ["head_teacher", "admin"]);
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
    if (role === "admin" && !admin.roles.includes("head_teacher")) {
      return jsonResponse({ ok: false, error: "head_teacher_required" }, 403);
    }

    const existing = await findUserByEmail(serviceClient, email);
    if (existing) {
      // Never reset an existing account's password from here. Re-invites and
      // resets go through learn-invite (one-time link + code to the holder).
      return jsonResponse({ ok: false, error: "already_exists" }, 409);
    }

    const tempPassword = generatePassword();
    const { data: created, error: createErr } = await serviceClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      console.error("admin-manage-staff createUser:", createErr?.message);
      return jsonResponse({ ok: false, error: "create_failed" }, 500);
    }
    const userId = created.user.id;

    const { error: profileErr } = await serviceClient
      .from("profiles")
      .upsert({ id: userId, role, full_name: displayName, email, must_change_password: true }, { onConflict: "id" });
    if (profileErr) {
      console.error("admin-manage-staff profile upsert:", profileErr.message);
      return jsonResponse({ ok: false, error: "profile_create_failed" }, 500);
    }

    const { error: staffErr } = await serviceClient
      .from("staff_members")
      .upsert({ profile_id: userId, display_name: displayName, role_title: roleTitle, bookable: false, active: true }, { onConflict: "profile_id" });
    if (staffErr) {
      console.error("admin-manage-staff staff upsert:", staffErr.message);
      return jsonResponse({ ok: false, error: "staff_create_failed" }, 500);
    }

    const siteUrl = Deno.env.get("SITE_URL") || "https://globalacademy.tarbiyyah.co.uk";
    const loginUrl = `${siteUrl}/staff`;
    let emailSent = false;
    try {
      const result = await sendEmail({
        to: email,
        toName: displayName,
        subject: "Your Tarbiyyah Global Academy staff account",
        html: emailShell(`
          <p>An account has been created for you.</p>
          <p>Sign in at <a href="${loginUrl}">${loginUrl}</a> using the password option, with:</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}<br/><strong>Temporary password:</strong> ${escapeHtml(tempPassword)}</p>
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
    if (!mayActOn(admin.roles, await rolesOf(serviceClient, profileId))) return jsonResponse({ ok: false, error: "head_teacher_required" }, 403);
    if (role === "admin" && !admin.roles.includes("head_teacher")) return jsonResponse({ ok: false, error: "head_teacher_required" }, 403);

    const { error } = await serviceClient.from("profiles").update({ role }).eq("id", profileId);
    if (error) {
      console.error("admin-manage-staff set_role:", error.message);
      return jsonResponse({ ok: false, error: "update_failed" }, 500);
    }
    return jsonResponse({ ok: true });
  }

  if (action === "set_active") {
    const profileId = String(body.profileId || "");
    const active = Boolean(body.active);
    if (!profileId) return jsonResponse({ ok: false, error: "missing_profile_id" }, 400);
    if (!mayActOn(admin.roles, await rolesOf(serviceClient, profileId))) return jsonResponse({ ok: false, error: "head_teacher_required" }, 403);

    const { error } = await serviceClient.from("staff_members").update({ active }).eq("profile_id", profileId);
    if (error) {
      console.error("admin-manage-staff set_active:", error.message);
      return jsonResponse({ ok: false, error: "update_failed" }, 500);
    }
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: false, error: "unknown_action" }, 400);
});
