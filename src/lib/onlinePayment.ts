/**
 * Online fee payments (owner, 11 Nov 2026, Tafweed 3: "way to pay now is
 * online"). The school takes payments on a provider's hosted payment page
 * (recommended: a Stripe Payment Link with Pay by Bank and cards turned on; see
 * docs/online-payments-options.md). No keys live in this repo: the only setting
 * is the page's public address, stored in site_settings.online_payment_url
 * (migration 0214) and edited in the portal under Admissions settings.
 *
 * Until that address is set, every "Pay online" button stays hidden.
 */

/** The address if it is a usable https link, otherwise null (so nothing is shown). */
export function cleanPaymentUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Stripe Payment Links (buy.stripe.com, or a custom domain the owner tells us about). */
function isStripePaymentLink(u: URL): boolean {
  return u.hostname === "buy.stripe.com";
}

/**
 * The link a family opens. For a Stripe Payment Link we add
 * `client_reference_id` (letters, digits, dashes and underscores, up to 200
 * characters) so a later webhook can match the payment to the family or
 * application, and `prefilled_email` when we know it. Other providers get the
 * plain address: unknown parameters are not added.
 */
export function payOnlineHref(raw: string | null | undefined, opts: { reference?: string | null; email?: string | null } = {}): string | null {
  const clean = cleanPaymentUrl(raw);
  if (!clean) return null;
  const u = new URL(clean);
  if (isStripePaymentLink(u)) {
    const ref = (opts.reference ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 200);
    if (ref) u.searchParams.set("client_reference_id", ref);
    const email = (opts.email ?? "").trim();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) u.searchParams.set("prefilled_email", email);
  }
  return u.toString();
}
