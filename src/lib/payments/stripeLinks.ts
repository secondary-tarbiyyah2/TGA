/** Links into the Stripe dashboard for staff (test or live mode). Nothing secret: just the object's page. */
export type StripeMode = "test" | "live" | null;

export function stripeDashboardUrl(id: string, mode: StripeMode, livemode?: boolean | null): string {
  const test = livemode === false || (livemode == null && mode === "test");
  const base = `https://dashboard.stripe.com/${test ? "test/" : ""}`;
  if (id.startsWith("pi_")) return `${base}payments/${id}`;
  if (id.startsWith("cus_")) return `${base}customers/${id}`;
  if (id.startsWith("po_")) return `${base}payouts/${id}`;
  if (id.startsWith("dp_") || id.startsWith("du_")) return `${base}disputes/${id}`;
  return `${base}search?query=${encodeURIComponent(id)}`;
}

/** The Stripe id inside an alert's object reference ("pi_123:charge" -> "pi_123"), if it is one. */
export function stripeIdOf(ref: string | null | undefined): string | null {
  const m = /\b((?:pi|ch|py|cs|cus|po|dp|du|evt)_[A-Za-z0-9]+)/.exec(ref || "");
  return m ? m[1] : null;
}
