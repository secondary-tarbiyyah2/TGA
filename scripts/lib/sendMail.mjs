// Shared email sender for the scheduled scripts in scripts/ (run by GitHub
// Actions). Same provider order as the Edge Functions' _shared/resend.ts,
// minus Microsoft 365:
//   1. Amazon SES — when AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID and
//      AWS_SES_SECRET_ACCESS_KEY are set
//   2. Resend     — when RESEND_API_KEY is set
//
// From address: MAIL_FROM_EMAIL, defaulting to the verified sending domain
// (noreply@globalacademy.tarbiyyah.co.uk). Replies go to ADMISSIONS_EMAIL
// (default globalacademy@tarbiyyah.co.uk). Never throws; returns
// { ok, detail }.
import { createHash, createHmac, randomUUID } from "node:crypto";

const FROM_EMAIL = process.env.MAIL_FROM_EMAIL || "noreply@globalacademy.tarbiyyah.co.uk";
const FROM_NAME = process.env.MAIL_FROM_NAME || "Tarbiyyah Global Academy";
const REPLY_TO = process.env.ADMISSIONS_EMAIL || "globalacademy@tarbiyyah.co.uk";

export function mailConfigured() {
  return sesConfigured() || !!process.env.RESEND_API_KEY;
}

function sesConfigured() {
  return !!(process.env.AWS_SES_REGION && process.env.AWS_SES_ACCESS_KEY_ID && process.env.AWS_SES_SECRET_ACCESS_KEY);
}

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const hmac = (k, s) => createHmac("sha256", k).update(s, "utf8").digest();

/** AWS Signature Version 4 headers for a JSON POST (exported for tests). */
export function signRequest({ method, host, path, body, region, service, accessKeyId, secretAccessKey, now = new Date() }) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const headers = { "content-type": "application/json", host, "x-amz-date": amzDate };
  const names = Object.keys(headers).sort();
  const canonical = [method, path, "", names.map((h) => `${h}:${headers[h]}\n`).join(""), names.join(";"), sha256(body)].join("\n");
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign, "utf8").digest("hex");
  return {
    "Content-Type": "application/json",
    "X-Amz-Date": amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
  };
}

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const wrap76 = (s) => s.replace(/.{1,76}/g, (m) => m + "\r\n").trimEnd();

function buildMime({ from, to, replyTo, subject, html }) {
  const name = from.match(/^(.*?)\s*</)?.[1];
  const addr = from.match(/<([^>]+)>/)?.[1] || from;
  return [
    `From: ${name ? `${encodeHeader(name)} <${addr}>` : addr}`,
    `To: ${to}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${encodeHeader(subject)}`,
    `Message-ID: <${randomUUID()}@globalacademy.tarbiyyah.co.uk>`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64(html)),
  ].join("\r\n");
}

async function sendViaSes(to, subject, html) {
  const region = process.env.AWS_SES_REGION;
  const host = `email.${region}.amazonaws.com`;
  const path = "/v2/email/outbound-emails";
  const raw = buildMime({ from: `${FROM_NAME} <${FROM_EMAIL}>`, to, replyTo: REPLY_TO, subject, html });
  const body = JSON.stringify({ Content: { Raw: { Data: b64(raw) } } });
  const headers = signRequest({
    method: "POST",
    host,
    path,
    body,
    region,
    service: "ses",
    accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY,
  });
  const res = await fetch(`https://${host}${path}`, { method: "POST", headers, body });
  if (res.ok) return { ok: true, detail: "sent via Amazon SES" };
  return { ok: false, detail: `Amazon SES HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
}

async function sendViaResend(to, subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${FROM_NAME} <${FROM_EMAIL}>`, to: [to], reply_to: REPLY_TO, subject, html }),
  });
  if (res.ok) return { ok: true, detail: "sent via Resend" };
  return { ok: false, detail: `Resend HTTP ${res.status}` };
}

/** Send one HTML email. Tries SES, then Resend. */
export async function sendMail(to, subject, html) {
  if (!to) return { ok: false, detail: "no recipient" };
  if (/\.internal$/i.test(String(to).trim())) return { ok: false, detail: "internal student sign-in address, not a mailbox" };
  // Test accounts (scripts/test-data.mjs) use the reserved .test domain, which has no mailboxes.
  if (/\.test$/i.test(String(to).trim())) return { ok: false, detail: "Not sent: test account (.test address)" };
  const failures = [];
  if (sesConfigured()) {
    try {
      const r = await sendViaSes(to, subject, html);
      if (r.ok) return r;
      failures.push(r.detail);
    } catch (e) {
      failures.push(`Amazon SES: ${String(e).slice(0, 200)}`);
    }
  }
  if (process.env.RESEND_API_KEY) {
    try {
      const r = await sendViaResend(to, subject, html);
      if (r.ok) return r;
      failures.push(r.detail);
    } catch (e) {
      failures.push(`Resend: ${String(e).slice(0, 200)}`);
    }
  }
  return { ok: false, detail: failures.join(" | ") || "no email provider configured (set AWS_SES_* or RESEND_API_KEY)" };
}
