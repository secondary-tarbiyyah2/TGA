"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loading, StatStrip, StatTile } from "@/components/learn/kit";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import {
  Button,
  EmptyState,
  Notice,
  Section,
  Status,
  ui,
} from "@/components/learn/ui";
import { getSupabaseClient } from "@/lib/supabase/client";
import { callEdgeFunction } from "@/lib/learn/edge";
import { ukToday } from "@/lib/learn/ukTime";
import { formatDueDate, formatPence } from "@/lib/payments/format";
import {
  CHARGE_STATUS,
  METHOD_TYPE_LABEL,
  PAYABLE_STATES,
  effectiveState,
  type ChargeState,
} from "@/lib/payments/status";
import { STORE_APP, STORE_APP_FEES_TEXT } from "@/lib/storeApp";
import { FamilyWithdrawal } from "@/components/learn/fees/FamilyWithdrawal";
import { FamilyFees } from "@/components/learn/FamilyFees";

type Kid = {
  id: string;
  name: string;
  pupil_number: string | null;
  year_groups?: { name: string } | null;
};
type Charge = {
  id: string;
  invoice_number: string;
  description: string;
  amount_pence: number;
  paid_pence: number;
  due_date: string;
  status: string;
  child_id: string | null;
  plan: string | null;
  fee_account_id: string | null;
};
type Payment = {
  id: string;
  charge_id: string;
  amount_pence: number;
  refunded_pence: number;
  paid_on: string;
  payment_method_type: string | null;
  reference: string | null;
};
type Account = { reference: string; dd_mandate_status: string | null };

const ERR: Record<string, string> = {
  payments_not_configured:
    "Online payment is being set up. Please try again later, or contact the school office.",
  nothing_to_pay: "There is nothing to pay just now.",
  charge_not_payable:
    "That payment has changed since the page loaded. Please refresh and try again.",
  amount_too_small:
    "That amount is too small to pay online. Please pay it with your next payment.",
  amount_too_large:
    "That is more than one online payment can take. Please pay each charge on its own.",
  direct_debit_off: "Direct Debit is not available yet.",
};

