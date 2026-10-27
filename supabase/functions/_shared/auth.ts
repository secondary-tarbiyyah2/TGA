// Caller identity and role checks shared by the Edge Functions that act on
// other people's accounts. The caller's roles are read under THEIR OWN RLS
// (anon client carrying their JWT) and from user_roles only, never from the
// legacy profiles.role column, which learn-invite also sets to 'admin' for
// Admissions staff and so cannot tell a Headteacher from an admissions clerk.
import { createClient, type SupabaseClient, type User } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

export type CallerInfo = { user: User; roles: string[]; client: SupabaseClient };

/** The signed-in caller and their user_roles, or null when not signed in. */
export async function getCaller(authHeader: string | null): Promise<CallerInfo | null> {
  if (!authHeader) return null;
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data } = await client.auth.getUser();
  if (!data?.user) return null;
  const { data: rows } = await client.from("user_roles").select("role").eq("user_id", data.user.id);
  return { user: data.user, roles: (rows || []).map((r) => String(r.role)), client };
}

/** The caller only if they hold at least one of `allowed`. */
export async function requireRoles(authHeader: string | null, allowed: readonly string[]): Promise<CallerInfo | null> {
  const caller = await getCaller(authHeader);
  if (!caller) return null;
  return caller.roles.some((r) => allowed.includes(r)) ? caller : null;
}

/** Roles whose accounts only a Headteacher may touch (reset, re-role, re-invite). */
export const PROTECTED_ROLES = ["head_teacher", "admin"] as const;

/** Every role a target user currently holds (service client, so RLS does not hide it). */
export async function rolesOf(svc: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await svc.from("user_roles").select("role").eq("user_id", userId);
  return (data || []).map((r) => String(r.role));
}

/**
 * True when `callerRoles` may act on an account holding `targetRoles`: a
 * Headteacher may act on anyone; anyone else may not act on a Headteacher
 * or Admin account.
 */
export function mayActOn(callerRoles: string[], targetRoles: string[]): boolean {
  if (callerRoles.includes("head_teacher")) return true;
  return !targetRoles.some((r) => (PROTECTED_ROLES as readonly string[]).includes(r));
}

/**
 * Looks a user up by email through the Admin API. Bounded: a school of this
 * size never needs more than a few pages, and an unbounded loop against a
 * misbehaving API would never return.
 */
export async function findUserByEmail(svc: SupabaseClient, email: string, maxPages = 25): Promise<User | null> {
  const wanted = email.trim().toLowerCase();
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === wanted);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** HTML-escapes user-supplied text before it goes into an email body. */
export function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * True when the bearer token is the service-role key (or any key the Auth
 * admin API accepts, since newer projects issue "secret" keys that differ
 * from the SUPABASE_SERVICE_ROLE_KEY env value). Used by the scheduled
 * functions, which must only ever run for the scheduler.
 */
export async function isServiceCaller(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/admin/users?per_page=1`, {
      headers: { apikey: token, Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
