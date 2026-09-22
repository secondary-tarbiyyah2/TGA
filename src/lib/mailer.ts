/**
 * Sends transactional email via the Brevo HTTPS API — ported from the legacy
 * register.php, which uses Brevo because this domain's SPF/DKIM records only
 * authorise Brevo (and outbound SMTP is firewalled on the previous host).
 * Configure BREVO_API_KEY in the deployment environment to enable sending.
 */
const FROM_EMAIL = process.env.MAIL_FROM_EMAIL || "globalacademy@tarbiyyah.co.uk";
const FROM_NAME = process.env.MAIL_FROM_NAME || "Tarbiyyah Global Academy";

export async function sendMail({
  to,
  toName,
  subject,
  text,
  replyEmail,
  replyName,
}: {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  replyEmail?: string;
  replyName?: string;
}): Promise<{ ok: boolean; detail: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn("[mailer] BREVO_API_KEY not set — email not sent (dev/test mode).", { to, subject });
    return { ok: true, detail: "dev-mode: no BREVO_API_KEY configured, email skipped" };
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        sender: { email: FROM_EMAIL, name: FROM_NAME },
        to: [{ email: to, name: toName }],
        ...(replyEmail ? { replyTo: { email: replyEmail, name: replyName } } : {}),
        subject,
        textContent: text,
      }),
    });
    if (res.status === 201) return { ok: true, detail: "sent" };
    const body = await res.text();
    return { ok: false, detail: `HTTP ${res.status}: ${body.slice(0, 300)}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "unknown error" };
  }
}

/** Best-effort forward to an external CRM/Notion webhook, if configured. Never throws. */
export async function forwardToCrm(payload: Record<string, unknown>) {
  const url = process.env.CRM_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  } catch (err) {
    console.warn("[mailer] CRM webhook forward failed", err);
  }
}
