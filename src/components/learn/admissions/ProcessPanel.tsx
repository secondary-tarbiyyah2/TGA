"use client";

import { useState, type ReactNode } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatMoney, type ApplicationPatch, type ApplicationRow, type ApplicationStatus } from "@/components/admissions/applicationShared";
import { AcceptAccounts } from "@/components/learn/admissions/AcceptAccounts";

/** ISO timestamp -> value for <input type="datetime-local"> in the browser's zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
const today = () => new Date().toISOString().slice(0, 10);
const numOrNull = (v: string): number | null => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));

const fieldCls = "mt-1 block w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2 text-sm";

function Group({ title, help, children }: { title: string; help?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gold-light/50 bg-cream/40 p-4">
      <h3 className="font-serif text-lg font-semibold text-ink">{title}</h3>
      {help && <p className="mb-3 mt-1 text-xs leading-relaxed text-ink/65">{help}</p>}
      {children}
    </section>
  );
}

type Draft = {
  assessmentAt: string;
  interviewAt: string;
  decisionNote: string;
  offerMadeAt: string;
  offerDeadline: string;
  adminFee: string;
  adminFeeReceived: boolean;
  adminFeeReceivedAt: string;
  deposit: string;
  depositReceived: boolean;
  depositReceivedAt: string;
  report: boolean;
  ids: boolean;
};

export function ProcessPanel({
  app,
  defaults,
  onPatch,
  onMove,
}: {
  app: ApplicationRow;
  defaults: { adminFee: number | null; deposit: number | null };
  onPatch: (id: string, patch: ApplicationPatch) => Promise<boolean>;
  onMove: (id: string, status: ApplicationStatus) => Promise<boolean>;
}) {
  const fromApp = (): Draft => ({
    assessmentAt: toLocalInput(app.assessment_at),
    interviewAt: toLocalInput(app.interview_at),
    decisionNote: app.decision_note || "",
    offerMadeAt: app.offer_made_at || "",
    offerDeadline: app.offer_deadline || "",
    adminFee: String(app.admin_fee_amount ?? defaults.adminFee ?? ""),
    adminFeeReceived: app.admin_fee_received,
    adminFeeReceivedAt: app.admin_fee_received_at || "",
    deposit: String(app.deposit_amount ?? defaults.deposit ?? ""),
    depositReceived: app.deposit_received,
    depositReceivedAt: app.deposit_received_at || "",
    report: app.report_received,
    ids: app.id_documents_received,
  });
  const [d, setD] = useState<Draft>(fromApp);
  const [saved, setSaved] = useState<Draft>(fromApp);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));

  async function save() {
    setSaving(true);
    setMsg(null);
    const nz = (s: string) => (s.trim() === "" ? null : s);
    const ok = await onPatch(app.id, {
      assessment_at: fromLocalInput(d.assessmentAt),
      interview_at: fromLocalInput(d.interviewAt),
      decision_note: nz(d.decisionNote),
      offer_made_at: nz(d.offerMadeAt),
      offer_deadline: nz(d.offerDeadline),
      admin_fee_amount: numOrNull(d.adminFee),
      admin_fee_received: d.adminFeeReceived,
      admin_fee_received_at: d.adminFeeReceived ? nz(d.adminFeeReceivedAt) || today() : nz(d.adminFeeReceivedAt),
      deposit_amount: numOrNull(d.deposit),
      deposit_received: d.depositReceived,
      deposit_received_at: d.depositReceived ? nz(d.depositReceivedAt) || today() : nz(d.depositReceivedAt),
      report_received: d.report,
      id_documents_received: d.ids,
    });
    setSaving(false);
    setMsg(ok ? "Saved." : "Couldn't save. Please try again.");
    if (ok) setSaved(d);
  }

  const showAccept = app.status === "offered" || app.status === "accepted";

  return (
    <div className="space-y-4">
      <Group
        title="Assessment & conversation"
        help={
          <>
            The <strong>assessment</strong> is the GL assessment stage, taken after the application and free of charge. It is separate from the website{" "}
            <em>call bookings</em> (Admissions, Calls &amp; bookings), which are short intro calls families book themselves before or alongside applying.
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink">
            Assessment date &amp; time
            <span className="block text-xs font-normal text-ink/50">GL assessment (not an intro call)</span>
            <input type="datetime-local" value={d.assessmentAt} onChange={(e) => set("assessmentAt", e.target.value)} className={fieldCls} />
          </label>
          <label className="block text-sm font-medium text-ink">
            Parent &amp; student conversation
            <span className="block text-xs font-normal text-ink/50">After the assessment</span>
            <input type="datetime-local" value={d.interviewAt} onChange={(e) => set("interviewAt", e.target.value)} className={fieldCls} />
          </label>
        </div>
      </Group>

      <Group
        title="Offer & fees"
        help="Fees policy: the assessment is free. The admin (registration) fee and the deposit are requested together when an offer is made, as a condition of acceptance. The place is held only once both are received, by the offer deadline. An application can't move to Accepted until both are marked received (a Headteacher can override)."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink">
            Offer made
            <input type="date" value={d.offerMadeAt} onChange={(e) => set("offerMadeAt", e.target.value)} className={fieldCls} />
          </label>
          <label className="block text-sm font-medium text-ink">
            Offer deadline
            <input type="date" value={d.offerDeadline} onChange={(e) => set("offerDeadline", e.target.value)} className={fieldCls} />
          </label>
          {([
            ["Admin fee", "adminFee", "adminFeeReceived", "adminFeeReceivedAt"],
            ["Deposit", "deposit", "depositReceived", "depositReceivedAt"],
          ] as const).map(([label, amountKey, recKey, dateKey]) => (
            <div key={label} className="rounded-lg border border-gold-light/50 bg-white p-3">
              <label className="block text-sm font-medium text-ink">
                {label} (£)
                <input type="number" min="0" step="0.01" inputMode="decimal" value={d[amountKey]} onChange={(e) => set(amountKey, e.target.value)} className={fieldCls} />
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={d[recKey]}
                  onChange={(e) => {
                    set(recKey, e.target.checked);
                    if (e.target.checked && !d[dateKey]) set(dateKey, today());
                  }}
                />
                Received
              </label>
              {d[recKey] && (
                <input type="date" aria-label={`${label} received on`} value={d[dateKey]} onChange={(e) => set(dateKey, e.target.value)} className={fieldCls} />
              )}
            </div>
          ))}
        </div>
        {(defaults.adminFee === null || defaults.deposit === null) && (
          <p className="mt-2 text-xs text-ink/55">
            Amounts start from site settings (admin fee: {defaults.adminFee !== null ? formatMoney(defaults.adminFee) : "not set"}; deposit: {defaults.deposit !== null ? formatMoney(defaults.deposit) : "not set"}). Enter them here for this application if blank.
          </p>
        )}
      </Group>

      <Group title="Paperwork">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={d.report} onChange={(e) => set("report", e.target.checked)} />
            Latest school report received
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={d.ids} onChange={(e) => set("ids", e.target.checked)} />
            ID documents received
          </label>
        </div>
        <label className="mt-3 block text-sm font-medium text-ink">
          Decision note <span className="text-xs font-normal text-ink/50">(staff only)</span>
          <textarea value={d.decisionNote} onChange={(e) => set("decisionNote", e.target.value)} rows={3} maxLength={5000} className={fieldCls} />
        </label>
      </Group>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving || !dirty} className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">
          {saving ? "Saving…" : "Save process"}
        </button>
        {dirty && !saving && <span className="text-xs text-ink/55">Unsaved changes</span>}
        {msg && <span role="status" className="text-xs text-ink/70">{msg}</span>}
      </div>

      {showAccept && (dirty ? <p className="text-xs text-ink/60">Save the process changes above before accepting.</p> : <AcceptAccounts app={app} onPatch={onPatch} onMove={onMove} />)}
    </div>
  );
}

// Re-exported so the drawer needn't import the client for defaults.
export async function loadFeeDefaults(): Promise<{ adminFee: number | null; deposit: number | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { adminFee: null, deposit: null };
  const { data } = await supabase.from("site_settings").select("registration_fee, admissions_deposit_amount").eq("id", true).maybeSingle();
  const row = data as { registration_fee: number | null; admissions_deposit_amount: number | null } | null;
  return {
    adminFee: row?.registration_fee !== null && row?.registration_fee !== undefined ? Number(row.registration_fee) : null,
    deposit: row?.admissions_deposit_amount !== null && row?.admissions_deposit_amount !== undefined ? Number(row.admissions_deposit_amount) : null,
  };
}
