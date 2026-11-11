// Generates (on demand) the "Star of the week" PDF certificate for an
// APPROVED star, stores it in the private `star-certificates` bucket and
// returns a short-lived link. Optionally emails it to the child's parent.
//
// Deployed WITH JWT verification. Staff only: the caller must hold a
// head_teacher / admin / teacher / teaching_assistant_cover role AND be able
// to read that star under their own RLS (so a teacher can only produce
// certificates for their own classes). Only head_teacher/admin may email it or
// regenerate it. Families do not call this -- they open the stored PDF via
// the storage read policy added in 0074.
//
// POST { star_id, email?: boolean, regenerate?: boolean }
//  -> { ok: true, url, path, generated, emailed }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";
import { toBase64 } from "../_shared/signedPdf.ts";
import { buildStarCertificate } from "../_shared/starCertificate.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LEARN_SITE_URL = (Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk").replace(/\/$/, "");
const service = createClient(supabaseUrl, serviceRoleKey);
const BUCKET = "star-certificates";
const URL_TTL_SECONDS = 600;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await caller.auth.getUser();
  const me = userData?.user;
  if (!me) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let starId = "";
  let wantEmail = false;
  let regenerate = false;
  try {
    const body = await req.json();
    starId = String(body.star_id || "");
    wantEmail = body.email === true;
    regenerate = body.regenerate === true;
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(starId)) return jsonResponse({ ok: false, error: "missing_star_id" }, 400);

  // Staff only.
  const { data: roleRows } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", me.id)
    .in("role", ["head_teacher", "admin", "teacher", "teaching_assistant_cover"]);
  const roles = (roleRows || []).map((r) => r.role as string);
  if (roles.length === 0) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const isHead = roles.includes("head_teacher") || roles.includes("admin");

  // Must be visible to the caller under RLS (own class for a teacher).
  const { data: visible } = await caller.from("star_of_the_week").select("id").eq("id", starId).maybeSingle();
  if (!visible) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  const { data: star } = await service
    .from("star_of_the_week")
    .select("id, child_id, week_start, reason, message, status, certificate_path, decided_at, children(name, parent_user_id), classes(name)")
    .eq("id", starId)
    .maybeSingle();
  if (!star) return jsonResponse({ ok: false, error: "not_found" }, 404);
  if (star.status !== "approved") return jsonResponse({ ok: false, error: "not_approved", detail: "A certificate can only be made once the star has been approved." }, 409);
  if (wantEmail && !isHead) return jsonResponse({ ok: false, error: "forbidden", detail: "Only the Headteacher or an admin can email certificates." }, 403);

  const child = (Array.isArray(star.children) ? star.children[0] : star.children) as { name: string; parent_user_id: string } | null;
  const cls = (Array.isArray(star.classes) ? star.classes[0] : star.classes) as { name: string } | null;
  if (!child) return jsonResponse({ ok: false, error: "not_found" }, 404);

  const fullName = String(child.name || "").trim();
  const firstName = fullName.split(/\s+/)[0] || fullName;
  const path = `${star.child_id}/${star.id}.pdf`;

  try {
    let bytes: Uint8Array | null = null;
    let generated = false;
    if (!star.certificate_path || (regenerate && isHead)) {
      bytes = await buildStarCertificate({
        fullName,
        firstName,
        reason: star.reason,
        message: (star as { message?: string | null }).message || null,
        className: cls?.name || "",
        weekStart: star.week_start,
        approvedAt: star.decided_at,
      });
      const { error: upErr } = await service.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (upErr) throw new Error(`upload: ${upErr.message}`);
      const { error: rowErr } = await service
        .from("star_of_the_week")
        .update({ certificate_path: path, certificate_at: new Date().toISOString() })
        .eq("id", star.id);
      if (rowErr) throw new Error(`row: ${rowErr.message}`);
      generated = true;
    }

    let emailed = false;
    let emailNote = "";
    if (wantEmail) {
      if (!bytes) {
        const { data: blob } = await service.storage.from(BUCKET).download(path);
        bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null;
      }
      const { data: parent } = await service.from("profiles").select("email, full_name").eq("id", child.parent_user_id).maybeSingle();
      if (!bytes) {
        emailNote = "The certificate file could not be read.";
      } else if (!parent?.email) {
        emailNote = "This family has no email address on file.";
      } else {
        const html = emailShell(`
          <h2 style="margin:0 0 12px;font-size:20px;">${esc(firstName)} is Star of the Week!</h2>
          <p style="margin:0 0 12px;">Assalamu alaykum${parent.full_name ? ` ${esc(parent.full_name)}` : ""},</p>
          <p style="margin:0 0 12px;">We are delighted to share that <strong>${esc(fullName)}</strong> has been chosen as Star of the Week${cls?.name ? ` in ${esc(cls.name)}` : ""}.</p>
          <p style="margin:0 0 12px;padding:10px 12px;background:#FDF6E3;border-left:3px solid #B08E45;"><em>${esc(star.reason)}</em></p>
          ${(star as { message?: string | null }).message ? `<p style="margin:0 0 12px;">A message from the class teacher: &ldquo;${esc(String((star as { message?: string | null }).message))}&rdquo;</p>` : ""}
          <p style="margin:0 0 12px;">Their certificate is attached. You can also find it any time on your <a href="${LEARN_SITE_URL}/family/dashboard" style="color:#B08E45;">family dashboard</a>.</p>
          <p style="margin:0;">Well done, ${esc(firstName)}, and thank you for your support at home.</p>`);
        const r = await sendEmail({
          to: parent.email,
          toName: parent.full_name || undefined,
          subject: `${firstName} is Star of the Week!`,
          html,
          attachments: [{ filename: `star-of-the-week-${firstName.replace(/[^a-zA-Z0-9]/g, "") || "certificate"}.pdf`, content: toBase64(bytes) }],
        });
        emailed = r.ok;
        if (r.ok) await service.from("star_of_the_week").update({ certificate_emailed_at: new Date().toISOString() }).eq("id", star.id);
        else emailNote = r.detail;
      }
    }

    const { data: signed, error: urlErr } = await service.storage.from(BUCKET).createSignedUrl(path, URL_TTL_SECONDS);
    if (urlErr || !signed) return jsonResponse({ ok: false, error: "url_failed" }, 500);
    return jsonResponse({ ok: true, url: signed.signedUrl, path, generated, emailed, ...(emailNote ? { email_note: emailNote } : {}) });
  } catch (e) {
    console.error("star-certificate failed", (e as Error).message);
    return jsonResponse({ ok: false, error: "generation_failed", detail: (e as Error).message.slice(0, 200) }, 500);
  }
});
