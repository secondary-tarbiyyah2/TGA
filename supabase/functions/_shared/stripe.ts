// Stripe over its REST API with fetch (no SDK). The secret key and webhook
// signing secret live only in Supabase Edge Function secrets
// (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET), set by deploy-supabase.yml from
// the GitHub secrets of the same names. Nothing here logs a key.
// See docs/payments.md.

export type StripeMode = "test" | "live";

/** "test" for sk_test_ / rk_test_ keys, "live" for sk_live_ / rk_live_, null when unset or unknown. */
export function stripeMode(key: string | null | undefined): StripeMode | null {
  const k = (key || "").trim();
  if (/^(sk|rk)_test_/.test(k)) return "test";
  if (/^(sk|rk)_live_/.test(k)) return "live";
  return null;
}

export function stripeSecretKey(): string | null {
  try {
    const k = (Deno.env.get("STRIPE_SECRET_KEY") || "").trim();
    return stripeMode(k) ? k : null;
  } catch {
    return null;
  }
}

export function stripeWebhookSecret(): string | null {
  try {
    const s = (Deno.env.get("STRIPE_WEBHOOK_SECRET") || "").trim();
    return s.startsWith("whsec_") ? s : null;
  } catch {
    return null;
  }
}

type Param = string | number | boolean | null | undefined | Param[] | { [k: string]: Param };

/** Stripe's form encoding: nested objects as a[b]=, arrays as a[0]=. Null and undefined are left out. */
export function formEncode(params: Record<string, Param>): string {
  const out: string[] = [];
  const walk = (prefix: string, v: Param) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(`${prefix}[${i}]`, item));
    } else if (typeof v === "object") {
      for (const [k, child] of Object.entries(v)) walk(`${prefix}[${k}]`, child);
    } else {
      out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(v))}`);
    }
  };
  for (const [k, v] of Object.entries(params)) walk(k, v);
  return out.join("&");
}

export type StripeResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; code?: string };

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** One call to the Stripe API. `idempotencyKey` makes a create safe to retry. */
export async function stripeRequest<T = Record<string, unknown>>(
  key: string,
  method: "GET" | "POST",
  path: string,
  params: Record<string, Param> = {},
  opts: { idempotencyKey?: string; fetchImpl?: FetchLike } = {},
): Promise<StripeResult<T>> {
  const f = opts.fetchImpl || fetch;
  const body = formEncode(params);
  const url = `https://api.stripe.com/v1/${path.replace(/^\//, "")}${method === "GET" && body ? `?${body}` : ""}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Stripe-Version": "2024-06-20",
  };
  if (method === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  let res: Response;
  try {
    res = await f(url, { method, headers, body: method === "POST" ? body : undefined });
  } catch (e) {
    return { ok: false, status: 0, error: `network: ${String(e).slice(0, 200)}` };
  }
  let json: Record<string, unknown> = {};
  try {
    json = await res.json();
  } catch {
    // fall through
  }
  if (!res.ok) {
    const err = (json.error || {}) as { message?: string; code?: string };
    return { ok: false, status: res.status, error: (err.message || `HTTP ${res.status}`).slice(0, 300), code: err.code };
  }
  return { ok: true, data: json as T };
}

// ── webhook signatures ──────────────────────────────────────────────────

const enc = new TextEncoder();

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** For tests: the Stripe-Signature header Stripe would send. */
export async function signStripePayload(secret: string, body: string, timestamp: number): Promise<string> {
  return `t=${timestamp},v1=${await hmacHex(secret, `${timestamp}.${body}`)}`;
}

export type SignatureCheck = { ok: true; timestamp: number } | { ok: false; reason: "missing_header" | "bad_header" | "too_old" | "no_match" };

/**
 * Checks Stripe's signature: HMAC SHA-256 of "timestamp.body" with the
 * endpoint's signing secret, compared in constant time against every v1
 * signature in the header, and the timestamp within `toleranceSec` (5 minutes)
 * of now, so an old captured request cannot be replayed.
 */
export async function verifyStripeSignature(
  secret: string,
  header: string | null,
  body: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): Promise<SignatureCheck> {
  if (!header) return { ok: false, reason: "missing_header" };
  let t = NaN;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((s) => (s || "").trim());
    if (k === "t") t = Number(v);
    else if (k === "v1" && /^[0-9a-f]{64}$/.test(v)) v1.push(v);
  }
  if (!Number.isFinite(t) || v1.length === 0) return { ok: false, reason: "bad_header" };
  if (Math.abs(nowSec - t) > toleranceSec) return { ok: false, reason: "too_old" };
  const expected = await hmacHex(secret, `${t}.${body}`);
  let match = false;
  for (const s of v1) if (timingSafeEqual(s, expected)) match = true;
  return match ? { ok: true, timestamp: t } : { ok: false, reason: "no_match" };
}

/** Dashboard link for a Stripe object, for staff. */
export function dashboardUrl(id: string, mode: StripeMode | null): string {
  const base = `https://dashboard.stripe.com/${mode === "test" ? "test/" : ""}`;
  if (id.startsWith("pi_")) return `${base}payments/${id}`;
  if (id.startsWith("cus_")) return `${base}customers/${id}`;
  if (id.startsWith("po_")) return `${base}payouts/${id}`;
  if (id.startsWith("dp_") || id.startsWith("du_")) return `${base}disputes/${id}`;
  return `${base}search?query=${encodeURIComponent(id)}`;
}
