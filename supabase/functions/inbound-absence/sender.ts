// Sender checks for inbound email.
//
// Resend reports SPF / DKIM / DMARC as computed by its receiving mail server
// (they can't be forged by the sender). We trust the From address only when:
//   * DMARC passed (SPF or DKIM passed AND aligned with the From domain), or
//   * DKIM passed and the DKIM-Signature d= domain is the From domain (or a
//     parent of it), or
//   * SPF passed and the Return-Path domain is aligned with the From domain.
// Anything else (including no authentication data) is treated as unverified,
// and the email goes to staff review instead of being recorded.

export type AuthResults = { spf?: string | null; dkim?: string | null; dmarc?: string | null } | null | undefined;
export type HeaderMap = Record<string, unknown>;

export function header(headers: HeaderMap | null | undefined, name: string): string {
  if (!headers) return "";
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  if (!key) return "";
  const v = headers[key];
  if (Array.isArray(v)) return v.map(String).join(" ");
  return v == null ? "" : String(v);
}

const domainOf = (addr: string) => (addr.match(/@([^>\s]+)/)?.[1] || "").toLowerCase().replace(/\.$/, "");
/** Relaxed alignment: same domain, or one is a subdomain of the other. */
const aligned = (a: string, b: string) => !!a && !!b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`));

export function senderAuthenticated(auth: AuthResults, headers: HeaderMap | null | undefined, from: string): boolean {
  if (!auth) return false;
  const pass = (v: string | null | undefined) => String(v || "").toLowerCase() === "pass";
  if (pass(auth.dmarc)) return true;
  const fromDomain = domainOf(from);
  if (pass(auth.dkim)) {
    const sig = header(headers, "dkim-signature");
    const domains = [...sig.matchAll(/\bd=([^;\s]+)/g)].map((m) => m[1].toLowerCase());
    if (domains.some((d) => aligned(d, fromDomain))) return true;
  }
  if (pass(auth.spf)) {
    const rp = domainOf(header(headers, "return-path"));
    if (aligned(rp, fromDomain)) return true;
  }
  return false;
}

/** Auto-replies, bounces and bulk mail: never answered, never recorded. */
export function isAutomated(from: string, headers: HeaderMap | null | undefined, ownDomains: string[]): boolean {
  const f = from.toLowerCase();
  if (/^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounces?|notifications?)[@+]/.test(f)) return true;
  if (ownDomains.some((d) => f.endsWith(`@${d}`) || f.endsWith(`.${d}`))) return true;
  const auto = header(headers, "auto-submitted").toLowerCase();
  if (auto && auto !== "no") return true;
  if (/^(bulk|junk|list|auto_reply)$/i.test(header(headers, "precedence").trim())) return true;
  if (header(headers, "x-autoreply") || header(headers, "x-autorespond") || header(headers, "list-id") || header(headers, "list-unsubscribe")) return true;
  return false;
}
