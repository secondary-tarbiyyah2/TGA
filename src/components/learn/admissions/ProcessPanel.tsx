"use client";

import { useState } from "react";
import { formatMoney, type ApplicationPatch, type ApplicationRow, type ApplicationStatus } from "@/components/admissions/applicationShared";
import { AcceptAccounts, type CreateAccountsFn } from "@/components/learn/admissions/AcceptAccounts";
import { AssessmentPanel } from "@/components/learn/admissions/AssessmentPanel";
import { EmailComposer } from "@/components/learn/admissions/EmailComposer";
import { InterviewPanel } from "@/components/learn/admissions/InterviewPanel";
import { buildTemplate, type TemplateContext } from "@/components/learn/admissions/messageTemplates";
import { gbp } from "@/components/learn/admissions/paymentCalc";
import type { PlanId } from "@/components/learn/admissions/stageTypes";
import type { MoveOptions, StaffOption } from "@/components/learn/admissions/ApplicationDrawer";
import type { AdmissionsContext } from "@/components/learn/admissions/useAdmissionsContext";
import { Group, Pill, fieldCls, primaryBtn } from "@/components/learn/admissions/ui";
import { Tabs } from "@/components/learn/Tabs";
import { ukToday } from "@/lib/learn/ukTime";
import { Select } from "@/components/learn/Select";

const today = () => ukToday();
const numOrNull = (v: string): number | null => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));
const nz = (s: string) => (s.trim() === "" ? null : s);

type Draft = {
  decisionNote: string;
  offerMadeAt: string;
  offerDeadline: string;
  startDate: string;
  plan: string;
  annualOverride: string;
  appFee: string;
  appFeeReceived: boolean;
  appFeeReceivedAt: string;
  deposit: string;
  depositReceived: boolean;
  depositReceivedAt: string;
  report: boolean;
  ids: boolean;
};

type Section = "assessment" | "interview" | "offer";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "assessment", label: "Assessment" },
  { id: "interview", label: "Interview" },
  { id: "offer", label: "Offer & paperwork" },
];

export function ProcessPanel({
  app,
  ctx,
  staff,
  baseCtx,
  onPatch,
  onMove,
  onCreateAccounts,
}: {
  app: ApplicationRow;
  ctx: AdmissionsContext;
  staff: StaffOption[];
  baseCtx: TemplateContext;
  onPatch: (id: string, patch: ApplicationPatch) => Promise<boolean>;
  onMove: (id: string, status: ApplicationStatus, opts?: MoveOptions) => Promise<boolean>;
  onCreateAccounts: CreateAccountsFn;
}) {
  const [section, setSection] = useState<Section>("assessment");
  return (
    <div className="space-y-4">
      {ctx.error && <p role="alert" className="text-sm text-red-700">{ctx.error}</p>}
      <Tabs variant="switch" items={SECTIONS.map((x) => ({ key: x.id, label: x.label }))} value={section} onChange={setSection} label="Process sections" />
      {section === "assessment" && <AssessmentPanel app={app} ctx={ctx} staff={staff} baseCtx={baseCtx} onPatch={onPatch} />}
      {section === "interview" && <InterviewPanel app={app} ctx={ctx} baseCtx={baseCtx} onPatch={onPatch} />}
      {section === "offer" && <OfferSection app={app} ctx={ctx} baseCtx={baseCtx} onPatch={onPatch} onMove={onMove} onCreateAccounts={onCreateAccounts} />}
    </div>
  );
}

