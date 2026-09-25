// Admin-only staff management: invite a new staff/admin account, change a
// role, or (de)activate one. Deployed WITH JWT verification on (unlike the
// public booking functions), so a request with no valid Supabase session is
// rejected before it even reaches this code. That only proves "some
// logged-in user called this" though — the actual "are they an admin?"
// check below is what matters, using the caller's own JWT so it runs under
// their RLS (an admin can read any profile; anyone else can only read their
// own), never trusting a role the client merely claims to have.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const serviceClient = createClient(supabaseUrl, serviceRoleKey);

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
    const role = body.role === "admin" ? "admin" : "staff";
    if (!email || !displayName || !roleTitle) return jsonResponse({ ok: false, error: "missing_fields" }, 400);

    const { data: invited, error: inviteErr } = await serviceClient.auth.admin.inviteUserByEmail(email);
    if (inviteErr || !invited?.user) {
      return jsonResponse({ ok: false, error: "invite_failed", detail: inviteErr?.message }, 500);
    }

    const { error: profileErr } = await serviceClient
      .from("profiles")
      .upsert({ id: invited.user.id, role, full_name: displayName, email }, { onConflict: "id" });
    if (profileErr) return jsonResponse({ ok: false, error: "profile_create_failed", detail: profileErr.message }, 500);

    const { error: staffErr } = await serviceClient
      .from("staff_members")
      .upsert({ profile_id: invited.user.id, display_name: displayName, role_title: roleTitle, bookable: false, active: true }, { onConflict: "profile_id" });
    if (staffErr) return jsonResponse({ ok: false, error: "staff_create_failed", detail: staffErr.message }, 500);

    return jsonResponse({ ok: true, profileId: invited.user.id });
  }

  if (action === "set_role") {
    const profileId = String(body.profileId || "");
    const role = body.role === "admin" ? "admin" : "staff";
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
