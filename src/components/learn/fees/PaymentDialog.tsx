"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatGBP } from "@/lib/format";
import { parsePounds, round2, todayIso } from "./shared";
import { Button, Field, Notice, ui } from "@/components/learn/ui";
import { Dialog } from "@/components/learn/kit";

/**
 * Record a payment by hand: for exceptional cases only (owner, 11 Nov 2026:
 * payments are made online through Stripe and nowhere else). Stripe payments
 * made in the portal or from an email link are recorded automatically. This is
 * for a Stripe payment the system could not match, for example one made with
 * the old shared payment link. It needs the Stripe reference and a reason, and
 * goes through fee_record_manual_payment (head teacher or admin, audited).
 */
export function PaymentDialog({
  chargeId,
  title,
  balance,
  fullPayment,
  onClose,
  onDone,
}: {
  chargeId: string;
  title: string;
  balance: number;
  fullPayment: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const supabase = getSupabaseClient();
  const [amount, setAmount] = useState(fullPayment ? balance.toFixed(2) : "");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = todayIso();
  const value = round2(parsePounds(amount));
  const future = !!paidOn && paidOn > today;
  const refOk = /^(pi|ch|py|cs)_[A-Za-z0-9_]+$/.test(reference.trim());
  const valid = value > 0 && value <= balance && !!paidOn && !future && refOk && reason.trim().length >= 5;

  const save = async () => {
    if (!supabase || !valid) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("fee_record_manual_payment", {
      p_charge: chargeId,
      p_amount_pence: Math.round(value * 100),
      p_stripe_reference: reference.trim(),
      p_reason: reason.trim(),
      p_paid_on: paidOn,
    });
    setBusy(false);
    if (err) {
      setError(err.message || "Could not record the payment, please try again.");
      return;
    }
    onDone();
  };

  return (
    <Dialog
      title={fullPayment ? "Record a Stripe payment" : "Record part of a Stripe payment"}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!valid || busy}>
            {busy ? "Saving…" : "Record payment"}
          </Button>
        </>
      }
    >
      <p className="t-meta">
        {title} · balance {formatGBP(balance)}
      </p>
      <div className="mt-4 space-y-3">
        <Notice tone="warn">Only for a Stripe payment that was not matched automatically. Payments made in the portal or from an email link are recorded on their own.</Notice>
        <Field label="Amount (£)" htmlFor="pay-amount" error={value > balance ? `More than the ${formatGBP(balance)} outstanding.` : amount.trim() !== "" && !(value > 0) ? "Enter an amount in pounds, for example 304.29." : undefined}>
          <input id="pay-amount" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={ui.input} placeholder="e.g. 304.29" />
        </Field>
        <Field label="Stripe payment reference" htmlFor="pay-ref" hint="From the payment in the Stripe dashboard: starts pi_, py_, ch_ or cs_." error={reference.trim() && !refOk ? "That does not look like a Stripe reference." : undefined}>
          <input id="pay-ref" type="text" value={reference} onChange={(e) => setReference(e.target.value)} className={ui.input} placeholder="pi_..." />
        </Field>
        <Field label="Date received" htmlFor="pay-date" error={future ? "The date received cannot be in the future." : undefined}>
          <input id="pay-date" type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} className={ui.input} />
        </Field>
        <Field label="Reason" htmlFor="pay-reason" hint="Why this is being recorded by hand. Kept in the audit log.">
          <textarea id="pay-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={ui.textarea} />
        </Field>
        {error && <Notice tone="bad">{error}</Notice>}
      </div>
    </Dialog>
  );
}
