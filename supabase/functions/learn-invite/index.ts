// Creates or re-invites a /learn account: generates a one-time setup link
// (never a password — nothing here ever displays, logs, or emails a
// credential) and grants the requested primary role plus any add-on
// permissions. Deployed WITH JWT verification: only a caller who already
// holds Headteacher or Admin (per THEIR OWN user_roles rows, re-checked
// here server-side, never trusted from the request body) can call this at
// all, and granting Headteacher, Admin, or the Safeguarding Lead add-on
// requires the caller to specifically be Headteacher.
//
// The full staff-creation form (capability preview, recruitment gate,
// subjects/year-groups/classes UI) is Phase 2 — this function is the
// server-side plumbing Phase 2's UI calls into, plus what the Phase 1
// bootstrap script (scripts/invite-first-head-teacher.mjs) uses directly
// via the service-role key to create the very first Headteacher account
// (that script doesn't go through this HTTP function at all, since there's
// no existing Headteacher yet to authorize the call — see that script's
// own comments).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendEmail, emailShell } from "../_shared/resend.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// /learn lives on its own subdomain (see SETUP.md, "Moving /learn to its own
// subdomain") — LEARN_SITE_URL, not SITE_URL (the main marketing domain), is
// where the setup link must land.
const learnSiteUrl = Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk";

const serviceClient = createClient(supabaseUrl, serviceRoleKey);

const ROLES = ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover", "parent", "student"] as const;
type Role = (typeof ROLES)[number];
const ADD_ON_PERMISSIONS = ["timetabler", "safeguarding_lead", "can_export_data", "assessment_lead"] as const;
type AddOn = (typeof ADD_ON_PERMISSIONS)[number];

const SENSITIVE_ROLES: Role[] = ["head_teacher", "admin"];
const SENSITIVE_ADD_ONS: AddOn[] = ["safeguarding_lead"];

// Kept local rather than shared with the frontend's role-label helper
// (src/lib/learn/session.ts) — Edge Functions run on Deno with their own
// module resolution, and this is only ever used for the email subject/body
// below, not anywhere roles are actually enforced.
const ROLE_LABEL: Record<Role, string> = {
  head_teacher: "Headteacher",
  admin: "Admin",
  admissions: "Admissions",
  teacher: "Teacher",
  teaching_assistant_cover: "Teaching Assistant/Cover",
  parent: "Parent",
  student: "Student",
};

