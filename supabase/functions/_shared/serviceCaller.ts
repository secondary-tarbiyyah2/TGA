// Shared check for scheduled (cron) Edge Functions that are deployed with
// --no-verify-jwt: only a caller holding the project's service-role (or new
// "secret") key may run them. Same test noshow-alerts, open-evening-reminders
// and weekly-digest already use; moved here in the security audit (T20) so the
// other scheduled functions can no longer be triggered by anyone on the web.
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** True for the exact service-role key, or any key the auth admin API accepts (new-style secret keys differ from the env value). */
export async function isServiceCaller(token: string): Promise<boolean> {
  if (!token) return false;
  if (token === serviceRoleKey) return true;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1`, { headers: { apikey: token, Authorization: `Bearer ${token}` } });
    return res.ok;
  } catch {
    return false;
  }
}

/** Reads the bearer token from a request and checks it. */
export function isServiceRequest(req: Request): Promise<boolean> {
  return isServiceCaller((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim());
}
