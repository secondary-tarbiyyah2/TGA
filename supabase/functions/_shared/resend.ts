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
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { ok: false, detail: "RESEND_API_KEY not configured" };

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
  return { ok: false, detail: `HTTP ${res.status}: ${body.slice(0, 300)}` };
}
