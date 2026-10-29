"use client";

import { useEffect, useMemo, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { StatTile } from "@/components/learn/Card";
import { METHOD_LABEL, STATUS_LABEL, STATUS_STYLE, chargeStatus, formatDate, round2, type ChargeStatus, type FeeCharge, type FeePayment } from "@/components/learn/fees/shared";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatGBP } from "@/lib/format";
import { FamilyWithdrawal } from "@/components/learn/fees/FamilyWithdrawal";
import { EmptyState } from "@/components/learn/ui";
import { FamilyFees } from "@/components/learn/FamilyFees";

type Kid = { id: string; name: string; year_groups?: { name: string } | null };
// Things to pay first (overdue, then due), then what is settled.
const STATUS_ORDER: Record<ChargeStatus, number> = { overdue: 0, outstanding: 1, paid: 2, void: 3 };

type Row = { charge: FeeCharge; childName: string; payments: FeePayment[]; paid: number; balance: number; status: ChargeStatus };

function FamilyFeesContent() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  const [kidList, setKidList] = useState<Kid[]>([]);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const [chargesRes, paymentsRes, kidsRes] = await Promise.all([
        supabase.from("fee_charges").select("id, parent_user_id, child_id, description, amount, due_date, voided_at, created_at").order("due_date", { ascending: false }),
        supabase.from("fee_payments").select("id, charge_id, amount, method, paid_on, reference, created_at").order("paid_on", { ascending: false }),
        supabase.from("children").select("id, name, year_groups(name)").order("name"),
      ]);
      if (chargesRes.error || paymentsRes.error) {
        setError(true);
        setRows([]);
        return;
      }
      const charges = ((chargesRes.data as unknown as FeeCharge[]) || []).map((c) => ({ ...c, amount: Number(c.amount) })).filter((c) => !c.voided_at);
      const payments = ((paymentsRes.data as unknown as FeePayment[]) || []).map((p) => ({ ...p, amount: Number(p.amount) }));
      const kidRows = (kidsRes.data as unknown as Kid[]) || [];
      setKidList(kidRows);
      const kids = new Map(kidRows.map((k) => [k.id, k.name]));
      setRows(
        charges
          .map((c) => {
            const pays = payments.filter((p) => p.charge_id === c.id);
            const paid = round2(pays.reduce((s, p) => s + p.amount, 0));
            return {
              charge: c,
              childName: c.child_id ? kids.get(c.child_id) || "" : "",
              payments: pays,
              paid,
              balance: Math.max(0, round2(c.amount - paid)),
              status: chargeStatus(c, paid),
            };
          })
          .sort(
            (a, b) =>
              STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.status === "paid" ? b.charge.due_date.localeCompare(a.charge.due_date) : a.charge.due_date.localeCompare(b.charge.due_date)),
          ),
      );
    })();
  }, [supabase]);

  const totals = useMemo(() => {
    const list = rows || [];
    return {
      billed: list.reduce((s, r) => s + r.charge.amount, 0),
      paid: list.reduce((s, r) => s + Math.min(r.paid, r.charge.amount), 0),
      balance: list.reduce((s, r) => s + r.balance, 0),
      overdue: list.filter((r) => r.status === "overdue").reduce((s, r) => s + r.balance, 0),
    };
  }, [rows]);

  return (
    <>
      <PageHeader crumbs={[{ label: "Home", href: "/family/dashboard" }, { label: "Fees" }]} title="Fees" subtitle="What has been charged, what you have paid, and what is still due." />
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">Could not load your fees. Please try again later.</p>}
      {rows === null && <p className="text-sm text-ink/65">Loading…</p>}
      {rows && rows.length === 0 && !error && (
        <EmptyState
          title="Nothing to pay"
          icon="wallet"
          tile="tile-green"
        >
          No fees have been charged to your family yet. Invoices and payment plans appear here once your child&apos;s place is confirmed.
        </EmptyState>
      )}
      {rows && rows.length > 0 && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Charged" value={formatGBP(totals.billed)} />
            <StatTile label="Paid" value={formatGBP(totals.paid)} />
            <StatTile label="Balance due" value={formatGBP(totals.balance)} status={totals.balance === 0 ? "ok" : undefined} />
            <StatTile label="Overdue" value={formatGBP(totals.overdue)} status={totals.overdue > 0 ? "warning" : "ok"} />
          </div>
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.charge.id} className="rounded-2xl border border-gold-light bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{r.charge.description}</p>
                    <p className="text-sm text-ink/65">{r.childName || "Whole family"}</p>
                    <p className="mt-0.5 text-xs text-ink/65">Due {formatDate(r.charge.due_date)}</p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                    <p className="mt-1 text-sm tabular-nums text-ink">
                      {formatGBP(r.paid)} <span className="text-ink/65">of {formatGBP(r.charge.amount)}</span>
                    </p>
                    {r.balance > 0 && <p className="text-xs font-medium tabular-nums text-ink/70">{formatGBP(r.balance)} to pay</p>}
                  </div>
                </div>
                {r.payments.length > 0 && (
                  <details className="mt-3 rounded-lg bg-cream text-sm">
                    <summary className="min-h-10 cursor-pointer px-3 py-2 font-medium text-ink/75">
                      {r.payments.length} payment{r.payments.length === 1 ? "" : "s"} recorded
                    </summary>
                    <ul className="divide-y divide-gold-light/60 border-t border-gold-light/60 px-3">
                      {r.payments.map((p) => (
                        <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                          <span className="text-ink/75">
                            {formatDate(p.paid_on)} · {METHOD_LABEL[p.method]}
                            {p.reference && ` · ${p.reference}`}
                          </span>
                          <span className="font-medium tabular-nums text-ink">{formatGBP(p.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink/65">Paid by bank transfer, cash or card? It appears here once the school office has recorded it. Contact the office with any billing query.</p>
        </>
      )}
      {kidList.length > 0 && <FamilyFees familyChildren={kidList} />}
      <FamilyWithdrawal />
    </>
  );
}

export default function FamilyFeesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <FamilyFeesContent />
      </LearnGate>
    </section>
  );
}
