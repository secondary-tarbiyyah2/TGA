"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/learn/PageHeader";
import { Button, EmptyState, Field, Notice, Section, Status, ui } from "@/components/learn/ui";
import { Dialog, Loading, SidePanel, askConfirm } from "@/components/learn/kit";
import { Select } from "@/components/learn/Select";
import { Tabs } from "@/components/learn/Tabs";
import { PaymentDialog } from "@/components/learn/fees/PaymentDialog";
import { csvEscape } from "@/components/learn/fees/shared";
import { getSupabaseClient } from "@/lib/supabase/client";
import { callEdgeFunction } from "@/lib/learn/edge";
import { useLearnPermission } from "@/lib/learn/session";
import { ukToday } from "@/lib/learn/ukTime";
import { formatDueDate, formatPence } from "@/lib/payments/format";
import { CHARGE_STATES, CHARGE_STATUS, KIND_LABEL, METHOD_TYPE_LABEL, PAYABLE_STATES, PLAN_LABEL, effectiveState, type ChargeState } from "@/lib/payments/status";
import { stripeDashboardUrl, stripeIdOf, type StripeMode } from "@/lib/payments/stripeLinks";

/**
 * Fees > Payments (T71): every charge and every payment, so the office can
 * see at a glance that everything is accounted for. Head teacher and admin
 * only (the page's LearnGate, and RLS on every table it reads).
 */

export type ChargeRow = {
  id: string;
  invoice_number: string;
  description: string;
  amount_pence: number;
  paid_pence: number;
  balance_pence: number;
  due_date: string;
  status: string;
  kind: string;
  plan: string | null;
  instalment_no: number | null;
  instalment_count: number | null;
  voided_at: string | null;
  waived_reason: string | null;
  fee_account_id: string | null;
  family_reference: string | null;
  billing_name: string | null;
  billing_email: string | null;
  stripe_customer_id: string | null;
  child_id: string | null;
  pupil_number: string | null;
  pupil_name: string | null;
  year_group_label: string | null;
  application_reference: string | null;
};

export type PaymentRow = {
  id: string;
  charge_id: string;
  amount_pence: number;
  refunded_pence: number;
  paid_on: string;
  method: string;
  payment_method_type: string | null;
  stripe_payment_intent_id: string | null;
  stripe_fee_pence: number | null;
  net_pence: number | null;
  disputed: boolean;
  livemode: boolean | null;
  reference: string | null;
  recorded_reason: string | null;
};

export type AlertRow = { id: string; kind: string; urgency: "now" | "soon" | "info"; title: string; detail: string | null; stripe_object_id: string | null; livemode: boolean | null; created_at: string; charge_id: string | null };
type Run = { ran_at: string; ok: boolean; summary: { missingHere?: number; missingInStripe?: number; amountDiffs?: number; payoutsFailed?: number; stripePayments?: number } };

const PAGE = 60;

