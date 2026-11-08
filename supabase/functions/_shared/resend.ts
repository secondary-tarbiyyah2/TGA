// Sends branded HTML email, optionally with an .ics or other attachments.
// Providers are tried in order, each only if its secrets are set:
//   1. Microsoft 365 (Graph) · from the school's Outlook mailbox
//   2. Amazon SES, see ./ses.ts (AWS_SES_* secrets)
//   3. Resend, RESEND_API_KEY
// so switching provider is a matter of adding or removing secrets.
import { sendViaSes, sesConfigured } from "./ses.ts";
import { graphConfigured, graphRaw } from "./graph.ts";

const BRAND = {
  gold: "#B08E45",
  goldDark: "#5E4B1E",
  ink: "#1B1E21",
  cream: "#FDFBF6",
};

/** `preheader`: the line inboxes show after the subject (hidden in the email itself). */
export function emailShell(bodyHtml: string, preheader = ""): string {
  const pre = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader.replace(/[<>&]/g, "")}</div>`
    : "";
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:${BRAND.cream};font-family:Georgia,'Times New Roman',serif;color:${BRAND.ink};">${pre}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${BRAND.gold};border-radius:16px;overflow:hidden;">
        <tr><td style="background:${BRAND.ink};padding:24px 32px;">
          <span style="color:${BRAND.gold};font-size:18px;font-weight:bold;letter-spacing:0.02em;">Tarbiyyah Global Academy</span>
        </td></tr>
        <tr><td style="padding:32px;">${bodyHtml}</td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #eee;color:#777;font-size:12px;">
          Part of the Tarbiyyah Education Trust &middot; globalacademy.tarbiyyah.co.uk
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── Microsoft 365 (Outlook) sending via Microsoft Graph ─────────────────────
// When MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET / MS_SENDER_EMAIL are set,
// mail is sent FROM that Outlook mailbox (it appears in the mailbox's Sent Items
// and replies land there). Otherwise we fall back to Resend below.
// Token handling, retries and permission-aware errors live in ./graph.ts.
async function sendViaGraph(opts: SendOpts): Promise<{ ok: boolean; detail: string }> {
  const sender = Deno.env.get("MS_SENDER_EMAIL")!;
  try {
    const attachments: Record<string, unknown>[] = [];
    if (opts.icsContent) {
      attachments.push({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: opts.icsFilename || "invite.ics",
        contentType: "text/calendar",
        contentBytes: btoa(unescape(encodeURIComponent(opts.icsContent))),
      });
    }
    for (const a of opts.attachments || []) {
      attachments.push({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.filename, contentBytes: a.content });
    }
    const replyTo = Deno.env.get("ADMISSIONS_EMAIL") || sender;
    const res = await graphRaw(`/users/${encodeURIComponent(sender)}/sendMail`, {
      method: "POST",
      permission: "Mail.Send",
      // A retried sendMail could deliver twice, so only retry throttling (429), which Graph rejects before sending.
      attempts: 3,
      retryServerErrors: false,
      body: {
        message: {
          subject: opts.subject,
          body: { contentType: "HTML", content: opts.html },
          toRecipients: [{ emailAddress: { address: opts.to, ...(opts.toName ? { name: opts.toName } : {}) } }],
          replyTo: [{ emailAddress: { address: replyTo } }],
          ...(attachments.length ? { attachments } : {}),
        },
        saveToSentItems: true,
      },
    });
    if (res.status === 202 || res.ok) return { ok: true, detail: "sent via Microsoft 365" };
    await res.body?.cancel();
    return { ok: false, detail: `Microsoft 365 HTTP ${res.status}: sender mailbox ${sender} not found` };
  } catch (e) {
    return { ok: false, detail: `Microsoft 365: ${String(e).slice(0, 300)}` };
  }
}

type SendOpts = {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  icsContent?: string;
  icsFilename?: string;
  attachments?: { filename: string; content: string }[];
};

export async function sendEmail(opts: {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  icsContent?: string;
  icsFilename?: string;
  /** Extra attachments; `content` is base64. */
  attachments?: { filename: string; content: string }[];
}): Promise<{ ok: boolean; detail: string }> {
  // Student usernames are backed by a synthetic, mail-less address (see
  // _shared/studentAccount.ts). Never try to deliver to it.
  if (/\.internal$/i.test(opts.to.trim())) return { ok: false, detail: "Not sent: that is an internal student sign-in address, not a mailbox" };
  // Test accounts (scripts/test-data.mjs) use the reserved .test domain, which has no mailboxes.
  if (/\.test$/i.test(opts.to.trim())) return { ok: false, detail: "Not sent: test account (.test address)" };
  // Preferred: send from the school's Outlook mailbox through Microsoft Graph.
  let graphFailure = "";
  if (graphConfigured() && Deno.env.get("MS_SENDER_EMAIL")) {
    const g = await sendViaGraph(opts);
    if (g.ok) return g;
    graphFailure = g.detail;
  }
  const fromEmail = Deno.env.get("MAIL_FROM_EMAIL") || "noreply@globalacademy.tarbiyyah.co.uk";
  const fromName = Deno.env.get("MAIL_FROM_NAME") || "Tarbiyyah Global Academy";
  const replyTo = Deno.env.get("ADMISSIONS_EMAIL") || "globalacademy@tarbiyyah.co.uk";

  // Amazon SES. The From address must be on the verified SES domain
  // (globalacademy.tarbiyyah.co.uk), which MAIL_FROM_EMAIL is.
  let sesFailure = "";
  if (sesConfigured()) {
    const sesAttachments = [
      ...(opts.icsContent ? [{ filename: opts.icsFilename || "invite.ics", content: btoa(unescape(encodeURIComponent(opts.icsContent))), contentType: "text/calendar; method=REQUEST; charset=UTF-8" }] : []),
      ...(opts.attachments || []),
    ];
    const s = await sendViaSes({
      from: `${fromName} <${fromEmail}>`,
      to: opts.toName ? `${opts.toName} <${opts.to}>` : opts.to,
      replyTo,
      subject: opts.subject,
      html: opts.html,
      attachments: sesAttachments,
    });
    if (s.ok) return s;
    sesFailure = s.detail;
  }
  const earlier = [graphFailure, sesFailure].filter(Boolean).join(" | ");

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { ok: false, detail: earlier || "No email provider configured" };

  const payload: Record<string, unknown> = {
    from: `${fromName} <${fromEmail}>`,
    to: [opts.toName ? `${opts.toName} <${opts.to}>` : opts.to],
    subject: opts.subject,
    html: opts.html,
    reply_to: replyTo,
  };

  if (opts.icsContent) {
    payload.attachments = [
      {
        filename: opts.icsFilename || "invite.ics",
        content: btoa(unescape(encodeURIComponent(opts.icsContent))),
      },
    ];
  }

  if (opts.attachments?.length) {
    payload.attachments = [...((payload.attachments as unknown[]) || []), ...opts.attachments];
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (res.ok) return { ok: true, detail: "sent" };
  const body = await res.text();
  return { ok: false, detail: `${earlier ? earlier + " | " : ""}Resend HTTP ${res.status}: ${body.slice(0, 300)}` };
}