function FamilyFeesContent() {
  const supabase = getSupabaseClient();
  const params = useSearchParams();
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [kids, setKids] = useState<Kid[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [ddEnabled, setDdEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const today = ukToday();

  const load = useCallback(async () => {
    if (!supabase) return;
    const [c, p, k, a, s] = await Promise.all([
      supabase
        .from("fee_charges")
        .select(
          "id, invoice_number, description, amount_pence, paid_pence, due_date, status, child_id, plan, fee_account_id",
        )
        .is("voided_at", null)
        .order("due_date"),
      supabase
        .from("fee_payments")
        .select(
          "id, charge_id, amount_pence, refunded_pence, paid_on, payment_method_type, reference",
        )
        .order("paid_on", { ascending: false }),
      supabase
        .from("children")
        .select("id, name, pupil_number, year_groups(name)")
        .order("name"),
      supabase
        .from("fee_accounts")
        .select("reference, dd_mandate_status")
        .maybeSingle(),
      supabase
        .from("site_settings")
        .select("payments_direct_debit_enabled")
        .eq("id", true)
        .maybeSingle(),
    ]);
    if (c.error || p.error) {
      setLoadError(true);
      setCharges([]);
      return;
    }
    setCharges((c.data as unknown as Charge[]) || []);
    setPayments((p.data as unknown as Payment[]) || []);
    setKids((k.data as unknown as Kid[]) || []);
    setAccount((a.data as unknown as Account) || null);
    setDdEnabled(
      Boolean(
        (s.data as { payments_direct_debit_enabled?: boolean } | null)
          ?.payments_direct_debit_enabled,
      ),
    );
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const kidById = useMemo(() => new Map(kids.map((k) => [k.id, k])), [kids]);
  const rows = useMemo(
    () =>
      (charges || []).map((c) => ({
        ...c,
        state: effectiveState(c.status, c.due_date, today),
        balance: Math.max(0, c.amount_pence - c.paid_pence),
        kid: c.child_id ? kidById.get(c.child_id) : undefined,
      })),
    [charges, kidById, today],
  );
  const toPay = rows.filter(
    (r) => PAYABLE_STATES.includes(r.state) || r.state === "processing",
  );
  const settled = rows
    .filter((r) => !toPay.includes(r))
    .sort((a, b) => b.due_date.localeCompare(a.due_date));
  const dueNow = toPay.filter(
    (r) => PAYABLE_STATES.includes(r.state) && r.due_date <= today,
  );
  const dueNowPence = dueNow.reduce((s, r) => s + r.balance, 0);
  const overduePence = toPay
    .filter((r) => r.state === "overdue")
    .reduce((s, r) => s + r.balance, 0);
  const next = toPay.find(
    (r) => r.due_date > today && PAYABLE_STATES.includes(r.state),
  );
  const paidPence = payments.reduce(
    (s, p) => s + p.amount_pence - p.refunded_pence,
    0,
  );
  const hasMonthly = rows.some(
    (r) => r.plan === "monthly" && PAYABLE_STATES.includes(r.state),
  );

  const pay = async (chargeIds?: string[]) => {
    setBusy(chargeIds ? chargeIds[0] : "all");
    setError(null);
    const r = await callEdgeFunction(
      "payments-checkout",
      chargeIds ? { chargeIds } : {},
    );
    if (r.ok && typeof r.url === "string") {
      window.location.assign(r.url);
      return;
    }
    setBusy(null);
    setError(
      ERR[r.error || ""] ||
        "We could not open the payment page. Please try again in a moment.",
    );
  };

  const setUpDirectDebit = async () => {
    setBusy("dd");
    setError(null);
    const r = await callEdgeFunction("payments-checkout", {
      action: "setup_direct_debit",
    });
    if (r.ok && typeof r.url === "string") {
      window.location.assign(r.url);
      return;
    }
    setBusy(null);
    setError(
      ERR[r.error || ""] ||
        "We could not open the Direct Debit page. Please try again later.",
    );
  };

  const childLine = (r: (typeof rows)[number]) =>
    r.kid
      ? `${r.kid.name}${r.kid.pupil_number ? ` · ${r.kid.pupil_number}` : ""}`
      : "Whole family";

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Today", href: "/family/dashboard" },
          { label: "Fees" },
        ]}
        title="Fees"
        subtitle={
          account ? (
            <>
              Your family payment reference is{" "}
              <strong className="font-semibold text-ink">
                {account.reference}
              </strong>
              . Every charge has its own invoice number.
            </>
          ) : (
            "What is due, what you have paid, and the reference for each."
          )
        }
        action={
          !STORE_APP && dueNow.length > 1 ? (
            <Button
              variant="primary"
              icon="wallet"
              onClick={() => pay()}
              disabled={busy !== null}
            >
              {busy === "all"
                ? "Opening…"
                : `Pay all due (${formatPence(dueNowPence)})`}
            </Button>
          ) : undefined
        }
      />
      <div className={ui.stack}>
        {params.get("paid") === "1" && (
          <Notice tone="good">
            Thank you. Your payment has gone through. It shows as paid here
            within a few minutes (a bank payment can take a little longer), and
            Stripe emails you a receipt.
          </Notice>
        )}
        {params.get("paid") === "0" && (
          <Notice tone="info">
            The payment was not completed, so nothing has been taken. You can
            try again at any time.
          </Notice>
        )}
        {params.get("mandate") === "done" && (
          <Notice tone="good">
            Thank you. Your Direct Debit is being set up. Monthly payments will
            then be collected on the 28th.
          </Notice>
        )}
        {error && <Notice tone="bad">{error}</Notice>}
        {loadError && (
          <Notice tone="bad">
            Could not load your fees. Please try again later.
          </Notice>
        )}
        {STORE_APP && (
          <Notice tone="info">
            {STORE_APP_FEES_TEXT}: sign in at learn.tarbiyyah.co.uk in your
            browser to pay.
          </Notice>
        )}
        {charges === null && <Loading label="Loading your fees" bare />}

        {charges && rows.length === 0 && !loadError && (
          <EmptyState title="Nothing to pay" icon="wallet">
            No fees have been charged to your family yet. The first payment is
            due when you accept your child&apos;s place; your payment plan and
            every later payment then appear here, each with its reference.
          </EmptyState>
        )}

        {charges && rows.length > 0 && (
          <>
            <div data-guide="fees-figures">
              <StatStrip>
                <StatTile
                  label="Due now"
                  value={formatPence(dueNowPence)}
                  tone={dueNowPence > 0 ? "warn" : "neutral"}
                />
                <StatTile
                  label="Overdue"
                  value={formatPence(overduePence)}
                  tone={overduePence > 0 ? "bad" : "neutral"}
                />
                <StatTile
                  label="Next payment"
                  value={next ? formatPence(next.balance) : "None"}
                  hint={
                    next ? `due ${formatDueDate(next.due_date)}` : undefined
                  }
                />
                <StatTile label="Paid so far" value={formatPence(paidPence)} />
              </StatStrip>
            </div>

            <Section
              title="To pay"
              description="Pay one at a time, or everything due at once. You pay on Stripe's secure page, straight from your bank app or by card."
            >
              {toPay.length === 0 ? (
                <p className="text-sm text-ink/70">
                  Nothing to pay. Thank you.
                </p>
              ) : (
                <ul className="divide-y divide-gold-light">
                  {toPay.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{r.description}</p>
                        <p className="t-meta">
                          {childLine(r)} · {r.invoice_number}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-semibold tabular-nums text-ink">
                            {formatPence(r.balance)}
                          </p>
                          <p className="t-meta">
                            due {formatDueDate(r.due_date)}
                          </p>
                        </div>
                        <Status
                          kind={CHARGE_STATUS[r.state].kind}
                          className="w-24"
                        >
                          {CHARGE_STATUS[r.state].label}
                        </Status>
                        {!STORE_APP &&
                          PAYABLE_STATES.includes(r.state as ChargeState) && (
                            <Button
                              size="sm"
                              variant={
                                r.due_date <= today ? "primary" : "secondary"
                              }
                              onClick={() => pay([r.id])}
                              disabled={busy !== null}
                            >
                              {busy === r.id ? "Opening…" : "Pay now"}
                            </Button>
                          )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {!STORE_APP && toPay.some((r) => r.state === "processing") && (
                <p className="t-meta mt-3">
                  A payment marked Processing has been made and is waiting for
                  the bank to confirm it. Please do not pay it again.
                </p>
              )}
            </Section>

            {!STORE_APP &&
              ddEnabled &&
              hasMonthly &&
              account &&
              account.dd_mandate_status !== "active" &&
              account.dd_mandate_status !== "pending" && (
                <Section
                  title="Pay monthly by Direct Debit"
                  description="Set up a Bacs Direct Debit once, and each monthly payment is collected on the 28th. You are covered by the Direct Debit Guarantee."
                  action={
                    <Button onClick={setUpDirectDebit} disabled={busy !== null}>
                      {busy === "dd" ? "Opening…" : "Set up Direct Debit"}
                    </Button>
                  }
                >
                  <p className="text-sm text-ink/70">
                    You can still pay any month yourself above.
                  </p>
                </Section>
              )}
            {account?.dd_mandate_status === "active" && (
              <Notice tone="good">
                Your Direct Debit is active. Monthly payments are collected on
                the 28th.
              </Notice>
            )}

            {settled.length > 0 && (
              <Section title="Paid and settled">
                <ul className="divide-y divide-gold-light">
                  {settled.map((r) => {
                    const pays = payments.filter((p) => p.charge_id === r.id);
                    return (
                      <li key={r.id} className="py-3">
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-ink">
                              {r.description}
                            </p>
                            <p className="t-meta">
                              {childLine(r)} · {r.invoice_number}
                            </p>
                          </div>
                          <p className="font-semibold tabular-nums text-ink">
                            {formatPence(r.amount_pence)}
                          </p>
                          <Status
                            kind={CHARGE_STATUS[r.state].kind}
                            className="w-24"
                          >
                            {CHARGE_STATUS[r.state].label}
                          </Status>
                        </div>
                        {pays.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {pays.map((p) => (
                              <li key={p.id} className="t-meta">
                                {formatPence(p.amount_pence)} paid{" "}
                                {formatDueDate(p.paid_on)}
                                {p.payment_method_type
                                  ? ` by ${METHOD_TYPE_LABEL[p.payment_method_type] || "online payment"}`
                                  : ""}
                                {p.refunded_pence > 0
                                  ? `, ${formatPence(p.refunded_pence)} refunded`
                                  : ""}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Section>
            )}
          </>
        )}
        {kids.length > 0 && <FamilyFees familyChildren={kids} />}
        <FamilyWithdrawal />
      </div>
    </>
  );
}

export default function FamilyFeesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <Suspense fallback={<Loading label="Loading your fees" bare />}>
          <FamilyFeesContent />
        </Suspense>
      </LearnGate>
    </section>
  );
}
