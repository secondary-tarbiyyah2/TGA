"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatGBP } from "@/lib/format";
import { METHOD_LABEL, round2, todayIso, type PaymentMethod } from "./shared";

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
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = round2(Number(amount));
  const valid = value > 0 && value <= balance && !!paidOn;

  const save = async () => {
    if (!supabase || !valid) return;
    setBusy(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("fee_payments").insert({
      charge_id: chargeId,
      amount: value,
      method,
      paid_on: paidOn,
      reference: reference.trim() || null,
      recorded_by: user?.id ?? null,
    });
    setBusy(false);
    if (err) {
      setError("Could not record the payment — please try again.");
      return;
    }
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-gold-light bg-white p-5 sm:rounded-2xl">
        <h2 className="text-lg font-semibold text-ink">{fullPayment ? "Mark as paid" : "Record payment"}</h2>
        <p className="mt-0.5 text-sm text-ink/60">
          {title} · balance {formatGBP(balance)}
        </p>
        <div className="mt-4 space-y-3 text-sm">
          <label className="block">
            <span className="text-ink/70">Amount (£)</span>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2" />
            {value > balance && <span className="mt-1 block text-xs text-red-700">More than the {formatGBP(balance)} outstanding.</span>}
          </label>
          <div>
            <span className="text-ink/70">Method</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={method === m}
                  onClick={() => setMethod(m)}
                  className={`rounded-full border px-3 py-1.5 font-medium ${method === m ? "border-teal-700 bg-teal-700 text-white" : "border-gold-light bg-white text-ink/70 hover:bg-cream"}`}
                >
                  {METHOD_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-ink/70">Date received</span>
            <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-ink/70">Reference (optional)</span>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2" placeholder="Bank ref, receipt no." />
          </label>
          {error && <p className="text-red-700">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/80 hover:bg-cream">
            Cancel
          </button>
          <button type="button" disabled={!valid || busy} onClick={save} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
            {busy ? "Saving…" : "Save payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
