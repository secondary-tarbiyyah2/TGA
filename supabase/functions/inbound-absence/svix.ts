// Verifies a Resend webhook. Resend signs webhooks with Svix:
//   headers  svix-id, svix-timestamp (unix seconds), svix-signature ("v1,<base64> v1,<base64> ...")
//   signed   `${svix-id}.${svix-timestamp}.${raw body}`
//   key      the webhook's signing secret "whsec_<base64>", base64-decoded
//   algo     HMAC-SHA256, base64
// A timestamp more than 5 minutes from now is rejected (replay protection).

const enc = new TextEncoder();

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function svixSign(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const keyBytes = b64ToBytes(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${id}.${timestamp}.${body}`)));
  return bytesToB64(sig);
}

export async function verifySvix(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): Promise<{ ok: boolean; reason?: string }> {
  if (!secret) return { ok: false, reason: "no_secret" };
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing_headers" };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return { ok: false, reason: "stale_timestamp" };
  let expected: string;
  try {
    expected = await svixSign(secret, id, timestamp, body);
  } catch {
    return { ok: false, reason: "bad_secret" };
  }
  const ok = signature.split(" ").some((part) => {
    const [version, sig] = part.split(",", 2);
    return version === "v1" && !!sig && timingSafeEqual(sig, expected);
  });
  return ok ? { ok: true } : { ok: false, reason: "bad_signature" };
}
