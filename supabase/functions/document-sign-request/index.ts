// Headteacher/Admin asks people to sign a document (or reminds them).
// Deployed WITH JWT verification. The caller's role is re-checked here from
// user_roles; the client never gets to claim it.
//
// POST { document_id, user_ids?: string[], kind?: "request" | "reminder", force?: boolean }
//   - user_ids omitted -> everyone who still has to sign the current version.
//   - a person emailed for the same document in the last 6 hours is skipped
//     (unless force) so a double-click can't spam them.
// Every attempt is logged in signature_requests (sent_at, email_sent,
// email_detail). A failed email (e.g. Resend domain not verified yet) is
// logged and reported but is NOT an error: people can still sign in the
// portal, and the request row shows email_sent = false.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LEARN_SITE_URL = (Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk").replace(/\/$/, "");
const service = createClient(supabaseUrl, serviceRoleKey);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await caller.auth.getUser();
  const me = userData?.user;
  if (!me) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const { data: roleRows } = await service.from("user_roles").select("role").eq("user_id", me.id).in("role", ["head_teacher", "admin"]);
  if (!roleRows || roleRows.length === 0) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let body: { document_id?: string; user_ids?: string[]; kind?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  if (!body.document_id) return jsonResponse({ ok: false, error: "missing_document_id" }, 400);
  const kind = body.kind === "reminder" ? "reminder" : "request";

  const { data: doc } = await service.from("signable_documents").select("id, title, requires_signature").eq("id", body.document_id).maybeSingle();
  if (!doc || !doc.requires_signature) return jsonResponse({ ok: false, error: "document_not_signable" }, 404);

  // Outstanding signers for this document, via the view (runs as the admin
  // caller, so its own permission check applies and duplicates are removed).
  let q = caller.from("outstanding_signatures").select("user_id, full_name, email").eq("document_id", doc.id);
  if (Array.isArray(body.user_ids) && body.user_ids.length > 0) q = q.in("user_id", body.user_ids);
  const { data: people, error: viewErr } = await q;
  if (viewErr) return jsonResponse({ ok: false, error: "query_failed", detail: viewErr.message }, 500);

  const recent = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: recentRows } = await service.from("signature_requests").select("user_id").eq("document_id", doc.id).eq("email_sent", true).gte("requested_at", recent);
  const recentlyEmailed = new Set((recentRows || []).map((r) => r.user_id as string));

  const link = `${LEARN_SITE_URL}/documents/?sign=${doc.id}`;
  let sent = 0, failed = 0, skipped = 0;
  const seen = new Set<string>();
  for (const p of (people || []) as { user_id: string; full_name: string | null; email: string | null }[]) {
    if (seen.has(p.user_id)) continue;
    seen.add(p.user_id);
    if (!body.force && recentlyEmailed.has(p.user_id)) { skipped++; continue; }

    let ok = false;
    let detail = "no email address on file";
    if (p.email) {
      try {
        const html = emailShell(`
          <h2 style="margin:0 0 12px;font-size:18px;">${kind === "reminder" ? "Reminder: " : ""}Please sign &ldquo;${esc(doc.title)}&rdquo;</h2>
          <p style="margin:0 0 12px;">Dear ${esc(p.full_name || "colleague")},</p>
          <p style="margin:0 0 20px;">${kind === "reminder" ? "This is a friendly reminder that we are still waiting for your signature on" : "We need your signature on"} <strong>${esc(doc.title)}</strong>. Log in to the Tarbiyyah Learn portal, read the document and sign it with your full name. It only takes a minute.</p>
          <p style="margin:0 0 20px;"><a href="${link}" style="display:inline-block;background:#B08E45;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;">Review &amp; sign</a></p>
          <p style="margin:0;font-size:12px;color:#777;">If the button does not work, copy this link into your browser: ${link}</p>`);
        const r = await sendEmail({ to: p.email, toName: p.full_name || undefined, subject: `${kind === "reminder" ? "Reminder: please" : "Please"} sign: ${doc.title}`, html });
        ok = r.ok;
        detail = r.detail;
      } catch (e) {
        detail = `exception: ${(e as Error).message}`.slice(0, 300);
      }
    }
    if (ok) sent++; else failed++;
    await service.from("signature_requests").insert({
      document_id: doc.id,
      user_id: p.user_id,
      requested_by: me.id,
      kind,
      sent_at: ok ? new Date().toISOString() : null,
      email_sent: ok,
      email_detail: detail,
    });
  }

  return jsonResponse({ ok: true, sent, failed, skipped, total: seen.size });
});
