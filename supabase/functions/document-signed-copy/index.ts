// Emails the signer a confirmation copy of the record they just signed.
// Called by the portal right after a successful sign (fire-and-forget): a
// failure here must never affect the signature itself, which is already
// stored. Deployed WITH JWT verification; a user can only request the copy
// of their own signature.
//
// POST { signature_id }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";
import { ensureSignedPdf, loadSignature, SIGNED_BUCKET, toBase64 } from "../_shared/signedPdf.ts";

const MAX_ATTACH_BYTES = 8 * 1024 * 1024;

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

  let signatureId = "";
  try {
    signatureId = String((await req.json()).signature_id || "");
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  if (!signatureId) return jsonResponse({ ok: false, error: "missing_signature_id" }, 400);

  const { data: sig } = await service
    .from("document_signatures")
    .select("id, signer_id, typed_full_name, signed_at, asset_id_signed, content_hash, document_title_signed, receipt_emailed_at, document_id")
    .eq("id", signatureId)
    .maybeSingle();
  if (!sig || sig.signer_id !== me.id) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  if (sig.receipt_emailed_at) return jsonResponse({ ok: true, already_sent: true });

  const { data: profile } = await service.from("profiles").select("email, full_name").eq("id", me.id).maybeSingle();
  const to = profile?.email || me.email;
  let ok = false;
  let detail = "no email address on file";
  if (to) {
    try {
      const when = new Date(sig.signed_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/London" });
      const title = sig.document_title_signed || "Document";
      const receiptUrl = `${LEARN_SITE_URL}/documents/receipt/?id=${sig.id}`;
      // The signed PDF (original document + signature page). Best effort: if
      // it can't be built or is large, the email links to the portal instead.
      let attachment: { filename: string; content: string } | null = null;
      try {
        const full = await loadSignature(service, sig.id);
        if (full) {
          const r = await ensureSignedPdf(service, full);
          let bytes = r.bytes;
          if (!bytes) {
            const { data: blob } = await service.storage.from(SIGNED_BUCKET).download(r.path);
            bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null;
          }
          if (bytes && bytes.length <= MAX_ATTACH_BYTES) {
            const safeTitle = title.replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "document";
            attachment = { filename: `${safeTitle}-signed.pdf`, content: toBase64(bytes) };
          }
        }
      } catch (e) {
        console.error("document-signed-copy: signed pdf failed", (e as Error).message);
      }
      const html = emailShell(`
        <h2 style="margin:0 0 12px;font-size:18px;">Your signed copy</h2>
        <p style="margin:0 0 12px;">Thank you, ${esc(sig.typed_full_name)}. This is your record that you read and signed <strong>${esc(title)}</strong>.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:14px;">
          <tr><td style="padding:3px 16px 3px 0;color:#777;">Document</td><td>${esc(title)}</td></tr>
          <tr><td style="padding:3px 16px 3px 0;color:#777;">Version</td><td style="word-break:break-all;">${esc(sig.asset_id_signed)}</td></tr>
          <tr><td style="padding:3px 16px 3px 0;color:#777;">Signed by</td><td>${esc(sig.typed_full_name)}</td></tr>
          <tr><td style="padding:3px 16px 3px 0;color:#777;">Signed at</td><td>${esc(when)} (UK time)</td></tr>
          <tr><td style="padding:3px 16px 3px 0;color:#777;">Record hash</td><td style="font-family:monospace;font-size:12px;word-break:break-all;">${esc(sig.content_hash || "n/a")}</td></tr>
        </table>
        <p style="margin:0 0 20px;">${attachment ? "Your signed PDF, the document itself with your signature page, is attached. " : ""}<a href="${receiptUrl}" style="color:#B08E45;">${attachment ? "You can also download it from your documents page" : "Open your signed copy"} &rarr;</a></p>`);
      const r = await sendEmail({ to, toName: profile?.full_name || undefined, subject: `Your signed copy: ${title}`, html, attachments: attachment ? [attachment] : undefined });
      ok = r.ok;
      detail = r.detail;
    } catch (e) {
      detail = `exception: ${(e as Error).message}`.slice(0, 300);
    }
  }
  await service.from("document_signatures").update({ receipt_emailed_at: ok ? new Date().toISOString() : null, receipt_email_detail: detail }).eq("id", sig.id);
  // Always 200: the signature stands whether or not the email went out.
  return jsonResponse({ ok: true, email_sent: ok, detail });
});
