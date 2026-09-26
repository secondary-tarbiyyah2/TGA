// Creates or re-invites a /learn account: generates a one-time setup link
// (never a password — nothing here ever displays, logs, or emails a
// credential) and grants the requested primary role plus any add-on
// permissions. Deployed WITH JWT verification: only a caller who already
// holds Head Teacher or Admin (per THEIR OWN user_roles rows, re-checked
// here server-side, never trusted from the request body) can call this at
// all, and granting Head Teacher, Admin, or the Safeguarding Lead add-on
// requires the caller to specifically be Head Teacher.
//
// The full staff-creation form (capability preview, recruitment gate,
// subjects/year-groups/classes UI) is Phase 2 — this function is the
// server-side plumbing Phase 2's UI calls into, plus what the Phase 1
// bootstrap script (scripts/invite-first-head-teacher.mjs) uses directly
// via the service-role key to create the very first Head Teacher account
// (that script doesn't go through this HTTP function at all, since there's
// no existing Head Teacher yet to authorize the call — see that script's
// own comments).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// /learn lives on its own subdomain (see SETUP.md, "Moving /learn to its own
// subdomain") — LEARN_SITE_URL, not SITE_URL (the main marketing domain), is
// where the setup link must land.
const learnSiteUrl = Deno.env.get("LEARN_SITE_URL") || "https://learn.globalacademy.tarbiyyah.co.uk";

const serviceClient = createClient(supabaseUrl, serviceRoleKey);

const ROLES = ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover", "parent", "student"] as const;
type Role = (typeof ROLES)[number];
const ADD_ON_PERMISSIONS = ["timetabler", "safeguarding_lead", "can_export_data", "assessment_lead"] as const;
type AddOn = (typeof ADD_ON_PERMISSIONS)[number];

const SENSITIVE_ROLES: Role[] = ["head_teacher", "admin"];
const SENSITIVE_ADD_ONS: AddOn[] = ["safeguarding_lead"];

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
  const { data: linkData, error: linkErr } = await serviceClient.auth.admin.generateLink({
    type: isNewUser ? "invite" : "recovery",
    email,
    options: { redirectTo: `${learnSiteUrl}/login/invite` },
  });
  if (linkErr || !linkData) return jsonResponse({ ok: false, error: "link_generation_failed", detail: linkErr?.message }, 500);

  return jsonResponse({
    ok: true,
    profileId: userId,
    isNewUser,
    setupLink: linkData.properties.action_link,
  });
});
