"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { StatTile } from "@/components/learn/Card";
import { NewChargeDialog, type ChildOpt, type ClassOpt, type EnrolmentOpt, type FamilyOpt, type YearGroupOpt } from "@/components/learn/fees/NewChargeDialog";
import { PaymentDialog } from "@/components/learn/fees/PaymentDialog";
import {
  METHOD_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
  chargeStatus,
  csvEscape,
  formatDate,
  round2,
  type ChargeStatus,
  type FeeCharge,
  type FeePayment,
} from "@/components/learn/fees/shared";
import { useLearnPermission } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getFeeBands } from "@/lib/content";
import { formatGBP } from "@/lib/format";
import type { FeeBand } from "@/content/seed";
import { Tabs } from "@/components/learn/Tabs";
import { WithdrawalNoticesAdmin } from "@/components/learn/fees/WithdrawalNoticesAdmin";
import { Button, EmptyState, btn, ui } from "@/components/learn/ui";
import { Select } from "@/components/learn/Select";

import { askConfirm } from "@/components/learn/kit";
type Row = {
  charge: FeeCharge;
  familyName: string;
  email: string;
  childName: string;
  yearGroup: string;
  payments: FeePayment[];
  paid: number;
  balance: number;
  status: ChargeStatus;
};

type Profile = { id: string; full_name: string | null; email: string | null };
type ChildRow = { id: string; name: string; parent_user_id: string; year_group_id: string | null; year_groups: { name: string } | null };

const inputCls = `${ui.select} !w-auto`;
/** Charges shown before "Show more", so a long history stays quick to scan. */
const PAGE = 50;

