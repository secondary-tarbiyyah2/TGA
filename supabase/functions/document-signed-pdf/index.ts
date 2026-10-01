// Returns a short-lived URL to the SIGNED PDF for a signature: the original
// document with a footer stamp on every page and a final signature page
// (plus the scanned paper page for hand-recorded signatures). Generated on
// demand and cached in the private `signed-documents` bucket.
//
// Deployed WITH JWT verification. Callers: the signer, or a Headteacher/Admin.
//
// POST { signature_id, regenerate?: boolean (staff only) }
//  -> { ok: true, url, path, generated }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { ensureSignedPdf, loadSignature, SIGNED_BUCKET } from "../_shared/signedPdf.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(supabaseUrl, serviceRoleKey);
const URL_TTL_SECONDS = 600;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await caller.auth.getUser();
  const me = userData?.user;
  if (!me) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let signatureId = "";
  let regenerate = false;
  try {
    const body = await req.json();
    signatureId = String(body.signature_id || "");
    regenerate = body.regenerate === true;
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(signatureId)) return jsonResponse({ ok: false, error: "missing_signature_id" }, 400);

  const sig = await loadSignature(service, signatureId);
  if (!sig) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  const { data: roleRows } = await service.from("user_roles").select("role").eq("user_id", me.id).in("role", ["head_teacher", "admin"]);
  const isStaff = (roleRows || []).length > 0;
  if (sig.signer_id !== me.id && !isStaff) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  try {
    const r = await ensureSignedPdf(service, sig, { force: regenerate && isStaff });
    const { data: signed, error } = await service.storage.from(SIGNED_BUCKET).createSignedUrl(r.path, URL_TTL_SECONDS);
    if (error || !signed) return jsonResponse({ ok: false, error: "url_failed" }, 500);
    return jsonResponse({ ok: true, url: signed.signedUrl, path: r.path, generated: r.generated });
  } catch (e) {
    console.error("document-signed-pdf failed", (e as Error).message);
    return jsonResponse({ ok: false, error: "generation_failed", detail: (e as Error).message.slice(0, 200) }, 500);
  }
});
