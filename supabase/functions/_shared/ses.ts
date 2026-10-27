// Amazon SES (v2 API) sender for Edge Functions.
//
// Used by sendEmail() in ./resend.ts when AWS_SES_REGION,
// AWS_SES_ACCESS_KEY_ID and AWS_SES_SECRET_ACCESS_KEY are set (see
// deploy-supabase.yml). The access key belongs to an IAM user that may only
// call ses:SendEmail / ses:SendRawEmail, nothing else in the AWS account.
//
// No AWS SDK: requests are signed with Signature Version 4 using WebCrypto,
// and the message is sent as raw MIME so attachments (.ics invites, PDFs)
// work the same way they do with the other providers.

export type SesMessage = {
  from: string; // "Name <address>"
  to: string; // "Name <address>" or address
  replyTo?: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string; contentType?: string }[]; // content is base64
};

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(data: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(data)));
}

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}

/** AWS Signature Version 4 headers for a JSON POST. Exported for testing. */
export async function signRequest(opts: {
  method: string;
  host: string;
  path: string;
  body: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  now?: Date;
}): Promise<Record<string, string>> {
  const now = opts.now || new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20261009T101500Z
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(opts.body);
  const headers: Record<string, string> = { "content-type": "application/json", host: opts.host, "x-amz-date": amzDate };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((h) => `${h}:${headers[h]}\n`)
    .join("");
  const canonicalRequest = [opts.method, opts.path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${opts.region}/${opts.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
  let key = await hmac(enc.encode(`AWS4${opts.secretAccessKey}`), dateStamp);
  key = await hmac(key, opts.region);
  key = await hmac(key, opts.service);
  key = await hmac(key, "aws4_request");
  const signature = hex(await hmac(key, stringToSign));
  return {
    "Content-Type": "application/json",
    "X-Amz-Date": amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/** RFC 2047 encoded-word for non-ASCII header text. */
function encodeHeader(s: string): string {
  // deno-lint-ignore no-control-regex
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
}

function b64(s: string): string {
  const bytes = enc.encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function wrap76(s: string): string {
  return s.replace(/.{1,76}/g, (m) => m + "\r\n").trimEnd();
}

/** "Name <a@b>" -> header-safe form with an encoded display name. */
function addressHeader(v: string): string {
  const m = v.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!m || !m[1]) return v.trim();
  return `${encodeHeader(m[1].replace(/"/g, ""))} <${m[2]}>`;
}

const MIME_BY_EXT: Record<string, string> = { ics: "text/calendar", pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

/** Build a raw MIME message. Exported for testing. */
export function buildMime(m: SesMessage): string {
  const boundary = `tga-${crypto.randomUUID()}`;
  const lines = [
    `From: ${addressHeader(m.from)}`,
    `To: ${addressHeader(m.to)}`,
    ...(m.replyTo ? [`Reply-To: ${addressHeader(m.replyTo)}`] : []),
    `Subject: ${encodeHeader(m.subject)}`,
    "MIME-Version: 1.0",
  ];
  const htmlPart = ["Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(b64(m.html))];
  if (!m.attachments?.length) return [...lines, ...htmlPart].join("\r\n");
  const parts = [...lines, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`, ...htmlPart];
  for (const a of m.attachments) {
    const name = a.filename.replace(/["\r\n]/g, "");
    const type = a.contentType || MIME_BY_EXT[name.split(".").pop()?.toLowerCase() || ""] || "application/octet-stream";
    parts.push(`--${boundary}`, `Content-Type: ${type}; name="${name}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${name}"`, "", wrap76(a.content.replace(/\s+/g, "")));
  }
  parts.push(`--${boundary}--`, "");
  return parts.join("\r\n");
}

export function sesConfigured(): boolean {
  return !!(Deno.env.get("AWS_SES_REGION") && Deno.env.get("AWS_SES_ACCESS_KEY_ID") && Deno.env.get("AWS_SES_SECRET_ACCESS_KEY"));
}

export async function sendViaSes(m: SesMessage): Promise<{ ok: boolean; detail: string }> {
  const region = Deno.env.get("AWS_SES_REGION")!;
  const host = `email.${region}.amazonaws.com`;
  const path = "/v2/email/outbound-emails";
  try {
    const raw = buildMime(m);
    const body = JSON.stringify({ Content: { Raw: { Data: b64(raw) } } });
    const headers = await signRequest({
      method: "POST",
      host,
      path,
      body,
      region,
      service: "ses",
      accessKeyId: Deno.env.get("AWS_SES_ACCESS_KEY_ID")!,
      secretAccessKey: Deno.env.get("AWS_SES_SECRET_ACCESS_KEY")!,
    });
    const res = await fetch(`https://${host}${path}`, { method: "POST", headers, body });
    if (res.ok) return { ok: true, detail: "sent via Amazon SES" };
    const text = await res.text();
    return { ok: false, detail: `Amazon SES HTTP ${res.status}: ${text.slice(0, 300)}` };
  } catch (e) {
    return { ok: false, detail: `Amazon SES: ${String(e).slice(0, 300)}` };
  }
}
