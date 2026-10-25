// Microsoft 365 / Teams integration endpoint. See _shared/teamsMeetings.ts
// for what a sync does and docs/microsoft-365-setup.md for the Azure set-up.
//
// Callers:
//   - the scheduler (.github/workflows/teams-sync.yml) with the service-role
//     key as Bearer token: POST {} -> sync meetings, then fetch attendance;
//   - the School settings page, as a signed-in head_teacher/admin:
//       { action: "status" }  test the connection, per capability
//       { action: "sync" }    sync Teams meetings (and attendance) now
//     Anyone else gets 403.
// Deployed with --no-verify-jwt (the scheduler is not a signed-in user and
// new-style secret keys are not JWTs); auth is checked here instead.
// ?dry_run=1 (service role or admin) reports what a meeting sync would do
// without calling Graph write endpoints or touching the database.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { GraphError, graphConfigured, graphFetch, graphTokenRoles } from "../_shared/graph.ts";
import { meetingOrganiserFallback, organiserIdFromJoinUrl, syncTeamsAttendance, syncTeamsMeetings, teamsAttendanceEnabled, teamsMeetingsEnabled } from "../_shared/teamsMeetings.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const serviceClient = createClient(supabaseUrl, serviceRoleKey);

/** A service-role caller: the exact key, or any key the auth admin API accepts (new-style secret keys differ from the env value). */
async function isServiceCaller(token: string): Promise<boolean> {
  if (!token) return false;
  if (token === serviceRoleKey) return true;
  if (token.split(".").length === 3) return false; // a user's JWT: checked as a user below
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1`, { headers: { apikey: token, Authorization: `Bearer ${token}` } });
    return res.ok;
  } catch {
    return false;
  }
}

async function headOrAdmin(authHeader: string): Promise<string | null> {
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await callerClient.auth.getUser();
  if (!userData?.user) return null;
  const { data: roles } = await serviceClient.from("user_roles").select("role").eq("user_id", userData.user.id);
  return (roles || []).some((r) => r.role === "head_teacher" || r.role === "admin") ? userData.user.id : null;
}

type CapState = "ok" | "missing_permission" | "not_configured" | "off" | "error" | "untested";
type Capability = { key: string; label: string; state: CapState; detail: string; optional?: boolean };

async function connectionStatus() {
  const caps: Capability[] = [];
  const sender = (Deno.env.get("MS_SENDER_EMAIL") || "").trim();
  const organiser = meetingOrganiserFallback();
  if (!graphConfigured()) {
    const detail = "Add MS_TENANT_ID, MS_CLIENT_ID and MS_CLIENT_SECRET in Supabase → Edge Functions → Secrets.";
    return {
      ok: true,
      configured: false,
      app: { tenant: false, client: Boolean(Deno.env.get("MS_CLIENT_ID")), secret: Boolean(Deno.env.get("MS_CLIENT_SECRET")) },
      capabilities: [
        { key: "sign_in", label: "Sign in to Microsoft 365", state: "not_configured", detail },
        { key: "mail", label: "Send email (Mail.Send)", state: "not_configured", detail },
        { key: "calendar", label: "Create Teams meetings (Calendars.ReadWrite)", state: "not_configured", detail },
        { key: "users", label: "Find teachers' accounts (User.Read.All)", state: "not_configured", detail, optional: true },
        { key: "attendance", label: "Teams attendance (OnlineMeetings.Read.All, OnlineMeetingArtifact.Read.All + access policy)", state: "not_configured", detail, optional: true },
      ] as Capability[],
      meetings: await meetingCounts(),
    };
  }

  let roles: string[] = [];
  try {
    roles = await graphTokenRoles();
    caps.push({ key: "sign_in", label: "Sign in to Microsoft 365", state: "ok", detail: roles.length ? `Granted application permissions: ${roles.join(", ")}` : "Signed in, but no application permissions have been granted admin consent yet." });
  } catch (e) {
    const detail = String((e as Error).message || e);
    caps.push({ key: "sign_in", label: "Sign in to Microsoft 365", state: "error", detail });
    for (const [key, label, optional] of [
      ["mail", "Send email (Mail.Send)", false],
      ["calendar", "Create Teams meetings (Calendars.ReadWrite)", false],
      ["users", "Find teachers' accounts (User.Read.All)", true],
      ["attendance", "Teams attendance (OnlineMeetings.Read.All, OnlineMeetingArtifact.Read.All + access policy)", true],
    ] as const) {
      caps.push({ key, label, state: "untested", detail: "Fix the sign-in first.", optional });
    }
    return { ok: true, configured: true, capabilities: caps, meetings: await meetingCounts() };
  }
  const has = (r: string) => roles.includes(r);

  // Mail.Send: sending a test email would be intrusive, so check the grant. With Exchange RBAC for Applications the
  // permission is not in the token, so say so rather than calling it missing.
  if (!sender) caps.push({ key: "mail", label: "Send email (Mail.Send)", state: "not_configured", detail: "Set MS_SENDER_EMAIL to the mailbox school emails are sent from." });
  else if (has("Mail.Send")) caps.push({ key: "mail", label: "Send email (Mail.Send)", state: "ok", detail: `Emails are sent from ${sender}.` });
  else
    caps.push({
      key: "mail",
      label: "Send email (Mail.Send)",
      state: "missing_permission",
      detail: `Mail.Send is not granted in Entra ID. Add it (Application) and grant admin consent. (If you scoped it with Exchange RBAC for Applications instead, and emails from ${sender} arrive, you can ignore this.)`,
    });

  // Calendars.ReadWrite: read the organiser's calendar settings (also proves the mailbox exists and allows Teams).
  const calMailbox = organiser || sender;
  let organiserObjectId: string | null = null;
  if (!calMailbox) {
    caps.push({ key: "calendar", label: "Create Teams meetings (Calendars.ReadWrite)", state: "not_configured", detail: "Set MS_MEETING_ORGANISER (a licensed mailbox that will own lesson meetings when a teacher's own can't)." });
  } else {
    try {
      const cal = await graphFetch<{ allowedOnlineMeetingProviders?: string[]; defaultOnlineMeetingProvider?: string }>(
        `/users/${encodeURIComponent(calMailbox)}/calendar?$select=allowedOnlineMeetingProviders,defaultOnlineMeetingProvider`,
        { permission: "Calendars.ReadWrite" },
      );
      if (!cal) caps.push({ key: "calendar", label: "Create Teams meetings (Calendars.ReadWrite)", state: "error", detail: `Mailbox ${calMailbox} was not found in Microsoft 365.` });
      else if (!(cal.allowedOnlineMeetingProviders || []).includes("teamsForBusiness"))
        caps.push({ key: "calendar", label: "Create Teams meetings (Calendars.ReadWrite)", state: "error", detail: `${calMailbox}'s calendar does not allow Teams meetings. Give that account a Microsoft Teams licence (Office 365 A1 for Education is free).` });
      else if (!has("Calendars.ReadWrite") && has("Calendars.Read"))
        caps.push({ key: "calendar", label: "Create Teams meetings (Calendars.ReadWrite)", state: "missing_permission", detail: "Only Calendars.Read is granted; add Calendars.ReadWrite (Application) and grant admin consent." });
      else {
        const on = teamsMeetingsEnabled();
        caps.push({
          key: "calendar",
          label: "Create Teams meetings (Calendars.ReadWrite)",
          state: on ? "ok" : "off",
          detail: on
            ? `Lessons without a class link get their own Teams meeting; the teacher organises it when their mailbox allows, otherwise ${organiser}.`
            : organiser
              ? "Permission works, but meetings are switched off (MS_TEAMS_MEETINGS=0)."
              : `Permission works on ${calMailbox}. Set MS_MEETING_ORGANISER to switch lesson meetings on.`,
        });
      }
    } catch (e) {
      const ge = e as GraphError;
      caps.push({ key: "calendar", label: "Create Teams meetings (Calendars.ReadWrite)", state: ge.status === 403 ? "missing_permission" : "error", detail: String(ge.message || e) });
    }
  }

  // User.Read.All (optional): look up the organiser mailbox.
  if (calMailbox) {
    try {
      const u = await graphFetch<{ id: string }>(`/users/${encodeURIComponent(calMailbox)}?$select=id`, { permission: "User.Read.All" });
      organiserObjectId = u?.id || null;
      caps.push({ key: "users", label: "Find teachers' accounts (User.Read.All)", state: "ok", detail: "Teachers with a school Microsoft 365 account organise their own lesson meetings.", optional: true });
    } catch (e) {
      const ge = e as GraphError;
      caps.push({
        key: "users",
        label: "Find teachers' accounts (User.Read.All)",
        state: ge.status === 403 ? "missing_permission" : "error",
        detail: ge.status === 403 ? "Optional. Without it, teachers whose portal email is on the school's domain are tried first, then the shared organiser mailbox." : String(ge.message || e),
        optional: true,
      });
    }
  }

  // Attendance: permissions in the token, then a live call against the most recent meeting (proves the access policy).
  const attLabel = "Teams attendance (OnlineMeetings.Read.All, OnlineMeetingArtifact.Read.All + access policy)";
  const missing = ["OnlineMeetings.Read.All", "OnlineMeetingArtifact.Read.All"].filter((r) => !has(r) && !(r === "OnlineMeetings.Read.All" && has("OnlineMeetings.ReadWrite.All")));
  if (missing.length) {
    caps.push({ key: "attendance", label: attLabel, state: "missing_permission", detail: `Optional. Grant ${missing.join(" and ")} (Application) with admin consent, then the Teams application access policy.`, optional: true });
  } else {
    const { data: recent } = await serviceClient
      .from("lesson_teams_meetings")
      .select("join_url, organiser_id")
      .eq("status", "active")
      .not("join_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const r = recent as { join_url: string; organiser_id: string | null } | null;
    const oid = r?.organiser_id || (r?.join_url ? organiserIdFromJoinUrl(r.join_url) : null) || organiserObjectId;
    if (!r || !oid) {
      caps.push({ key: "attendance", label: attLabel, state: "untested", detail: "Permissions are granted. The access policy is checked once the first lesson meeting exists (press Sync, then Test again).", optional: true });
    } else {
      try {
        const found = await graphFetch<{ value?: unknown[] }>(`/users/${encodeURIComponent(oid)}/onlineMeetings?$filter=${encodeURIComponent(`JoinWebUrl eq '${r.join_url}'`)}`, { permission: "OnlineMeetings.Read.All" });
        const on = teamsAttendanceEnabled();
        caps.push({
          key: "attendance",
          label: attLabel,
          state: !found?.value?.length ? "error" : on ? "ok" : "off",
          detail: !found?.value?.length
            ? "The access policy works but Teams didn't find the latest meeting; try again in a few minutes."
            : on
              ? "Teacher registers show 'Teams says joined…' hints after each lesson."
              : "Everything is in place. Set MS_TEAMS_ATTENDANCE=1 to switch attendance hints on.",
          optional: true,
        });
      } catch (e) {
        const ge = e as GraphError;
        caps.push({
          key: "attendance",
          label: attLabel,
          state: ge.status === 403 ? "missing_permission" : "error",
          detail: ge.isAccessPolicy || ge.status === 403 ? `The Teams application access policy isn't granted for this organiser yet (it can take 30 minutes to apply). ${String(ge.message)}` : String(ge.message || e),
          optional: true,
        });
      }
    }
  }

  return { ok: true, configured: true, organiser: organiser || null, sender: sender || null, capabilities: caps, meetings: await meetingCounts() };
}