// Coarse mapping onto the legacy profiles.role vocabulary (0001/0005),
// which the pre-existing booking admin panel still reads — kept working
// rather than left null (profiles.role is NOT NULL), not otherwise used by
// anything under /learn.
function legacyProfileRole(role: Role): string {
  if (role === "head_teacher" || role === "admin" || role === "admissions") return "admin";
  if (role === "teacher" || role === "teaching_assistant_cover") return "teacher";
  return role; // 'parent' | 'student'
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

async function requireInviter(authHeader: string | null) {
  if (!authHeader) return null;
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await callerClient.auth.getUser();
  if (!userData?.user) return null;
  // Read the caller's OWN roles under their OWN RLS — never trusts a role
  // claimed in the request body.
  const { data: roleRows } = await callerClient.from("user_roles").select("role").eq("user_id", userData.user.id);
  const roles = (roleRows || []).map((r) => r.role as Role);
  if (!roles.includes("head_teacher") && !roles.includes("admin")) return null;
  return { user: userData.user, roles };
}

async function safeSend(opts: Parameters<typeof sendEmail>[0]) {
  try {
    return await sendEmail(opts);
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const inviter = await requireInviter(req.headers.get("Authorization"));
  if (!inviter) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const email = String(body.email || "").trim().toLowerCase();
  const fullName = String(body.fullName || "").trim();
  const role = String(body.role || "") as Role;
  const addOns = Array.isArray(body.addOnPermissions) ? (body.addOnPermissions as string[]).filter((p): p is AddOn => (ADD_ON_PERMISSIONS as readonly string[]).includes(p)) : [];
  const scopeType = body.scopeType === "class" || body.scopeType === "family" ? (body.scopeType as "class" | "family") : "none";
  const scopeId = scopeType !== "none" ? String(body.scopeId || "") : null;

  if (!email || !fullName || !ROLES.includes(role)) return jsonResponse({ ok: false, error: "missing_or_invalid_fields" }, 400);
  if (scopeType !== "none" && !scopeId) return jsonResponse({ ok: false, error: "missing_scope_id" }, 400);

  const needsHeadTeacher = SENSITIVE_ROLES.includes(role) || addOns.some((p) => SENSITIVE_ADD_ONS.includes(p));
  if (needsHeadTeacher && !inviter.roles.includes("head_teacher")) {
    return jsonResponse({ ok: false, error: "head_teacher_required" }, 403);
  }

  let userId: string;
  let isNewUser = false;
  const existing = await findUserByEmail(email);
  if (existing) {
    userId = existing.id;
  } else {
    isNewUser = true;
    // No password set at all — Supabase creates the account in an
    // unusable state until the invite link below is used to set one.
    const { data: created, error: createErr } = await serviceClient.auth.admin.createUser({ email, email_confirm: true });
    if (createErr || !created?.user) return jsonResponse({ ok: false, error: "create_failed", detail: createErr?.message }, 500);
    userId = created.user.id;
  }

  const { error: profileErr } = await serviceClient
    .from("profiles")
    .upsert({ id: userId, role: legacyProfileRole(role), full_name: fullName, email }, { onConflict: "id" });
  if (profileErr) return jsonResponse({ ok: false, error: "profile_failed", detail: profileErr.message }, 500);

  const { error: roleErr } = await serviceClient
    .from("user_roles")
    .upsert(
      { user_id: userId, role, scope_type: scopeType, scope_id: scopeId, granted_by: inviter.user.id },
      { onConflict: "user_id,role,scope_type,scope_id" },
    );
  if (roleErr) return jsonResponse({ ok: false, error: "role_grant_failed", detail: roleErr.message }, 500);

  for (const permission of addOns) {
    const { error: permErr } = await serviceClient
      .from("user_permissions")
      .upsert({ user_id: userId, permission, granted_by: inviter.user.id }, { onConflict: "user_id,permission" });
    if (permErr) return jsonResponse({ ok: false, error: "permission_grant_failed", detail: permErr.message }, 500);
  }

  // type 'invite' only works for a brand-new user; an existing user (e.g.
  // re-inviting after it expired, or adding a second role to someone who
  // already has an account) gets a 'recovery' link instead, which lets them
  // (re)set their password the same way without erroring on "already
  // registered". Either way: a link, never a password.
  // createUser (above) already creates the auth user, so an 'invite' link
  // would always fail with "already registered". A 'recovery' link works for
  // any existing user (brand new included) and lets them set a password.
  const { data: linkData, error: linkErr } = await serviceClient.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${learnSiteUrl}/login/invite` },
  });
  if (linkErr || !linkData) return jsonResponse({ ok: false, error: "link_generation_failed", detail: linkErr?.message }, 500);

  // Hand out a link on our own domain (never the backend's verify URL): the
  // invite page redeems the token in the browser.
  const hashed = linkData.properties.hashed_token;
  const setupLink = hashed
    ? `${learnSiteUrl}/login/invite?token_hash=${encodeURIComponent(hashed)}&type=recovery`
    : linkData.properties.action_link;

  // Actually email the setup link rather than only handing it back for the
  // inviting admin to copy and send themselves by hand — reported as "we
  // need something better, like an email sent for them to make [an]
  // account". Failure here is never fatal to the invite itself (the
  // account/role are already created either way) — the admin still gets
  // setupLink back in the response as a fallback they can copy manually if
  // Resend is down or misconfigured; emailSent tells the frontend which
  // happened so it never claims an email went out that didn't.
  const firstName = fullName.split(/\s+/)[0] || fullName;
  const emailResult = await safeSend({
    to: email,
    toName: fullName,
    subject: isNewUser ? "Set up your Tarbiyyah Global Academy Learn account" : "Reset your Tarbiyyah Global Academy Learn password",
    html: emailShell(`
      <p style="margin:0 0 16px;">Assalamu alaikum ${firstName},</p>
      <p style="margin:0 0 16px;">
        ${isNewUser ? "An account has been created for you" : "A password reset has been requested for your account"}
        on the Tarbiyyah Global Academy Learn portal, as <strong>${ROLE_LABEL[role]}</strong>.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${setupLink}" style="display:inline-block;background:#B08E45;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
          ${isNewUser ? "Set up your account" : "Reset your password"}
        </a>
      </p>
      <p style="margin:0;font-size:13px;color:#777;">This link is for you alone and expires after a short time. If you didn't expect this email, you can ignore it.</p>
    `),
  });

  return jsonResponse({
    ok: true,
    profileId: userId,
    isNewUser,
    setupLink,
    emailSent: emailResult.ok,
    emailError: emailResult.ok ? undefined : emailResult.detail,
  });
});
