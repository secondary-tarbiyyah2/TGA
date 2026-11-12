"use client";

import { useCallback, useEffect, useState } from "react";
import { Section, Status, Switch, Notice, ui } from "@/components/learn/ui";
import { callEdgeFunction } from "@/lib/learn/edge";
import { getSupabaseClient } from "@/lib/supabase/client";

type PayStatus = {
  stripe: { connected: boolean; mode: "test" | "live" | null };
  webhook: { secretSet: boolean; lastEvent: { type: string; received_at: string; livemode: boolean; outcome: string | null } | null };
  reconciliation: { ran_at: string; ok: boolean } | null;
  directDebitEnabled: boolean;
  openAlerts: number;
};

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Admissions > Settings > Payments (T71): is Stripe connected (test or live,
 * from the key's prefix on the server; the key never reaches the browser),
 * when the webhook last heard from Stripe, the daily check, and the Direct
 * Debit switch (head teacher or admin; off until Stripe enables Bacs).
 */
export function PaymentsSettings() {
  // payments-admin answers head teachers and admins only, so a loaded status means the switch is theirs.
  const canSwitch = true;
  const [status, setStatus] = useState<PayStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const webhookUrl = base ? `${base}/functions/v1/payments-webhook` : "";

  const load = useCallback(async () => {
    const r = await callEdgeFunction("payments-admin", { action: "status" });
    if (r.ok) setStatus(r as unknown as PayStatus);
    else setError(r.error === "forbidden" ? "Only a head teacher or admin can see the payment settings." : "Could not check the payment settings just now.");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
  }, [load]);

  const setDirectDebit = async (next: boolean) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSaving(true);
    const { error: err } = await supabase.from("site_settings").update({ payments_direct_debit_enabled: next }).eq("id", true);
    setSaving(false);
    if (err) setError("Could not change Direct Debit. Only a head teacher or admin can.");
    else load();
  };

  return (
    <Section title="Payments (Stripe)" description="Families pay online through Stripe only: in the portal, or from the personal link in their emails. How to set it up: docs/payments.md.">
      {error && <Notice tone="bad">{error}</Notice>}
      {!status && !error && <p className="t-meta">Checking…</p>}
      {status && (
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="text-ink-500">Stripe</dt>
          <dd>
            {status.stripe.connected ? (
              <Status kind={status.stripe.mode === "live" ? "completed" : "in_progress"}>{status.stripe.mode === "live" ? "Connected, live mode" : "Connected, test mode (no real money)"}</Status>
            ) : (
              <>
                <Status kind="attention">Not connected</Status>
                <span className="t-meta block">Add STRIPE_SECRET_KEY as a GitHub secret and run Deploy Supabase backend.</span>
              </>
            )}
          </dd>
          <dt className="text-ink-500">Webhook</dt>
          <dd>
            {status.webhook.secretSet ? (
              status.webhook.lastEvent ? (
                <Status kind="completed">Last event {when(status.webhook.lastEvent.received_at)} ({status.webhook.lastEvent.type})</Status>
              ) : (
                <Status kind="pending">Secret set; no event received yet</Status>
              )
            ) : (
              <Status kind="attention">Signing secret not set (STRIPE_WEBHOOK_SECRET)</Status>
            )}
            {webhookUrl && (
              <span className="t-meta mt-1 block break-all">
                Endpoint for Stripe: <code className="text-ink">{webhookUrl}</code>
              </span>
            )}
          </dd>
          <dt className="text-ink-500">Daily check</dt>
          <dd>
            {status.reconciliation ? (
              <Status kind={status.reconciliation.ok ? "completed" : "attention"}>
                {when(status.reconciliation.ran_at)}: {status.reconciliation.ok ? "everything matched" : "something to check"}
              </Status>
            ) : (
              <Status kind="pending">Not run yet</Status>
            )}
            {status.openAlerts > 0 && <span className="t-meta block">{status.openAlerts} open item{status.openAlerts === 1 ? "" : "s"} on the Payments page.</span>}
          </dd>
          <dt className="text-ink-500">Direct Debit</dt>
          <dd className={ui.readable}>
            {canSwitch ? (
              <Switch
                checked={status.directDebitEnabled}
                onChange={(v) => !saving && setDirectDebit(v)}
                label="Monthly plan by Bacs Direct Debit"
                hint="Turn on only after Stripe has enabled Bacs Direct Debit on the account. Families on the monthly plan can then set up a mandate, and each monthly payment is collected on its due date."
              />
            ) : (
              <span>{status.directDebitEnabled ? "On" : "Off"}</span>
            )}
          </dd>
        </dl>
      )}
    </Section>
  );
}
