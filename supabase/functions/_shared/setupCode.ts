// The 6-digit code that comes with every account-setup / password-reset link
// (generateLink returns it as properties.email_otp). Lets someone finish on a
// different device from the one the email is open on: they go to
// <learn>/login/forgot?code=1, enter their email and this code
// (verifyOtp type "recovery"), then choose a password. Expires with the link
// (Auth "mailer_otp_exp", 24 hours, set in deploy-supabase.yml).

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export function setupCodeHtml(code: string | undefined | null, learnSiteUrl: string, email: string): string {
  if (!code) return "";
  const url = `${learnSiteUrl}/login/forgot?code=1&email=${encodeURIComponent(email)}`;
  return `
      <p style="margin:0 0 8px;">Opening this email on a different device? Go to
        <a href="${esc(url)}" style="color:#5E4B1E;">${esc(learnSiteUrl.replace(/^https?:\/\//, ""))}/login/forgot</a>,
        enter your email address and this code:</p>
      <p style="margin:0 0 20px;font-family:Consolas,Menlo,monospace;font-size:28px;font-weight:bold;letter-spacing:6px;background:#F5ECD6;border-radius:10px;padding:12px 16px;text-align:center;">${esc(code)}</p>`;
}