async function meetingCounts() {
  const nowIso = new Date().toISOString();
  const [up, failed, last] = await Promise.all([
    serviceClient.from("lesson_teams_meetings").select("id", { count: "exact", head: true }).eq("status", "active").gt("starts_at", nowIso),
    serviceClient.from("lesson_teams_meetings").select("id", { count: "exact", head: true }).eq("status", "failed").gt("starts_at", nowIso),
    serviceClient.from("lesson_teams_meetings").select("updated_at, last_error, status").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (up.error) return { available: false };
  const lastRow = last.data as { updated_at: string } | null;
  const { data: lastFailed } = await serviceClient.from("lesson_teams_meetings").select("last_error").eq("status", "failed").gt("starts_at", nowIso).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return {
    available: true,
    upcoming: up.count || 0,
    failed: failed.count || 0,
    last_change: lastRow?.updated_at || null,
    last_error: (lastFailed as { last_error: string | null } | null)?.last_error || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isService = await isServiceCaller(token);
  const adminId = isService ? null : token ? await headOrAdmin(authHeader) : null;
  if (!isService && !adminId) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let body: { action?: string; lesson_instance_id?: string } = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  const action = body.action || "sync";
  const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";

  try {
    if (action === "status") return jsonResponse(await connectionStatus());
    if (action === "sync" || action === "meetings" || action === "attendance") {
      const meetings = action !== "attendance" ? await syncTeamsMeetings(serviceClient, { dryRun }) : null;
      const attendance = action !== "meetings" && !dryRun ? await syncTeamsAttendance(serviceClient, { lessonInstanceId: body.lesson_instance_id }) : null;
      if (adminId) {
        await serviceClient.from("audit_log").insert({ actor_id: adminId, action: "TEAMS_SYNC", target_table: "lesson_teams_meetings", target_id: null, changes: { meetings, attendance } });
      }
      return jsonResponse({ ok: true, meetings, attendance });
    }
    return jsonResponse({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    console.error("teams-sync failed:", e);
    return jsonResponse({ ok: false, error: "sync_failed", detail: String((e as Error).message || e).slice(0, 500) }, 500);
  }
});