function FeesContent() {
  const supabase = getSupabaseClient();
  const canExport = useLearnPermission("can_export_data");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [families, setFamilies] = useState<FamilyOpt[]>([]);
  const [children, setChildren] = useState<ChildOpt[]>([]);
  const [yearGroups, setYearGroups] = useState<YearGroupOpt[]>([]);
  const [classes, setClasses] = useState<ClassOpt[]>([]);
  const [enrolments, setEnrolments] = useState<EnrolmentOpt[]>([]);
  const [feeBands, setFeeBands] = useState<FeeBand[]>([]);
  const [view, setView] = useState<"charges" | "families">("charges");
  const [statusFilter, setStatusFilter] = useState<"all" | ChargeStatus>("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState<{ id: string; name: string } | null>(null);
  const [sort, setSort] = useState<"due_desc" | "due_asc" | "balance">("due_desc");
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<{ row: Row; full: boolean } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notice, setNoticeState] = useState<{ text: string; ok: boolean } | null>(null);
  const setNotice = (text: string | null, ok = true) => setNoticeState(text ? { text, ok } : null);
  const [limit, setLimit] = useState(PAGE);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [bands, chargesRes, paymentsRes, childrenRes, ygRes, classRes, enrolRes] = await Promise.all([
      getFeeBands(),
      supabase.from("fee_charges").select("id, parent_user_id, child_id, description, amount, due_date, voided_at, created_at").order("due_date", { ascending: false }),
      supabase.from("fee_payments").select("id, charge_id, amount, method, paid_on, reference, created_at").order("paid_on", { ascending: false }),
      supabase.from("children").select("id, name, parent_user_id, year_group_id, year_groups(name)").order("name"),
      supabase.from("year_groups").select("id, name").order("sort_order"),
      supabase.from("classes").select("id, name").order("name"),
      supabase.from("enrolments").select("class_id, child_id"),
    ]);
    if (chargesRes.error || paymentsRes.error || childrenRes.error) {
      setLoadError(true);
      setRows([]);
      return;
    }
    setLoadError(false);
    const charges = ((chargesRes.data as unknown as FeeCharge[]) || []).map((c) => ({ ...c, amount: Number(c.amount) }));
    const payments = ((paymentsRes.data as unknown as FeePayment[]) || []).map((p) => ({ ...p, amount: Number(p.amount) }));
    const kids = (childrenRes.data as unknown as ChildRow[]) || [];

    const parentIds = Array.from(new Set([...kids.map((k) => k.parent_user_id), ...charges.map((c) => c.parent_user_id)]));
    const { data: profData } = parentIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", parentIds) : { data: [] };
    const profiles = new Map(((profData as unknown as Profile[]) || []).map((p) => [p.id, p]));
    const nameOf = (id: string): string => profiles.get(id)?.full_name || profiles.get(id)?.email || "Unknown family";

    const kidById = new Map(kids.map((k) => [k.id, k]));
    const paymentsByCharge = new Map<string, FeePayment[]>();
    for (const p of payments) paymentsByCharge.set(p.charge_id, [...(paymentsByCharge.get(p.charge_id) || []), p]);

    setFeeBands(bands);
    setFamilies(
      Array.from(new Set(kids.map((k) => k.parent_user_id)))
        .map((id) => ({ id, name: nameOf(id) }))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setChildren(kids.map((k) => ({ id: k.id, name: k.name, parentId: k.parent_user_id, yearGroupId: k.year_group_id, yearGroup: k.year_groups?.name || null })));
    setYearGroups((ygRes.data as unknown as YearGroupOpt[]) || []);
    setClasses((classRes.data as unknown as ClassOpt[]) || []);
    setEnrolments(((enrolRes.data as unknown as { class_id: string; child_id: string }[]) || []).map((e) => ({ classId: e.class_id, childId: e.child_id })));

    setRows(
      charges.map((c) => {
        const pays = paymentsByCharge.get(c.id) || [];
        const paid = round2(pays.reduce((s, p) => s + p.amount, 0));
        const kid = c.child_id ? kidById.get(c.child_id) : undefined;
        return {
          charge: c,
          familyName: nameOf(c.parent_user_id),
          email: profiles.get(c.parent_user_id)?.email || "",
          childName: kid?.name || "",
          yearGroup: kid?.year_groups?.name || "",
          payments: pays,
          paid,
          balance: Math.max(0, round2(c.amount - paid)),
          status: chargeStatus(c, paid),
        };
      })
    );
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  // Confirmations fade after a few seconds so they don't pile up above the list.
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const live = useMemo(() => (rows || []).filter((r) => r.status !== "void"), [rows]);
  // Summed in whole pence so long lists never drift by a penny.
  const stats = useMemo(() => {
    const p = (n: number) => Math.round(n * 100);
    const billed = live.reduce((s, r) => s + p(r.charge.amount), 0);
    const collected = live.reduce((s, r) => s + Math.min(p(r.paid), p(r.charge.amount)), 0);
    const overdue = live.filter((r) => r.status === "overdue").reduce((s, r) => s + p(r.balance), 0);
    return { billed: billed / 100, collected: collected / 100, outstanding: Math.max(0, billed - collected) / 100, overdue: overdue / 100 };
  }, [live]);

  const yearOptions = useMemo(() => Array.from(new Set((rows || []).map((r) => r.yearGroup).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (rows || []).filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (yearFilter !== "all" && r.yearGroup !== yearFilter) return false;
      if (familyFilter && r.charge.parent_user_id !== familyFilter.id) return false;
      if (q && !`${r.familyName} ${r.email} ${r.childName} ${r.charge.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === "due_asc") return [...list].sort((a, b) => a.charge.due_date.localeCompare(b.charge.due_date));
    if (sort === "balance") return [...list].sort((a, b) => b.balance - a.balance || a.charge.due_date.localeCompare(b.charge.due_date));
    return list;
  }, [rows, statusFilter, yearFilter, familyFilter, search, sort]);
  const filtersOn = statusFilter !== "all" || yearFilter !== "all" || !!familyFilter || search.trim() !== "";
  const clearFilters = () => {
    setStatusFilter("all");
    setYearFilter("all");
    setFamilyFilter(null);
    setSearch("");
  };

  const familyBalances = useMemo(() => {
    const m = new Map<string, { name: string; email: string; billed: number; paid: number; overdue: number; count: number }>();
    for (const r of filtered) {
      if (r.status === "void") continue;
      const cur = m.get(r.charge.parent_user_id) || { name: r.familyName, email: r.email, billed: 0, paid: 0, overdue: 0, count: 0 };
      cur.billed = round2(cur.billed + r.charge.amount);
      cur.paid = round2(cur.paid + Math.min(r.paid, r.charge.amount));
      if (r.status === "overdue") cur.overdue = round2(cur.overdue + r.balance);
      cur.count += 1;
      m.set(r.charge.parent_user_id, cur);
    }
    return Array.from(m.entries())
      .map(([id, v]) => ({ id, ...v, balance: Math.max(0, round2(v.billed - v.paid)) }))
      .sort((a, b) => b.balance - a.balance);
  }, [filtered]);

  const voidCharge = async (r: Row) => {
    if (!supabase || !(await askConfirm(`Void "${r.charge.description}" for ${r.familyName}? Payments already recorded are kept.`))) return;
    const { error } = await supabase.from("fee_charges").update({ voided_at: new Date().toISOString() }).eq("id", r.charge.id);
    setNotice(error ? "Could not void the charge. Please try again." : "Charge voided.", !error);
    await load();
  };

  const exportCsv = () => {
    const header = ["Family", "Email", "Child", "Year group", "Description", "Due date", "Amount", "Paid", "Balance", "Status"];
    const lines = filtered.map((r) =>
      [r.familyName, r.email, r.childName, r.yearGroup, r.charge.description, r.charge.due_date, r.charge.amount.toFixed(2), r.paid.toFixed(2), r.balance.toFixed(2), STATUS_LABEL[r.status]].map(csvEscape).join(",")
    );
    const blob = new Blob([[header.map(csvEscape).join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fees-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Today", href: "/admin/dashboard" }, { label: "Fees" }]}
        title="Fees and billing"
        subtitle="Charges raised against families, payments received, and who still owes what."
        actions={
          canExport &&
          rows &&
          rows.length > 0 && (
            <Button icon="download" onClick={exportCsv}>
              Export CSV
            </Button>
          )
        }
        action={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)} data-guide="fees-new">
            New charge
          </Button>
        }
      />
      <WithdrawalNoticesAdmin />
      {!canExport && rows && rows.length > 0 && <p className="-mt-3 mb-4 text-xs text-ink/65">Exporting needs the &quot;Can export data&quot; permission. Ask a Headteacher to grant it.</p>}
      {notice && (
        <p role={notice.ok ? "status" : "alert"} className={`mb-4 rounded-lg border px-4 py-2 text-sm ${notice.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {notice.text}
        </p>
      )}
      {loadError && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">Could not load fees just now. Please refresh the page and try again.</p>}

      <div data-guide="fees-figures" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Billed" value={formatGBP(stats.billed)} />
        <StatTile label="Collected" value={formatGBP(stats.collected)} status={stats.collected > 0 && stats.outstanding === 0 ? "ok" : undefined} />
        <StatTile label="Outstanding" value={formatGBP(stats.outstanding)} />
        <StatTile label="Overdue" value={formatGBP(stats.overdue)} status={stats.overdue > 0 ? "warning" : stats.billed > 0 ? "ok" : undefined} />
      </div>
      {stats.overdue > 0 && statusFilter !== "overdue" && (
        <p className="-mt-3 mb-4 text-sm">
          <button
            type="button"
            onClick={() => {
              setStatusFilter("overdue");
              setSort("balance");
              setView("charges");
            }}
            className={ui.btnLink}
          >
            Show only overdue charges, largest first
          </button>
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search family, child, description" aria-label="Search charges" className={`${ui.input} min-w-0 flex-1 sm:max-w-xs`} />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | ChargeStatus)} className={inputCls} aria-label="Status">
          <option value="all">All statuses</option>
          <option value="outstanding">Outstanding</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </Select>
        <Select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className={inputCls} aria-label="Year group">
          <option value="all">All year groups</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
        {view === "charges" && (
          <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={inputCls} aria-label="Sort charges">
            <option value="due_desc">Newest due date first</option>
            <option value="due_asc">Oldest due date first</option>
            <option value="balance">Largest balance first</option>
          </Select>
        )}
        <Tabs
          variant="switch"
          items={[
            { key: "charges", label: "Charges" },
            { key: "families", label: "By family" },
          ]}
          value={view}
          onChange={setView}
          label="Fees view"
          className="ml-auto"
        />
      </div>

      {(familyFilter || filtersOn) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink/70">
          {familyFilter && (
            <button type="button" onClick={() => setFamilyFilter(null)} aria-label={`Stop filtering by ${familyFilter.name}`} className={ui.chipOn}>
              Family: {familyFilter.name}
              <span aria-hidden="true">×</span>
            </button>
          )}
          <span>
            Showing {filtered.length} of {rows?.length ?? 0} charges.
          </span>
          <button type="button" onClick={clearFilters} className={ui.btnLink}>
            Clear filters
          </button>
        </div>
      )}
      {rows === null && <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" aria-label="Loading" />}
      {rows && rows.length === 0 && !loadError && (
        <EmptyState
          title="No charges yet"
          icon="wallet"
          action={
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              New charge
            </Button>
          }
        >
          Raise a charge for one family, or for a whole year group or class in a few clicks.
        </EmptyState>
      )}
      {rows && rows.length > 0 && filtered.length === 0 && (
        <p className="rounded-2xl border border-gold-light bg-white p-6 text-sm text-ink/65">
          Nothing matches those filters.{" "}
          <button type="button" onClick={clearFilters} className={ui.btnLink}>
            Clear filters
          </button>
        </p>
      )}

      {rows && filtered.length > 0 && view === "charges" && (
        <>
        <ul className="space-y-3">
          {filtered.slice(0, limit).map((r) => (
            <li key={r.charge.id} className="rounded-2xl border border-gold-light bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{r.charge.description}</p>
                  <p className="text-sm text-ink/65">
                    {r.familyName}
                    {r.childName && ` · ${r.childName}`}
                    {r.yearGroup && ` (${r.yearGroup})`}
                  </p>
                  <p className="mt-0.5 text-xs text-ink/65">Due {formatDate(r.charge.due_date)}</p>
                </div>
                <div className="text-right">
                  <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  <p className="mt-1 text-sm tabular-nums text-ink">
                    {formatGBP(r.paid)} <span className="text-ink/65">of {formatGBP(r.charge.amount)}</span>
                  </p>
                  {r.balance > 0 && r.status !== "void" && <p className="text-xs font-medium tabular-nums text-ink/70">{formatGBP(r.balance)} to pay</p>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {r.status !== "void" && r.balance > 0 && (
                  <>
                    <button type="button" onClick={() => setPaying({ row: r, full: true })} className={btn("primary", "sm")}>
                      Mark paid
                    </button>
                    <button type="button" onClick={() => setPaying({ row: r, full: false })} className={btn("secondary", "sm")}>
                      Record part payment
                    </button>
                  </>
                )}
                {r.payments.length > 0 && (
                  <button type="button" onClick={() => setExpanded(expanded === r.charge.id ? null : r.charge.id)} aria-expanded={expanded === r.charge.id} className={btn("ghost", "sm")}>
                    {expanded === r.charge.id ? "Hide" : "Show"} payments ({r.payments.length})
                  </button>
                )}
                {r.status !== "void" && r.status !== "paid" && (
                  <button type="button" onClick={() => voidCharge(r)} title="Cancel this charge. Payments already recorded are kept." className={`${ui.btnLinkDanger} ml-auto !text-xs`}>
                    Void charge
                  </button>
                )}
              </div>
              {expanded === r.charge.id && (
                <ul className="mt-3 divide-y divide-gold-light/60 rounded-lg bg-cream px-3 text-sm">
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
              )}
            </li>
          ))}
        </ul>
        {filtered.length > limit && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink/65">
            Showing {limit} of {filtered.length}.
            <Button size="sm" onClick={() => setLimit((n) => n + PAGE)}>
              Show more
            </Button>
          </div>
        )}
        </>
      )}

      {rows && filtered.length > 0 && view === "families" && (
        <div className="overflow-x-auto rounded-2xl border border-gold-light bg-white">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="text-ink/65">
                {["Family", "Charges", "Billed", "Paid", "Balance", "Overdue"].map((h, i) => (
                  <th key={h} className={`border-b border-gold-light p-3 font-semibold ${i > 1 ? "text-right" : ""}`}>{h}</th>
                ))}
                <th className="border-b border-gold-light p-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {familyBalances.map((f) => (
                <tr key={f.id}>
                  <td className="border-b border-gold-light/40 p-3">
                    <span className="font-medium text-ink">{f.name}</span>
                    {f.email && <span className="block text-xs text-ink/65">{f.email}</span>}
                  </td>
                  <td className="border-b border-gold-light/40 p-3 text-ink/70">{f.count}</td>
                  <td className="border-b border-gold-light/40 p-3 text-right tabular-nums">{formatGBP(f.billed)}</td>
                  <td className="border-b border-gold-light/40 p-3 text-right tabular-nums">{formatGBP(f.paid)}</td>
                  <td className="border-b border-gold-light/40 p-3 text-right font-semibold tabular-nums">{formatGBP(f.balance)}</td>
                  <td className={`border-b border-gold-light/40 p-3 text-right tabular-nums ${f.overdue > 0 ? "font-semibold text-red-700" : "text-ink/65"}`}>{f.overdue > 0 ? formatGBP(f.overdue) : "–"}</td>
                  <td className="border-b border-gold-light/40 p-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setFamilyFilter({ id: f.id, name: f.name });
                        setView("charges");
                      }}
                      className={`${ui.btnLink} whitespace-nowrap`}
                    >
                      View charges
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <NewChargeDialog
          families={families}
          pupils={children}
          yearGroups={yearGroups}
          classes={classes}
          enrolments={enrolments}
          feeBands={feeBands}
          onClose={() => setCreating(false)}
          onDone={(n) => {
            setCreating(false);
            setNotice(`${n} charge${n === 1 ? "" : "s"} created.`);
            load();
          }}
        />
      )}
      {paying && (
        <PaymentDialog
          chargeId={paying.row.charge.id}
          title={`${paying.row.charge.description} · ${paying.row.familyName}`}
          balance={paying.row.balance}
          fullPayment={paying.full}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null);
            setNotice("Payment recorded.");
            load();
          }}
        />
      )}
    </>
  );
}

export default function AdminFeesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <FeesContent />
      </LearnGate>
    </section>
  );
}
