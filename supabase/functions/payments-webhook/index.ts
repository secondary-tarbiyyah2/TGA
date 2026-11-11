// Stripe calls this for every payment event. Deployed with verify_jwt = false:
// the Stripe-Signature header, checked with STRIPE_WEBHOOK_SECRET (HMAC
// SHA-256, five-minute tolerance), is the only way in. Every event id is
// stored in stripe_events and processed once. Events we handle are listed in
// docs/payments.md; any other event is stored and ignored.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { stripeSecretKey, stripeWebhookSecret, verifyStripeSignature } from "../_shared/stripe.ts";
import { dbEventStore, processOnce } from "../_shared/payments.ts";
import { handleEvent } from "./handlers.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MAX_BODY = 512 * 1024;

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  const secret = stripeWebhookSecret();
  const key = stripeSecretKey();
  if (!secret || !key) return jsonResponse({ ok: false, error: "payments_not_configured" }, 503);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return jsonResponse({ ok: false, error: "too_large" }, 413);
  const sig = await verifyStripeSignature(secret, req.headers.get("stripe-signature"), raw);
  if (!sig.ok) return jsonResponse({ ok: false, error: "bad_signature" }, 400);

  let event: { id: string; type: string; livemode: boolean; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  if (!/^evt_[A-Za-z0-9]+$/.test(String(event?.id || "")) || typeof event.type !== "string") {
    return jsonResponse({ ok: false, error: "invalid_event" }, 400);
  }

  const objectId = typeof event.data?.object?.id === "string" ? (event.data.object.id as string).slice(0, 255) : null;
  const result = await processOnce(
    dbEventStore(sb),
    { id: event.id, type: event.type.slice(0, 100), livemode: Boolean(event.livemode), objectId },
    () => handleEvent({ sb, key }, event),
  );
  // A failure returns 500 so Stripe retries later; the error is kept in stripe_events (no secrets in it).
  if (result.outcome === "error") {
    console.error(`payments-webhook: ${event.type} ${event.id} failed`);
    return jsonResponse({ ok: false, error: "processing_failed" }, 500);
  }
  return jsonResponse({ ok: true, duplicate: result.duplicate });
});
