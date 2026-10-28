// Public proof-of-payment upload for admissions. Deployed with verify_jwt =
// false (supabase/config.toml): families are not signed in. Access control is
// the (reference, token) pair from the personal link in their offer email:
//   * the token is random (192 bits); only its SHA-256 hash is stored in
//     admissions_stage_details.payment_token_hash and compared in constant time;
//   * links expire after TOKEN_TTL_DAYS and a new offer / upload-link email
//     replaces the old token;
//   * failed lookups are throttled per IP and per reference (booking_attempts);
//   * uploads are capped per request, per hour and per application.
// Files go to the private 'admissions-payments' bucket via the service role
// (staff read via signed URLs); rows go to admissions_payment_proofs; staff are
// emailed (ADMISSIONS_EMAIL) since there is no per-user notifications table.
//
// POST JSON      { action: "info",   reference, token }
// POST multipart { action: "upload", reference, token, covers (comma list of
//                  application_fee|first_payment), plan, amount,
//                  note, files[] (JPG/PNG/PDF, <= 10 MB each, <= 5) }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";
import { hashToken } from "../_shared/manageToken.ts";
import { hashIp } from "../_shared/spam.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ADMISSIONS_EMAIL = Deno.env.get("ADMISSIONS_EMAIL") || "globalacademy@tarbiyyah.co.uk";
const LEARN_SITE_URL = (Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk").replace(/\/$/, "");
const BUCKET = "admissions-payments";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 5;
const MAX_REQUEST_BYTES = 30 * 1024 * 1024;
const MAX_PROOFS_PER_APPLICATION = 20;
const MAX_UPLOADS_PER_HOUR = 6;
const MAX_FAILURES_PER_HOUR = 10;
const TOKEN_TTL_DAYS = 90;
const COVERS = ["application_fee", "first_payment"] as const; // no registration fee (0163)
const PLANS = ["annual", "termly", "monthly"] as const;
const CLOSED_STATUSES = ["declined", "withdrawn"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function clientIp(req: Request): string {
  return (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Sniff the real file type from its first bytes; never trust the client's MIME type. */
function sniff(bytes: Uint8Array): { type: string; ext: string } | null {
  if (bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return { type: "application/pdf", ext: "pdf" };
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return { type: "image/png", ext: "png" };
  return null;
}

const safeName = (name: string) => name.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "proof";

type App = { id: string; reference: string; status: string; child_first_name: string; child_last_name: string; parent_name: string; parent_email: string };

async function tooManyFailures(ipHash: string, ref: string): Promise<boolean> {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const [byIp, byRef] = await Promise.all([
    supabase.from("booking_attempts").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).like("email", "payproof-fail:%").gte("created_at", since),
    supabase.from("booking_attempts").select("id", { count: "exact", head: true }).eq("email", `payproof-fail:${ref}`).gte("created_at", since),
  ]);
  return (byIp.count ?? 0) >= MAX_FAILURES_PER_HOUR || (byRef.count ?? 0) >= MAX_FAILURES_PER_HOUR * 2;
}

/** Look the application up by reference and check the token. Returns null (and records a failure) on any mismatch. */
async function authenticate(reference: string, token: string, ipHash: string): Promise<{ app: App } | { error: Response }> {
  const ref = reference.trim().toUpperCase();
  if (!/^TGA-\d{4}-\d{4,6}$/.test(ref) || !/^[0-9a-f]{48}$/.test(token)) {
    await supabase.from("booking_attempts").insert({ ip_hash: ipHash, email: `payproof-fail:${ref.slice(0, 20)}` });
    return { error: jsonResponse({ ok: false, error: "invalid_link" }, 403) };
  }
  if (await tooManyFailures(ipHash, ref)) return { error: jsonResponse({ ok: false, error: "rate_limited" }, 429) };

  const { data: app } = await supabase
    .from("admissions_applications")
    .select("id, reference, status, child_first_name, child_last_name, parent_name, parent_email")
    .eq("reference", ref)
    .maybeSingle();
  const { data: details } = app
    ? await supabase.from("admissions_stage_details").select("payment_token_hash, payment_token_created_at").eq("application_id", app.id).maybeSingle()
    : { data: null };

  const hash = await hashToken(token);
  const stored = (details?.payment_token_hash as string | null) || "";
  const created = details?.payment_token_created_at ? new Date(details.payment_token_created_at as string).getTime() : 0;
  const fresh = created > Date.now() - TOKEN_TTL_DAYS * 86400_000;
  // Always run the comparison (against the hash of the supplied token when nothing is stored) so timing doesn't reveal which part failed.
  const match = timingSafeEqual(stored || "0".repeat(hash.length), hash) && Boolean(stored);
  if (!app || !match || !fresh) {
    await supabase.from("booking_attempts").insert({ ip_hash: ipHash, email: `payproof-fail:${ref}` });
    return { error: jsonResponse({ ok: false, error: "invalid_link" }, 403) };
  }
  if (CLOSED_STATUSES.includes(app.status as string)) return { error: jsonResponse({ ok: false, error: "application_closed" }, 403) };
  return { app: app as App };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const ipHash = await hashIp(clientIp(req));
  const contentType = req.headers.get("content-type") || "";

  // ── info ───────────────────────────────────────────────────────────────
  if (contentType.includes("application/json")) {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: "invalid_json" }, 400);
    }
    if (body.action !== "info") return jsonResponse({ ok: false, error: "unknown_action" }, 400);
    const auth = await authenticate(String(body.reference || ""), String(body.token || ""), ipHash);
    if ("error" in auth) return auth.error;
    const { data: proofs } = await supabase
      .from("admissions_payment_proofs")
      .select("file_name, covers, plan, uploaded_at, status, note")
      .eq("application_id", auth.app.id)
      .order("uploaded_at", { ascending: false })
      .limit(MAX_PROOFS_PER_APPLICATION);
    return jsonResponse({
      ok: true,
      reference: auth.app.reference,
      childName: auth.app.child_first_name,
      parentName: auth.app.parent_name,
      // Rejection reasons are written for the family; pending/verified notes are not shown.
      proofs: (proofs || []).map((p) => ({ fileName: p.file_name, covers: p.covers, plan: p.plan, uploadedAt: p.uploaded_at, status: p.status, reason: p.status === "rejected" ? p.note : null })),
    });
  }

  // ── upload ─────────────────────────────────────────────────────────────
  let form: FormData;
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_REQUEST_BYTES + 1024 * 1024) return jsonResponse({ ok: false, error: "too_large" }, 413);
  try {
    form = await req.formData();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_form" }, 400);
  }
  if (String(form.get("action") || "upload") !== "upload") return jsonResponse({ ok: false, error: "unknown_action" }, 400);

  const auth = await authenticate(String(form.get("reference") || ""), String(form.get("token") || ""), ipHash);
  if ("error" in auth) return auth.error;
  const app = auth.app;

  // Honeypot: real visitors never fill this hidden field.
  if (String(form.get("company") || "").trim() !== "") return jsonResponse({ ok: true, uploaded: 0 });

  const covers = String(form.get("covers") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s, i, a) => (COVERS as readonly string[]).includes(s) && a.indexOf(s) === i);
  if (covers.length === 0) return jsonResponse({ ok: false, error: "choose_what_it_covers" }, 400);
  const planRaw = String(form.get("plan") || "");
  const plan = (PLANS as readonly string[]).includes(planRaw) ? planRaw : null;
  if (covers.includes("first_payment") && !plan) return jsonResponse({ ok: false, error: "choose_plan" }, 400);
  const amountRaw = String(form.get("amount") || "").trim();
  const amount = amountRaw === "" ? null : Number(amountRaw);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 100000)) return jsonResponse({ ok: false, error: "invalid_amount" }, 400);
  const note = String(form.get("note") || "").trim().slice(0, 1000) || null;

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return jsonResponse({ ok: false, error: "no_files" }, 400);
  if (files.length > MAX_FILES_PER_REQUEST) return jsonResponse({ ok: false, error: "too_many_files" }, 400);
  if (files.some((f) => f.size > MAX_FILE_BYTES)) return jsonResponse({ ok: false, error: "file_too_large" }, 400);
  if (files.reduce((s, f) => s + f.size, 0) > MAX_REQUEST_BYTES) return jsonResponse({ ok: false, error: "too_large" }, 413);

  // Volume limits
  const since = new Date(Date.now() - 3600_000).toISOString();
  const [{ count: total }, { count: recent }] = await Promise.all([
    supabase.from("admissions_payment_proofs").select("id", { count: "exact", head: true }).eq("application_id", app.id),
    supabase.from("booking_attempts").select("id", { count: "exact", head: true }).eq("email", `payproof-ok:${app.reference}`).gte("created_at", since),
  ]);
  if ((total ?? 0) + files.length > MAX_PROOFS_PER_APPLICATION) return jsonResponse({ ok: false, error: "too_many_proofs" }, 429);
  if ((recent ?? 0) >= MAX_UPLOADS_PER_HOUR) return jsonResponse({ ok: false, error: "rate_limited" }, 429);

  // Validate every file's real type before storing anything.
  const prepared: { bytes: Uint8Array; type: string; ext: string; name: string }[] = [];
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const kind = sniff(bytes);
    if (!kind) return jsonResponse({ ok: false, error: "unsupported_file_type", file: safeName(f.name) }, 400);
    prepared.push({ bytes, ...kind, name: safeName(f.name) });
  }

  const submissionId = crypto.randomUUID();
  const kind = covers.length > 1 ? "combined" : covers[0];
  const stored: string[] = [];
  let index = 0;
  for (const p of prepared) {
    const path = `${app.id}/${crypto.randomUUID()}.${p.ext}`;
    const up = await supabase.storage.from(BUCKET).upload(path, p.bytes, { contentType: p.type, upsert: false });
    if (up.error) {
      await supabase.storage.from(BUCKET).remove(stored);
      await supabase.from("admissions_payment_proofs").delete().eq("submission_id", submissionId);
      return jsonResponse({ ok: false, error: "storage_failed" }, 500);
    }
    stored.push(path);
    const ins = await supabase.from("admissions_payment_proofs").insert({
      application_id: app.id,
      submission_id: submissionId,
      kind,
      covers,
      plan,
      amount_claimed: index === 0 ? amount : null,
      family_note: index === 0 ? note : null,
      file_path: path,
      file_name: p.name,
      content_type: p.type,
      size_bytes: p.bytes.length,
    });
    if (ins.error) {
      await supabase.storage.from(BUCKET).remove(stored);
      await supabase.from("admissions_payment_proofs").delete().eq("submission_id", submissionId);
      return jsonResponse({ ok: false, error: "save_failed" }, 500);
    }
    index++;
  }
  await supabase.from("booking_attempts").insert({ ip_hash: ipHash, email: `payproof-ok:${app.reference}` });

  // Notify staff (best effort) and acknowledge to the parent (best effort).
  const childName = `${app.child_first_name} ${app.child_last_name}`;
  const coverText = covers.map((c) => c.replace("_", " ")).join(", ");
  try {
    await sendEmail({
      to: ADMISSIONS_EMAIL,
      subject: `Proof of payment uploaded: ${app.reference} ${childName}`,
      html: emailShell(
        `<p style="margin:0 0 12px;"><strong>${esc(app.parent_name)}</strong> uploaded ${files.length} file${files.length === 1 ? "" : "s"} for <strong>${esc(childName)}</strong> (${esc(app.reference)}).</p>` +
          `<p style="margin:0 0 12px;">Covers: ${esc(coverText)}${plan ? ` &middot; plan: ${esc(plan)}` : ""}${amount !== null ? ` &middot; stated amount: &pound;${amount.toFixed(2)}` : ""}.</p>` +
          `<p style="margin:0 0 20px;"><a href="${LEARN_SITE_URL}/admin/admissions" style="color:#B08E45;">Review in Admissions &rarr; Payments &rarr;</a></p>`,
      ),
    });
  } catch (e) {
    console.error("staff notification failed", e);
  }
  try {
    await sendEmail({
      to: app.parent_email,
      toName: app.parent_name,
      subject: `We have received your proof of payment for ${app.child_first_name}`,
      html: emailShell(
        `<p style="margin:0 0 16px;line-height:1.55;">Assalamu alaikum ${esc(app.parent_name.split(/\s+/)[0] || app.parent_name)},</p>` +
          `<p style="margin:0 0 16px;line-height:1.55;">Thank you. We have received your proof of payment for ${esc(app.child_first_name)} (${esc(app.reference)}). Our team will check it and email you once it is confirmed.</p>` +
          `<p style="margin:0;line-height:1.55;">Jazakum Allahu khairan,<br>Admissions Team<br>Tarbiyyah Global Academy</p>`,
      ),
    });
  } catch (e) {
    console.error("parent acknowledgement failed", e);
  }

  return jsonResponse({ ok: true, uploaded: files.length });
});
