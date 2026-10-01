// Sends branded HTML email via the Resend API, optionally with an .ics
// attachment (base64-encoded, per Resend's attachments format).

const BRAND = {
  gold: "#B08E45",
  goldDark: "#5E4B1E",
  ink: "#1B1E21",
  cream: "#FDFBF6",
};

export function emailShell(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:${BRAND.cream};font-family:Georgia,'Times New Roman',serif;color:${BRAND.ink};">
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
let graphToken: { value: string; exp: number } | null = null;

async function getGraphToken(): Promise<string> {
  if (graphToken && graphToken.exp > Date.now() + 60_000) return graphToken.value;
  const tenant = Deno.env.get("MS_TENANT_ID")!;
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("MS_CLIENT_ID")!,
      client_secret: Deno.env.get("MS_CLIENT_SECRET")!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`token HTTP ${res.status}: ${String(json.error_description || json.error || "").slice(0, 200)}`);
  graphToken = { value: json.access_token, exp: Date.now() + (Number(json.expires_in) || 3000) * 1000 };
  return graphToken.value;
}

async function sendViaGraph(opts: SendOpts): Promise<{ ok: boolean; detail: string }> {
  const sender = Deno.env.get("MS_SENDER_EMAIL")!;
  try {
    const token = await getGraphToken();
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
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: opts.subject,
          body: { contentType: "HTML", content: opts.html },
          toRecipients: [{ emailAddress: { address: opts.to, ...(opts.toName ? { name: opts.toName } : {}) } }],
          replyTo: [{ emailAddress: { address: replyTo } }],
          ...(attachments.length ? { attachments } : {}),
        },
        saveToSentItems: true,
      }),
    });
    if (res.status === 202 || res.ok) return { ok: true, detail: "sent via Microsoft 365" };
    const body = await res.text();
    return { ok: false, detail: `Microsoft 365 HTTP ${res.status}: ${body.slice(0, 300)}` };
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
  // Preferred: send from the school's Outlook mailbox through Microsoft Graph.
  let graphFailure = "";
  if (Deno.env.get("MS_TENANT_ID") && Deno.env.get("MS_CLIENT_ID") && Deno.env.get("MS_CLIENT_SECRET") && Deno.env.get("MS_SENDER_EMAIL")) {
    const g = await sendViaGraph(opts);
    if (g.ok) return g;
    graphFailure = g.detail;
  }
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { ok: false, detail: graphFailure || "No email provider configured" };

  const fromEmail = Deno.env.get("MAIL_FROM_EMAIL") || "noreply@globalacademy.tarbiyyah.co.uk";
  const fromName = Deno.env.get("MAIL_FROM_NAME") || "Tarbiyyah Global Academy";

  const payload: Record<string, unknown> = {
    from: `${fromName} <${fromEmail}>`,
    to: [opts.toName ? `${opts.toName} <${opts.to}>` : opts.to],
    subject: opts.subject,
    html: opts.html,
    reply_to: Deno.env.get("ADMISSIONS_EMAIL") || "globalacademy@tarbiyyah.co.uk",
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
  return { ok: false, detail: `${graphFailure ? graphFailure + " | Resend " : ""}HTTP ${res.status}: ${body.slice(0, 300)}` };
}
