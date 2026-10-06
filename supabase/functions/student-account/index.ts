// Student username logins (migration 0082).
//   { action: "create", childId }  Headteacher/Admin: give a child a username +
//                                  generated password login (no email needed).
//   { action: "reset",  childId }  Headteacher/Admin, or the child's own
//                                  parent: set a new generated password.
// Either way the credentials go to the PARENT by email at once, and are also
// returned in this response so the person who clicked can show them ONCE on
// screen (nothing stores or logs the password). Deployed WITH JWT verification;
// the caller's authority is re-checked here, never trusted from the body.
// See _shared/studentAccount.ts for the security trade-offs.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/resend.ts";
import { createStudentLogin, credentialsEmail, resetStudentPassword } from "../_shared/studentAccount.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const learnSiteUrl = Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk";
const serviceClient = createClient(supabaseUrl, serviceRoleKey);

async function caller(authHeader: string | null): Promise<{ id: string; isStaff: boolean } | null> {
  if (!authHeader) return null;
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await callerClient.auth.getUser();
  if (!userData?.user) return null;
  const { data: roleRows } = await callerClient.from("user_roles").select("role").eq("user_id", userData.user.id);
  const roles = (roleRows || []).map((r: { role: string }) => r.role);
  return { id: userData.user.id, isStaff: roles.includes("head_teacher") || roles.includes("admin") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const who = await caller(req.headers.get("Authorization"));
  if (!who) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  const action = String(body.action || "");
  const childId = String(body.childId || "");
  if ((action !== "create" && action !== "reset") || !/^[0-9a-f-]{36}$/i.test(childId)) {
    return jsonResponse({ ok: false, error: "missing_or_invalid_fields" }, 400);
  }

  const { data: child } = await serviceClient.from("children").select("id, name, parent_user_id").eq("id", childId).maybeSingle();
  if (!child) return jsonResponse({ ok: false, error: "child_not_found" }, 404);

  const isOwnParent = child.parent_user_id === who.id;
  if (action === "create" && !who.isStaff) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  if (action === "reset" && !who.isStaff && !isOwnParent) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  const { data: parent } = await serviceClient.from("profiles").select("full_name, email").eq("id", child.parent_user_id).maybeSingle();

  let username = "";
  let password = "";
  let reason: "new" | "reset" = "new";
  if (action === "create") {
    const r = await createStudentLogin(serviceClient, { childId, fullName: String(child.name), grantedBy: who.id });
    if (!r.ok) return jsonResponse({ ok: false, error: r.error, detail: r.detail }, r.error === "already_has_email_login" ? 409 : 500);
    if (r.existing) return jsonResponse({ ok: false, error: "login_exists", username: r.username }, 409);
    username = r.username;
    password = r.password;
  } else {
    const r = await resetStudentPassword(serviceClient, { childId, by: who.id });
    if (!r.ok) return jsonResponse({ ok: false, error: r.error, detail: r.detail }, r.error === "no_username_login" ? 409 : 500);
    username = r.username;
    password = r.password;
    reason = "reset";
  }

  let emailSent = false;
  let emailError: string | undefined;
  const parentEmail = parent?.email ? String(parent.email) : "";
  if (parentEmail) {
    const parentName = parent?.full_name ? String(parent.full_name) : "";
    const mail = credentialsEmail({
      parentFirstName: parentName.split(/\s+/)[0] || "there",
      childName: String(child.name),
      learnSiteUrl,
      student: { username, password, reason },
    });
    try {
      const sent = await sendEmail({ to: parentEmail, toName: parentName || undefined, subject: mail.subject, html: mail.html });
      emailSent = sent.ok;
      if (!sent.ok) emailError = sent.detail;
    } catch (e) {
      emailError = String(e);
    }
  } else {
    emailError = "The parent has no email address on file.";
  }

  // The password is returned ONCE to whoever asked (staff or the parent). It is never stored or logged.
  return jsonResponse({ ok: true, username, password, emailSent, emailError, parentEmail: parentEmail || undefined });
});