function OfferSection({
  app,
  ctx,
  baseCtx,
  onPatch,
  onMove,
  onCreateAccounts,
}: {
  app: ApplicationRow;
  ctx: AdmissionsContext;
  baseCtx: TemplateContext;
  onPatch: (id: string, patch: ApplicationPatch) => Promise<boolean>;
  onMove: (id: string, status: ApplicationStatus, opts?: MoveOptions) => Promise<boolean>;
  onCreateAccounts: CreateAccountsFn;
}) {
  const { fees, details } = ctx;
  const fromApp = (): Draft => ({
    decisionNote: app.decision_note || "",
    offerMadeAt: app.offer_made_at || "",
    offerDeadline: app.offer_deadline || "",
    startDate: details?.offer_start_date || "",
    plan: details?.chosen_plan || "",
    annualOverride: details?.annual_fee_override !== null && details?.annual_fee_override !== undefined ? String(details.annual_fee_override) : "",
    appFee: details?.application_fee_amount !== null && details?.application_fee_amount !== undefined ? String(details.application_fee_amount) : "",
    appFeeReceived: details?.application_fee_received ?? false,
    appFeeReceivedAt: details?.application_fee_received_at || "",
    deposit: app.deposit_amount !== null ? String(app.deposit_amount) : "",
    depositReceived: app.deposit_received,
    depositReceivedAt: app.deposit_received_at || "",
    report: app.report_received,
    ids: app.id_documents_received,
  });
  const [d, setD] = useState<Draft>(fromApp);
  const [saved, setSaved] = useState<Draft>(d);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [composing, setComposing] = useState(false);

  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));

  async function save() {
    setSaving(true);
    setMsg(null);
    const okApp = await onPatch(app.id, {
      decision_note: nz(d.decisionNote),
      offer_made_at: nz(d.offerMadeAt),
      offer_deadline: nz(d.offerDeadline),
      deposit_amount: numOrNull(d.deposit),
      deposit_received: d.depositReceived,
      deposit_received_at: d.depositReceived ? nz(d.depositReceivedAt) || today() : nz(d.depositReceivedAt),
      report_received: d.report,
      id_documents_received: d.ids,
    });
    const okDet = await ctx.saveDetails({
      offer_start_date: nz(d.startDate),
      chosen_plan: (d.plan || null) as PlanId | null,
      annual_fee_override: numOrNull(d.annualOverride),
      application_fee_amount: numOrNull(d.appFee),
      application_fee_received: d.appFeeReceived,
      application_fee_received_at: d.appFeeReceived ? nz(d.appFeeReceivedAt) || today() : nz(d.appFeeReceivedAt),
    });
    setSaving(false);
    const ok = okApp && okDet;
    setMsg({ ok, text: ok ? "Saved." : "Couldn't save everything. Please try again." });
    if (ok) setSaved(d);
  }

  async function offerSent() {
    setComposing(false);
    if (!app.offer_made_at) await onPatch(app.id, { offer_made_at: today() });
    if (app.status !== "offered" && app.status !== "accepted") await onMove(app.id, "offered", { skipAutoEmail: true });
    setMsg({ ok: true, text: "Offer emailed. The application is now Offered, awaiting proof of payment." });
    void ctx.reload();
  }

  const showAccept = app.status === "offered" || app.status === "accepted";
  const feeRows = [
    { label: "Application fee (£) - covers the baseline assessment & admin review", amountKey: "appFee", recKey: "appFeeReceived", dateKey: "appFeeReceivedAt", placeholder: String(fees.applicationFee) },
    { label: "First payment (£) - per chosen plan", amountKey: "deposit", recKey: "depositReceived", dateKey: "depositReceivedAt", placeholder: fees.activeFirstPayment !== null ? String(fees.activeFirstPayment) : "" },
  ] as const;

  return (
    <div className="space-y-4">
      <Group
        title="Offer & fees"
        help="Fees Policy 2026-27: application fee (covers the baseline assessment and admin review), then the first payment of the family's chosen plan on accepting the offer. There is no registration fee. Amounts start from site settings and the year group's fee band; override per application below. The offer email carries the amounts, payment instructions and a personal link for the family to upload proof of payment. Fee flags are set automatically when you verify proofs in the Payments tab; an application can't move to Accepted until the first payment is received (a Headteacher can override)."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink">
            Offer made
            <input type="date" value={d.offerMadeAt} onChange={(e) => set("offerMadeAt", e.target.value)} className={fieldCls} />
          </label>
          <label className="block text-sm font-medium text-ink">
            Payment deadline
            <input type="date" value={d.offerDeadline} onChange={(e) => set("offerDeadline", e.target.value)} className={fieldCls} />
          </label>
          <label className="block text-sm font-medium text-ink">
            Place starts
            <input type="date" value={d.startDate} onChange={(e) => set("startDate", e.target.value)} className={fieldCls} />
            <span className="mt-1 block text-xs font-normal text-ink/65">Family asked for: {app.preferred_start || "not given"}</span>
          </label>
          <label className="block text-sm font-medium text-ink">
            Plan chosen
            <Select value={d.plan} onChange={(e) => set("plan", e.target.value)} className={fieldCls}>
              <option value="">Not chosen yet{ctx.planIntent ? ` (family intends: ${ctx.planIntent})` : ""}</option>
              <option value="monthly">Monthly</option>
              <option value="termly">Termly</option>
              <option value="annual">Annual, paid in full</option>
            </Select>
          </label>
          <label className="block text-sm font-medium text-ink sm:col-span-2">
            Annual fee override (£)
            <input type="text" min="0" step="0.01" inputMode="decimal" value={d.annualOverride} onChange={(e) => set("annualOverride", e.target.value)} placeholder={fees.annualFee !== null ? `Fee band: ${fees.annualFee}` : "No fee band matched this year group"} className={fieldCls} />
          </label>
        </div>

        <div className="mt-3 rounded-lg border border-gold-light/50 bg-white p-3 text-xs text-ink/75">
          <p className="font-semibold text-ink">Amounts due now (saved settings)</p>
          {fees.plans.length === 0 ? (
            <p className="mt-1">No annual fee found for {app.year_group_applying}. Enter an annual fee override above.</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {fees.plans.map((p) => (
                <li key={p.id}>
                  {p.label}: <strong>{gbp(Math.round(((fees.applicationFeeReceived ? 0 : fees.applicationFee) + p.firstPayment) * 100) / 100)}</strong>
                  {!fees.applicationFeeReceived && <span className="text-ink/65"> = {gbp(fees.applicationFee)} + {gbp(p.firstPayment)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 grid gap-3">
          {feeRows.map((r) => (
            <div key={r.amountKey} className="rounded-lg border border-gold-light/50 bg-white p-3">
              <label className="block text-sm font-medium text-ink">
                {r.label}
                <input type="text" min="0" step="0.01" inputMode="decimal" value={d[r.amountKey]} onChange={(e) => set(r.amountKey, e.target.value)} placeholder={r.placeholder ? `Default ${r.placeholder}` : "Set when a plan is chosen"} className={fieldCls} />
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={d[r.recKey]}
                  onChange={(e) => {
                    set(r.recKey, e.target.checked);
                    if (e.target.checked && !d[r.dateKey]) set(r.dateKey, today());
                  }}
                />
                Received
              </label>
              {d[r.recKey] && <input type="date" aria-label="Received on" value={d[r.dateKey]} onChange={(e) => set(r.dateKey, e.target.value)} className={fieldCls} />}
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => { setComposing((c) => !c); setMsg(null); }} disabled={dirty} className={primaryBtn}>
            Send offer
          </button>
          {dirty && <span className="text-xs text-ink/65">Save first, so the email uses the latest dates and amounts.</span>}
          {details?.offer_emailed_at && <Pill tone="good">Offer emailed {new Date(details.offer_emailed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}</Pill>}
        </div>
        {composing && (
          <EmailComposer
            app={app}
            template="offer"
            initial={buildTemplate("offer", app, baseCtx)}
            sendLabel="Send offer"
            note="The line containing {{PAYMENT_LINK}} is replaced with the family's personal upload link when sent. Re-sending an offer issues a new link and switches off the old one."
            onCancel={() => setComposing(false)}
            onSent={() => void offerSent()}
          />
        )}
        {app.deposit_amount === null && (
          <p className="mt-2 text-xs text-ink/65">
            First payment default {fees.activeFirstPayment !== null ? formatMoney(fees.activeFirstPayment) : "set once a plan is chosen"}.
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
            ID documents and proof of address received
          </label>
        </div>
        <label className="mt-3 block text-sm font-medium text-ink">
          Decision note <span className="text-xs font-normal text-ink/65">(staff only)</span>
          <textarea value={d.decisionNote} onChange={(e) => set("decisionNote", e.target.value)} rows={3} maxLength={5000} className={fieldCls} />
        </label>
      </Group>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving || !dirty} className={primaryBtn}>
          {saving ? "Saving…" : "Save offer & paperwork"}
        </button>
        {dirty && !saving && <span className="text-xs text-ink/65">Unsaved changes</span>}
        {msg && <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-teal-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>

      {showAccept && (dirty ? <p className="text-xs text-ink/65">Save the changes above before accepting.</p> : <AcceptAccounts app={app} ctx={ctx} onMove={onMove} onCreateAccounts={onCreateAccounts} />)}
    </div>
  );
}