export function PaymentsBoard() {
  const supabase = getSupabaseClient();
  const canExport = useLearnPermission("can_export_data");
  const [charges, setCharges] = useState<ChargeRow[] | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [mode, setMode] = useState<StripeMode>(null);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<"charges" | "received">("charges");
  const [status, setStatus] = useState<"all" | "open" | ChargeState>("open");
  const [year, setYear] = useState("all");
  const [plan, setPlan] = useState("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<(ChargeRow & { state: ChargeState }) | null>(null);
  const [recording, setRecording] = useState<ChargeRow | null>(null);
  const [waiving, setWaiving] = useState<ChargeRow | null>(null);
  const [planning, setPlanning] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const today = ukToday();

  const load = useCallback(async () => {
    if (!supabase) return;
    const [c, p, a, r, s] = await Promise.all([
      supabase.from("fee_charges_finance").select("*").order("due_date", { ascending: true }).limit(5000),
      supabase.from("fee_payments").select("id, charge_id, amount_pence, refunded_pence, paid_on, method, payment_method_type, stripe_payment_intent_id, stripe_fee_pence, net_pence, disputed, livemode, reference, recorded_reason").order("paid_on", { ascending: false }).limit(5000),
      supabase.from("payment_alerts").select("id, kind, urgency, title, detail, stripe_object_id, livemode, created_at, charge_id").is("resolved_at", null).order("created_at", { ascending: false }).limit(200),
      supabase.from("payment_reconciliation_runs").select("ran_at, ok, summary").order("ran_at", { ascending: false }).limit(1).maybeSingle(),
      callEdgeFunction("payments-admin", { action: "status" }),
    ]);
    if (c.error || p.error) {
      setLoadError(true);
      setCharges([]);
      return;
    }
    setLoadError(false);
    setCharges((c.data as unknown as ChargeRow[]) || []);
    setPayments((p.data as unknown as PaymentRow[]) || []);
    setAlerts((a.data as unknown as AlertRow[]) || []);
    setRun((r.data as unknown as Run) || null);
    if (s.ok) setMode(((s.stripe as { mode?: StripeMode } | undefined)?.mode as StripeMode) ?? null);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const rows = useMemo(() => (charges || []).map((c) => ({ ...c, state: c.voided_at ? ("void" as ChargeState) : effectiveState(c.status, c.due_date, today) })), [charges, today]);
  const live = rows.filter((r) => r.state !== "void" && r.state !== "waived");
  const expected = live.reduce((s, r) => s + r.amount_pence, 0);
  const received = live.reduce((s, r) => s + Math.min(r.paid_pence, r.amount_pence), 0);
  const outstanding = Math.max(0, expected - received);
  const overdue = live.filter((r) => r.state === "overdue").reduce((s, r) => s + r.balance_pence, 0);
  const dueNow = live.filter((r) => PAYABLE_STATES.includes(r.state) && r.due_date <= today).reduce((s, r) => s + r.balance_pence, 0);
  const years = useMemo(() => Array.from(new Set(rows.map((r) => r.year_group_label).filter(Boolean) as string[])).sort(), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "open" && !(PAYABLE_STATES.includes(r.state) || r.state === "processing")) return false;
      if (status !== "all" && status !== "open" && r.state !== status) return false;
      if (year !== "all" && r.year_group_label !== year) return false;
      if (plan !== "all" && (plan === "none" ? r.plan : r.plan !== plan)) return false;
      if (needle) {
        const hay = [r.family_reference, r.invoice_number, r.pupil_number, r.pupil_name, r.billing_name, r.billing_email, r.application_reference, r.description].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, status, year, plan, q]);

  const chargeById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const receivedRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return payments.filter((p) => {
      if (!needle) return true;
      const c = chargeById.get(p.charge_id);
      return [c?.family_reference, c?.invoice_number, c?.pupil_number, c?.pupil_name, c?.billing_name, p.stripe_payment_intent_id, p.reference].join(" ").toLowerCase().includes(needle);
    });
  }, [payments, chargeById, q]);

  const exportCsv = () => {
    const header = ["Invoice", "Family reference", "Family", "Email", "Pupil", "Pupil number", "Year group", "Description", "Kind", "Plan", "Due date", "Amount", "Paid", "Balance", "Status", "Stripe payments"];
    const lines = filtered.map((r) =>
      [
        r.invoice_number,
        r.family_reference || "",
        r.billing_name || "",
        r.billing_email || "",
        r.pupil_name || "",
        r.pupil_number || "",
        r.year_group_label || "",
        r.description,
        KIND_LABEL[r.kind] || r.kind,
        r.plan ? PLAN_LABEL[r.plan] : "",
        r.due_date,
        (r.amount_pence / 100).toFixed(2),
        (r.paid_pence / 100).toFixed(2),
        (r.balance_pence / 100).toFixed(2),
        CHARGE_STATUS[r.state].label,
        payments
          .filter((p) => p.charge_id === r.id)
          .map((p) => p.stripe_payment_intent_id || p.reference || "")
          .join(" "),
      ]
        .map(csvEscape)
        .join(","),
    );
    const blob = new Blob([[header.map(csvEscape).join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resolveAlert = async (a: AlertRow) => {
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("payment_alerts").update({ resolved_at: new Date().toISOString(), resolved_by: user?.id ?? null }).eq("id", a.id);
    if (error) setNotice({ text: "Could not mark it resolved. Please try again.", ok: false });
    else setAlerts((list) => list.filter((x) => x.id !== a.id));
  };

  const voidCharge = async (r: ChargeRow) => {
    if (!supabase || !(await askConfirm(`Cancel ${r.invoice_number} (${r.description})? It will no longer be owed. Payments already made are kept.`))) return;
    const { error } = await supabase.from("fee_charges").update({ voided_at: new Date().toISOString() }).eq("id", r.id);
    setNotice(error ? { text: "Could not cancel the charge.", ok: false } : { text: `${r.invoice_number} cancelled.`, ok: true });
    setOpen(null);
    load();
  };

  const openStates: { key: "open" | "all" | ChargeState; label: string }[] = [
    { key: "open", label: "To be paid" },
    { key: "all", label: "All" },
    ...CHARGE_STATES.map((s) => ({ key: s, label: CHARGE_STATUS[s].label })),
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "School office" }, { label: "Payments" }]}
        title="Payments"
        subtitle="Every charge and every Stripe payment, with its references, so you can see that everything has been paid and accounted for."
        figures={[
          { value: formatPence(expected), label: "expected" },
          { value: formatPence(received), label: "received" },
          { value: formatPence(outstanding), label: "outstanding" },
          { value: formatPence(dueNow), label: "due now", onClick: () => setStatus("open") },
          { value: formatPence(overdue), label: "overdue", tone: overdue > 0 ? "warn" : undefined, onClick: () => setStatus("overdue") },
        ]}
        actions={
          canExport && rows.length > 0 ? (
            <Button icon="download" onClick={exportCsv}>
              Export CSV
            </Button>
          ) : undefined
        }
        action={
          <Button variant="primary" icon="plus" onClick={() => setPlanning(true)}>
            Set a payment plan
          </Button>
        }
      />
      <div className={ui.stack}>
        {notice && <Notice tone={notice.ok ? "good" : "bad"}>{notice.text}</Notice>}
        {loadError && <Notice tone="bad">Could not load payments. Please refresh the page.</Notice>}
        {mode === null && charges !== null && <Notice tone="warn">Stripe is not connected yet, so families cannot pay online. See Admissions settings, Payments.</Notice>}

        {alerts.length > 0 && (
          <Section title={`Needs checking (${alerts.length})`} description="From Stripe and the daily check. Deal with each one, then mark it resolved.">
            <ul className="divide-y divide-gold-light">
              {alerts.map((a) => {
                const sid = stripeIdOf(a.stripe_object_id);
                return (
                  <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <Status kind={a.urgency === "now" ? "overdue" : a.urgency === "soon" ? "attention" : "pending"}>{a.title}</Status>
                      {a.detail && <p className="t-meta mt-1">{a.detail}</p>}
                      <p className="t-meta mt-0.5">{new Date(a.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {sid && (
                        <a href={stripeDashboardUrl(sid, mode, a.livemode)} target="_blank" rel="noopener noreferrer" className={btnSm}>
                          Open in Stripe<span className="sr-only"> (new tab)</span>
                        </a>
                      )}
                      <Button size="sm" onClick={() => resolveAlert(a)}>
                        Resolved
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {run && (
          <p className="t-meta">
            Last check against Stripe: {new Date(run.ran_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.{" "}
            {run.ok ? "Everything matched." : `${(run.summary.missingHere || 0) + (run.summary.missingInStripe || 0) + (run.summary.amountDiffs || 0) + (run.summary.payoutsFailed || 0)} to check (listed above).`}
          </p>
        )}

        <div className={ui.toolbar}>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Family reference, invoice, pupil number or name" aria-label="Search payments" data-guide="payments-search" className={`${ui.input} min-w-0 flex-1 sm:max-w-sm`} />
          {view === "charges" && (
            <>
              <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status" className={`${ui.select} !w-auto`}>
                {openStates.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <Select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year group" className={`${ui.select} !w-auto`}>
                <option value="all">All year groups</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
              <Select value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plan" className={`${ui.select} !w-auto`}>
                <option value="all">All plans</option>
                <option value="annual">Paid in full</option>
                <option value="termly">Two payments</option>
                <option value="monthly">Monthly</option>
                <option value="none">No plan (fees and other)</option>
              </Select>
            </>
          )}
          <Tabs
            variant="switch"
            items={[
              { key: "charges", label: "Charges" },
              { key: "received", label: "Received" },
            ]}
            value={view}
            onChange={setView}
            label="Payments view"
            className="sm:ml-auto"
          />
        </div>

        {charges === null && <Loading label="Loading payments" />}
        {charges && rows.length === 0 && !loadError && (
          <EmptyState title="No charges yet" icon="receipt">
            Charges appear here as soon as families apply (the application fee) and choose a payment plan.
          </EmptyState>
        )}

        {charges && rows.length > 0 && view === "charges" && (
          <>
            {filtered.length === 0 ? (
              <p className="t-meta">Nothing matches those filters.</p>
            ) : (
              <div className="overflow-hidden rounded-[10px] border border-gold-light bg-white">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="hidden bg-cream text-ink-500 md:table-header-group">
                    <tr>
                      <th className="px-4 py-2 font-medium">Invoice</th>
                      <th className="px-4 py-2 font-medium">Family</th>
                      <th className="px-4 py-2 font-medium">Pupil</th>
                      <th className="px-4 py-2 font-medium">Due</th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                      <th className="px-4 py-2 text-right font-medium">Balance</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, limit).map((r) => (
                      <tr key={r.id} onClick={() => setOpen(r)} className="block cursor-pointer border-t border-gold-light px-4 py-3 first:border-t-0 hover:bg-[var(--portal-hover)] md:table-row md:p-0">
                        <td className="block md:table-cell md:px-4 md:py-2.5">
                          <button type="button" onClick={() => setOpen(r)} className="text-left font-medium text-forest-700 hover:underline">
                            {r.invoice_number}
                          </button>
                          <span className="t-meta block">{r.description}</span>
                        </td>
                        <td className="block md:table-cell md:px-4 md:py-2.5">
                          <span className="text-ink">{r.billing_name || "Unknown"}</span>
                          <span className="t-meta block">{r.family_reference}</span>
                        </td>
                        <td className="block md:table-cell md:px-4 md:py-2.5">
                          <span className="text-ink">{r.pupil_name || "Whole family"}</span>
                          <span className="t-meta block">{[r.pupil_number || r.application_reference, r.year_group_label].filter(Boolean).join(" · ")}</span>
                        </td>
                        <td className="inline-block pr-4 md:table-cell md:px-4 md:py-2.5 md:whitespace-nowrap">{formatDueDate(r.due_date)}</td>
                        <td className="inline-block pr-4 tabular-nums md:table-cell md:px-4 md:py-2.5 md:text-right">{formatPence(r.amount_pence)}</td>
                        <td className="inline-block pr-4 font-semibold tabular-nums md:table-cell md:px-4 md:py-2.5 md:text-right">{r.balance_pence > 0 && r.state !== "void" && r.state !== "waived" ? formatPence(r.balance_pence) : "None"}</td>
                        <td className="inline-block md:table-cell md:px-4 md:py-2.5">
                          <Status kind={CHARGE_STATUS[r.state].kind}>{CHARGE_STATUS[r.state].label}</Status>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {filtered.length > limit && (
              <div className="flex items-center gap-3">
                <span className="t-meta">
                  Showing {limit} of {filtered.length}.
                </span>
                <Button size="sm" onClick={() => setLimit((n) => n + PAGE)}>
                  Show more
                </Button>
              </div>
            )}
          </>
        )}

        {charges && view === "received" && (
          <div className="overflow-hidden rounded-[10px] border border-gold-light bg-white">
            {receivedRows.length === 0 ? (
              <p className="t-meta p-4">No payments received yet.</p>
            ) : (
              <ul className="divide-y divide-gold-light">
                {receivedRows.slice(0, limit).map((p) => {
                  const c = chargeById.get(p.charge_id);
                  return (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-ink">
                          {formatPence(p.amount_pence)} for <span className="font-medium">{c?.invoice_number || "a charge"}</span>
                          {p.refunded_pence > 0 && <span className="text-red-800"> ({formatPence(p.refunded_pence)} refunded)</span>}
                          {p.disputed && <span className="text-red-800"> (disputed)</span>}
                        </p>
                        <p className="t-meta">
                          {[c?.billing_name, c?.family_reference, formatDueDate(p.paid_on), p.payment_method_type ? METHOD_TYPE_LABEL[p.payment_method_type] : p.recorded_reason ? "Recorded by hand" : "Online", p.stripe_fee_pence != null ? `Stripe fee ${formatPence(p.stripe_fee_pence)}` : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {(p.stripe_payment_intent_id || stripeIdOf(p.reference)) && (
                        <a href={stripeDashboardUrl((p.stripe_payment_intent_id || stripeIdOf(p.reference))!, mode, p.livemode)} target="_blank" rel="noopener noreferrer" className={btnSm}>
                          Stripe<span className="sr-only"> payment (new tab)</span>
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {open && (
        <ChargePanel
          charge={rows.find((r) => r.id === open.id) || open}
          payments={payments.filter((p) => p.charge_id === open.id)}
          mode={mode}
          onClose={() => setOpen(null)}
          onRecord={() => setRecording(open)}
          onWaive={() => setWaiving(open)}
          onVoid={() => voidCharge(open)}
        />
      )}
      {recording && (
        <PaymentDialog
          chargeId={recording.id}
          title={`${recording.invoice_number} · ${recording.billing_name || ""}`}
          balance={recording.balance_pence / 100}
          fullPayment
          onClose={() => setRecording(null)}
          onDone={() => {
            setRecording(null);
            setOpen(null);
            setNotice({ text: "Payment recorded.", ok: true });
            load();
          }}
        />
      )}
      {waiving && (
        <WaiveDialog
          charge={waiving}
          onClose={() => setWaiving(null)}
          onDone={() => {
            setWaiving(null);
            setOpen(null);
            setNotice({ text: `${waiving.invoice_number} waived.`, ok: true });
            load();
          }}
        />
      )}
      {planning && (
        <PlanDialog
          onClose={() => setPlanning(false)}
          onDone={(n) => {
            setPlanning(false);
            setNotice({ text: `${n} charge${n === 1 ? "" : "s"} created.`, ok: true });
            load();
          }}
        />
      )}
    </>
  );
}

const btnSm = `${ui.btnSecondary} ${ui.sm}`;

function ChargePanel({ charge, payments, mode, onClose, onRecord, onWaive, onVoid }: { charge: ChargeRow & { state: ChargeState }; payments: PaymentRow[]; mode: StripeMode; onClose: () => void; onRecord: () => void; onWaive: () => void; onVoid: () => void }) {
  const settled = ["paid", "void", "waived", "refunded"].includes(charge.state);
  return (
    <SidePanel
      title={charge.invoice_number}
      eyebrow="Charge"
      onClose={onClose}
      footer={
        !settled ? (
          <>
            <Button variant="ghost" onClick={onVoid}>
              Cancel charge
            </Button>
            <Button onClick={onWaive}>Waive</Button>
            <Button variant="primary" onClick={onRecord}>
              Record Stripe payment
            </Button>
          </>
        ) : undefined
      }
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-ink-500">Status</dt>
        <dd>
          <Status kind={CHARGE_STATUS[charge.state].kind}>{CHARGE_STATUS[charge.state].label}</Status>
        </dd>
        <dt className="text-ink-500">For</dt>
        <dd className="text-ink">{charge.description}</dd>
        <dt className="text-ink-500">Family</dt>
        <dd className="text-ink">
          {charge.billing_name} · {charge.family_reference}
          {charge.billing_email && <span className="t-meta block">{charge.billing_email}</span>}
        </dd>
        <dt className="text-ink-500">Pupil</dt>
        <dd className="text-ink">
          {charge.pupil_name || "Whole family"}
          <span className="t-meta block">{[charge.pupil_number, charge.application_reference, charge.year_group_label].filter(Boolean).join(" · ")}</span>
        </dd>
        <dt className="text-ink-500">Plan</dt>
        <dd className="text-ink">{charge.plan ? `${PLAN_LABEL[charge.plan]}${charge.instalment_no ? `, payment ${charge.instalment_no} of ${charge.instalment_count}` : ""}` : KIND_LABEL[charge.kind] || "Other"}</dd>
        <dt className="text-ink-500">Due</dt>
        <dd className="text-ink">{formatDueDate(charge.due_date)}</dd>
        <dt className="text-ink-500">Amount</dt>
        <dd className="tabular-nums text-ink">{formatPence(charge.amount_pence)}</dd>
        <dt className="text-ink-500">Paid</dt>
        <dd className="tabular-nums text-ink">{formatPence(charge.paid_pence)}</dd>
        {charge.waived_reason && (
          <>
            <dt className="text-ink-500">Waived</dt>
            <dd className="text-ink">{charge.waived_reason}</dd>
          </>
        )}
      </dl>
      <h3 className="t-section mt-6">Payments</h3>
      {payments.length === 0 ? (
        <p className="t-meta mt-1">None yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-gold-light text-sm">
          {payments.map((p) => {
            const sid = p.stripe_payment_intent_id || stripeIdOf(p.reference);
            return (
              <li key={p.id} className="py-2">
                <p className="text-ink">
                  {formatPence(p.amount_pence)} on {formatDueDate(p.paid_on)}
                  {p.payment_method_type ? ` by ${METHOD_TYPE_LABEL[p.payment_method_type]}` : ""}
                  {p.refunded_pence > 0 ? `, ${formatPence(p.refunded_pence)} refunded` : ""}
                  {p.disputed ? ", disputed" : ""}
                </p>
                <p className="t-meta">
                  {[p.stripe_fee_pence != null ? `Stripe fee ${formatPence(p.stripe_fee_pence)}` : null, p.net_pence != null ? `net ${formatPence(p.net_pence)}` : null, p.recorded_reason ? `Recorded by hand: ${p.recorded_reason}` : null].filter(Boolean).join(" · ")}
                </p>
                {sid && (
                  <a href={stripeDashboardUrl(sid, mode, p.livemode)} target="_blank" rel="noopener noreferrer" className={`${ui.btnLink} mt-1`}>
                    Open {sid} in Stripe<span className="sr-only"> (new tab)</span>
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {charge.stripe_customer_id && (
        <a href={stripeDashboardUrl(charge.stripe_customer_id, mode)} target="_blank" rel="noopener noreferrer" className={`${ui.btnLink} mt-4`}>
          The family in Stripe<span className="sr-only"> (new tab)</span>
        </a>
      )}
    </SidePanel>
  );
}

function WaiveDialog({ charge, onClose, onDone }: { charge: ChargeRow; onClose: () => void; onDone: () => void }) {
  const supabase = getSupabaseClient();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!supabase) return;
    setBusy(true);
    const { error: err } = await supabase.rpc("fee_charge_waive", { p_charge: charge.id, p_reason: reason.trim() });
    setBusy(false);
    if (err) setError(err.message);
    else onDone();
  };
  return (
    <Dialog
      title={`Waive ${charge.invoice_number}`}
      description={`${charge.description}: ${formatPence(charge.balance_pence)} would no longer be owed.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || reason.trim().length < 3}>
            {busy ? "Saving…" : "Waive"}
          </Button>
        </>
      }
    >
      <Field label="Reason" htmlFor="waive-reason" hint="For example a bursary the head teacher agreed. Kept in the audit log.">
        <textarea id="waive-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={ui.textarea} />
      </Field>
      {error && (
        <div className="mt-3">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
    </Dialog>
  );
}

type OfferApp = { id: string; reference: string; child_first_name: string; child_last_name: string; year_group_applying: string; status: string };

function PlanDialog({ onClose, onDone }: { onClose: () => void; onDone: (n: number) => void }) {
  const supabase = getSupabaseClient();
  const [apps, setApps] = useState<OfferApp[] | null>(null);
  const [appId, setAppId] = useState("");
  const [plan, setPlan] = useState("monthly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("admissions_applications")
      .select("id, reference, child_first_name, child_last_name, year_group_applying, status")
      .in("status", ["offered", "accepted"])
      .order("child_first_name")
      .then(({ data }) => setApps((data as unknown as OfferApp[]) || []));
  }, [supabase]);
  const ERR: Record<string, string> = {
    plan_locked: "This child's plan already has a payment made or in progress, so it cannot be changed.",
    no_fee_band: "There is no fee band for this year group.",
    not_offered: "Only an offered or accepted place can have a plan.",
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await callEdgeFunction("payments-admin", { action: "generate_plan", applicationId: appId, plan });
    setBusy(false);
    if (r.ok) onDone(Array.isArray(r.chargeIds) && r.created ? r.chargeIds.length : 0);
    else setError(ERR[r.error || ""] || r.error || "Could not set the plan.");
  };
  return (
    <Dialog
      title="Set a payment plan"
      description="Usually the family chooses this on their payment page. Use this when they tell you their choice another way. The charges are made from the fee bands and sibling discount."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !appId}>
            {busy ? "Saving…" : "Make the charges"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Pupil (offered places)" htmlFor="plan-app">
          <Select id="plan-app" value={appId} onChange={(e) => setAppId(e.target.value)} className={ui.select}>
            <option value="">{apps === null ? "Loading…" : apps.length ? "Choose a pupil" : "No offered places"}</option>
            {(apps || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.child_first_name} {a.child_last_name}, {a.year_group_applying} ({a.reference})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Plan" htmlFor="plan-choice">
          <Select id="plan-choice" value={plan} onChange={(e) => setPlan(e.target.value)} className={ui.select}>
            <option value="annual">Pay in full (2% off)</option>
            <option value="termly">Two payments</option>
            <option value="monthly">Seven monthly payments</option>
          </Select>
        </Field>
        {error && <Notice tone="bad">{error}</Notice>}
      </div>
    </Dialog>
  );
}
