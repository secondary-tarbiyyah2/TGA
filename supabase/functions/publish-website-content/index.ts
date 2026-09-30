// Triggers a site rebuild after an admin saves a change in
// /learn/admin/content — the site is a static export, so a database write
// alone never appears live on its own. Previously (with Sanity) this was a
// webhook Sanity called on publish; now the admin UI calls this directly
// right after its own save succeeds, one less moving part than going
// through a third party first.
//
// Deployed WITH JWT verification (unlike the public booking functions) —
// a request with no valid session is rejected before reaching this code.
// The real "are they allowed to trigger a rebuild?" check below still runs
// under the caller's own JWT/RLS, never trusting a role the client merely
// claims.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const ghToken = Deno.env.get("GH_DISPATCH_TOKEN");
const ghRepo = Deno.env.get("GH_DISPATCH_REPO") || "secondary-tarbiyyah2/TGA";

async function requireAdmin(authHeader: string | null) {
  if (!authHeader) return false;
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await callerClient.auth.getUser();
  if (!userData?.user) return false;
  const { data: profile } = await callerClient.from("profiles").select("role").eq("id", userData.user.id).single();
  return profile?.role === "admin";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const isAdmin = await requireAdmin(req.headers.get("Authorization"));
  if (!isAdmin) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  if (!ghToken) {
    // Not configured yet -- the database write already succeeded, so this
    // is never fatal to the save itself, just means a manual "Deploy site"
    // run (or the next unrelated push) is needed to pick it up.
    return jsonResponse({ ok: false, error: "not_configured" }, 200);
  }

  const res = await fetch(`https://api.github.com/repos/${ghRepo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event_type: "website-content-published" }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return jsonResponse({ ok: false, error: "dispatch_failed", detail: detail.slice(0, 300) }, 200);
  }

  return jsonResponse({ ok: true });
});
