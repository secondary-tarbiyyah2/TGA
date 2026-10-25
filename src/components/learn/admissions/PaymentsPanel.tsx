"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ApplicationPatch, ApplicationRow } from "@/components/admissions/applicationShared";
import { FilePreview } from "@/components/learn/admissions/FilePreview";
import { EmailComposer } from "@/components/learn/admissions/EmailComposer";
import { sendTemplateEmail } from "@/components/learn/admissions/admissionsData";
import { PAYMENT_LINK_TOKEN } from "@/components/learn/admissions/messageTemplates";
import { gbp } from "@/components/learn/admissions/paymentCalc";
import type { PlanId } from "@/components/learn/admissions/stageTypes";
import type { AdmissionsContext } from "@/components/learn/admissions/useAdmissionsContext";
import { Group, Pill, fieldCls, ghostBtn, primaryBtn } from "@/components/learn/admissions/ui";

export const PAYMENTS_BUCKET = "admissions-payments";

type Proof = {
  id: string;
  submission_id: string;
  kind: string;
  covers: string[];
  plan: PlanId | null;
  amount_claimed: number | null;
  family_note: string | null;
  file_path: string;
  file_name: string | null;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  status: "pending" | "verified" | "rejected";
  amount_verified: number | null;
  verified_by: string | null;
  verified_at: string | null;
  note: string | null;
};

const PROOF_COLUMNS = "id, submission_id, kind, covers, plan, amount_claimed, family_note, file_path, file_name, content_type, size_bytes, uploaded_at, status, amount_verified, verified_by, verified_at, note";
const COVER_LABELS: Record<string, string> = { application_fee: "Application fee", registration_fee: "Registration fee", first_payment: "First payment" };
const PLAN_LABELS: Record<PlanId, string> = { annual: "Annual", termly: "2 payments", monthly: "Monthly" };
const today = () => new Date().toISOString().slice(0, 10);

export function PaymentsPanel({
  app,
  ctx,
  staffNames,
  onPatch,
}: {
  app: ApplicationRow;
  ctx: AdmissionsContext;
  staffNames: Record<string, string>;
  onPatch: (id: string, patch: ApplicationPatch) => Promise<boolean>;
}) {
  const [proofs, setProofs] = useState<Proof[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ id: string; url: string; type: string; name: string } | null>(null);
  const [verifying, setVerifying] = useState<{ id: string; amount: string; email: boolean } | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; reason: string; email: boolean } | null>(null);
  const [linkEmail, setLinkEmail] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return setError("The portal isn't connected to the server yet.");
    const { data, error: err } = await supabase.from("admissions_payment_proofs").select(PROOF_COLUMNS).eq("application_id", app.id).order("uploaded_at", { ascending: false });
    if (err) return setError("Couldn't load the payment proofs. Migration 0061 may not be applied yet.");
    setError(null);
    setProofs(((data as Proof[] | null) || []).map((p) => ({ ...p, amount_claimed: p.amount_claimed === null ? null : Number(p.amount_claimed), amount_verified: p.amount_verified === null ? null : Number(p.amount_verified) })));
  }, [app.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load]);

  const { fees } = ctx;
  const verifiedRows = (proofs || []).filter((p) => p.status === "verified");
  const verifiedTotal = Math.round(verifiedRows.reduce((s, p) => s + (p.amount_verified ?? 0), 0) * 100) / 100;
  const dueTotal = fees.dueNowTotal ?? fees.dueNowMinimum;
  const pendingCount = (proofs || []).filter((p) => p.status === "pending").length;
  const familyPlan = (proofs || []).find((p) => p.plan)?.plan || null;

  const items = [
    { label: "Application fee", amount: fees.applicationFee, received: ctx.details?.application_fee_received ?? false },
    { label: "Registration fee", amount: fees.registrationFee, received: app.admin_fee_received },
    { label: `First payment${fees.activePlan ? ` (${PLAN_LABELS[fees.activePlan].toLowerCase()})` : ""}`, amount: fees.activeFirstPayment, received: app.deposit_received },
  ];

  async function view(p: Proof) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyId(p.id);
    setNotice(null);
    await supabase.rpc("admissions_log_document_access", { p_application_id: app.id, p_path: p.file_path, p_action: "view" });
    const { data, error: err } = await supabase.storage.from(PAYMENTS_BUCKET).createSignedUrl(p.file_path, 300);
    setBusyId(null);
    if (err || !data) return setNotice({ ok: false, text: "Couldn't open that file. Please try again." });
    setViewing({ id: p.id, url: data.signedUrl, type: p.content_type, name: p.file_name || "Proof of payment" });
  }

  async function verify() {
    if (!verifying) return;
    const supabase = getSupabaseClient();
    const proof = proofs?.find((p) => p.id === verifying.id);
    if (!supabase || !proof) return;
    const amount = verifying.amount.trim() === "" ? null : Number(verifying.amount);
    if (amount !== null && (Number.isNaN(amount) || amount < 0)) return setNotice({ ok: false, text: "Enter the verified amount as a number, or leave it blank." });
    setBusyId(proof.id);
    setNotice(null);
    const { data: u } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from("admissions_payment_proofs")
      .update({ status: "verified", amount_verified: amount, verified_by: u.user?.id ?? null, verified_at: new Date().toISOString(), note: null })
      .eq("id", proof.id);
    if (err) {
      setBusyId(null);
      return setNotice({ ok: false, text: "Couldn't verify that proof. Please try again." });
    }
    // The database trigger (0062) has switched the fee flags on; mirror them locally.
    const patch: ApplicationPatch = {};
    if (proof.covers.includes("registration_fee") && !app.admin_fee_received) Object.assign(patch, { admin_fee_received: true, admin_fee_received_at: app.admin_fee_received_at || today() });
    if (proof.covers.includes("first_payment") && !app.deposit_received) Object.assign(patch, { deposit_received: true, deposit_received_at: app.deposit_received_at || today() });
    if (Object.keys(patch).length) await onPatch(app.id, patch);
    let text = "Verified. Fee flags updated.";
    if (verifying.email) {
      const covered = proof.covers.map((c) => COVER_LABELS[c] || c).join(", ");
      const out = await sendTemplateEmail({
        app,
        key: "payment_received",
        auto: false, // the tick-box in the verify panel is the staff member's choice
        data: { settings: ctx.settings, bands: ctx.bands, details: ctx.details, planIntent: ctx.planIntent, fees: ctx.fees },
        extra: { payment_covers: covered || undefined, payment_amount: amount !== null ? gbp(amount) : undefined },
      });
      text += out.emailSent ? " Confirmation emailed." : ` The confirmation email failed: ${out.text}`;
    }
    setVerifying(null);
    setBusyId(null);
    setNotice({ ok: true, text });
    await Promise.all([load(), ctx.reload()]);
  }

  async function reject() {
    if (!rejecting) return;
    const supabase = getSupabaseClient();
    const proof = proofs?.find((p) => p.id === rejecting.id);
    if (!supabase || !proof) return;
    if (!rejecting.reason.trim()) return setNotice({ ok: false, text: "Give the family a reason." });
    setBusyId(proof.id);
    setNotice(null);
    const { data: u } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from("admissions_payment_proofs")
      .update({ status: "rejected", verified_by: u.user?.id ?? null, verified_at: new Date().toISOString(), note: rejecting.reason.trim() })
      .eq("id", proof.id);
    if (err) {
      setBusyId(null);
      return setNotice({ ok: false, text: "Couldn't reject that proof. Please try again." });
    }
    let text = "Rejected.";
    if (rejecting.email) {
      const out = await sendTemplateEmail({
        app,
        key: "payment_rejected",
        auto: false,
        data: { settings: ctx.settings, bands: ctx.bands, details: ctx.details, planIntent: ctx.planIntent, fees: ctx.fees },
        extra: { reject_reason: rejecting.reason.trim(), reject_item: proof.file_name ? `the file "${proof.file_name}"` : undefined },
      });
      text += out.emailSent ? " The family has been emailed with a fresh upload link." : ` The email failed: ${out.text}`;
    }
    setRejecting(null);
    setBusyId(null);
    setNotice({ ok: true, text });
    await load();
  }

  async function reset(p: Proof) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (p.status === "verified" && !window.confirm("Reset this verified proof to pending? The fee-received flags stay ticked; untick them in Process > Offer & paperwork if needed.")) return;
    setBusyId(p.id);
    const { error: err } = await supabase.from("admissions_payment_proofs").update({ status: "pending", verified_by: null, verified_at: null, amount_verified: null }).eq("id", p.id);
    setBusyId(null);
    if (err) return setNotice({ ok: false, text: "Couldn't reset that proof." });
    await load();
  }

  const statusPill = (p: Proof) => (p.status === "verified" ? <Pill tone="good">Verified</Pill> : p.status === "rejected" ? <Pill tone="bad">Rejected</Pill> : <Pill tone="warn">Pending review</Pill>);

  return (
    <div className="space-y-4">
      <Group title="Due vs verified" help="Amounts come from site settings and the year group's fee band (override them in Process > Offer & paperwork). Verifying a proof ticks the matching fee-received flag automatically.">
        <ul className="space-y-1.5 text-sm text-ink">
          {items.map((it) => (
            <li key={it.label} className="flex items-center justify-between gap-3">
              <span>{it.label}{it.amount !== null ? ` - ${gbp(it.amount)}` : " - amount set once a plan is chosen"}</span>
              {it.received ? <Pill tone="good">Received</Pill> : <Pill tone="neutral">Outstanding</Pill>}
            </li>
          ))}
        </ul>
        <div className="mt-3 rounded-lg border border-gold-light/50 bg-white p-3 text-sm text-ink">
          {dueTotal !== null ? (
            <p>
              Due now{fees.dueNowTotal === null ? " (monthly minimum, no plan chosen)" : ""}: <strong>{gbp(dueTotal)}</strong> · Verified so far: <strong>{gbp(verifiedTotal)}</strong>
              {verifiedTotal < dueTotal ? ` · Outstanding ${gbp(Math.round((dueTotal - verifiedTotal) * 100) / 100)}` : " · Covered"}
            </p>
          ) : (
            <p>No fee band matched {app.year_group_applying}; add an annual fee override to see the totals.</p>
          )}
          <p className="mt-1 text-xs text-ink/65">Verified total adds up the verified amounts you enter on each proof. Amounts are advisory; the flags above drive acceptance.</p>
        </div>
        {familyPlan && ctx.details?.chosen_plan !== familyPlan && (
          <p className="mt-2 text-xs text-ink/70">
            The family says they chose <strong>{PLAN_LABELS[familyPlan]}</strong>.{" "}
            <button type="button" className="font-semibold text-teal-700 underline" onClick={async () => { const ok = await ctx.saveDetails({ chosen_plan: familyPlan }); setNotice({ ok, text: ok ? "Plan set." : "Couldn't set the plan." }); }}>
              Use this plan
            </button>
          </p>
        )}
      </Group>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setLinkEmail((v) => !v)} className={ghostBtn}>Email upload link</button>
        <button type="button" onClick={() => void load()} className="text-xs text-ink/65 underline">Refresh</button>
        {pendingCount > 0 && <Pill tone="warn">{pendingCount} to review</Pill>}
      </div>
      {linkEmail && (
        <EmailComposer
          app={app}
          template="custom"
          initial={{
            subject: `Uploading proof of payment for ${app.child_first_name}`,
            body: `Assalamu alaikum ${app.parent_name.split(/\s+/)[0] || app.parent_name},\n\nPlease use your personal secure link to upload proof of payment (screenshot or receipt, JPG, PNG or PDF) for ${app.child_first_name}${app.reference ? ` (${app.reference})` : ""}:\n${PAYMENT_LINK_TOKEN}\n\nThis link replaces any earlier one. Please do not share it.\n\nJazakum Allahu khairan,\nAdmissions Team\nTarbiyyah Global Academy`,
          }}
          note="Sending issues a new link and switches off any earlier one."
          onCancel={() => setLinkEmail(false)}
          onSent={(o) => { setLinkEmail(false); setNotice({ ok: true, text: o.text }); }}
        />
      )}
      {notice && <p role={notice.ok ? "status" : "alert"} className={`text-sm ${notice.ok ? "text-teal-700" : "text-red-700"}`}>{notice.text}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {proofs === null && !error && <p role="status" className="text-sm text-ink/65">Loading…</p>}
      {proofs && proofs.length === 0 && <p className="text-sm text-ink/65">No proof of payment uploaded yet. The family uploads through the personal link in the offer email.</p>}

      {proofs && proofs.length > 0 && (
        <ul className="space-y-3">
          {proofs.map((p) => (
            <li key={p.id} className="rounded-xl border border-gold-light/50 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-ink">{p.file_name || "Proof of payment"}</p>
                  <p className="text-xs text-ink/65">
                    {new Date(p.uploaded_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })} · {(p.size_bytes / 1048576).toFixed(1)} MB
                  </p>
                </div>
                {statusPill(p)}
              </div>
              <p className="mt-1 text-xs text-ink/75">
                Covers: {p.covers.length ? p.covers.map((c) => COVER_LABELS[c] || c).join(", ") : p.kind}
                {p.plan ? ` · Plan: ${PLAN_LABELS[p.plan]}` : ""}
                {p.amount_claimed !== null ? ` · Family says ${gbp(p.amount_claimed)}` : ""}
              </p>
              {p.family_note && <p className="mt-1 text-xs italic text-ink/70">&ldquo;{p.family_note}&rdquo;</p>}
              {p.status !== "pending" && (
                <p className="mt-1 text-xs text-ink/65">
                  {p.status === "verified" ? `Verified${p.amount_verified !== null ? ` at ${gbp(p.amount_verified)}` : ""}` : "Rejected"}
                  {p.verified_by && staffNames[p.verified_by] ? ` by ${staffNames[p.verified_by]}` : ""}
                  {p.verified_at ? ` on ${new Date(p.verified_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}` : ""}
                  {p.note ? ` - ${p.note}` : ""}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => void view(p)} disabled={busyId === p.id} className={ghostBtn}>{busyId === p.id ? "Working…" : viewing?.id === p.id ? "Reload" : "View"}</button>
                {p.status === "pending" && (
                  <>
                    <button type="button" onClick={() => { setRejecting(null); setVerifying({ id: p.id, amount: p.amount_claimed !== null ? String(p.amount_claimed) : "", email: ctx.templates.payment_received?.auto_send ?? true }); }} className={primaryBtn}>Verify</button>
                    <button type="button" onClick={() => { setVerifying(null); setRejecting({ id: p.id, reason: "", email: ctx.templates.payment_rejected?.auto_send ?? true }); }} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50">Reject</button>
                  </>
                )}
                {p.status !== "pending" && <button type="button" onClick={() => void reset(p)} disabled={busyId === p.id} className="text-xs text-ink/65 underline">Reset to pending</button>}
              </div>

              {verifying?.id === p.id && (
                <div className="mt-3 space-y-2 rounded-lg bg-cream/60 p-3">
                  <label className="block text-sm font-medium text-ink">
                    Amount seen on the proof (£)
                    <input type="text" min="0" step="0.01" inputMode="decimal" value={verifying.amount} onChange={(e) => setVerifying({ ...verifying, amount: e.target.value })} className={fieldCls} />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" checked={verifying.email} onChange={(e) => setVerifying({ ...verifying, email: e.target.checked })} />
                    Email the family a confirmation
                  </label>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => void verify()} disabled={busyId === p.id} className={primaryBtn}>Confirm verified</button>
                    <button type="button" onClick={() => setVerifying(null)} className="text-sm text-ink/70 underline">Cancel</button>
                  </div>
                </div>
              )}
              {rejecting?.id === p.id && (
                <div className="mt-3 space-y-2 rounded-lg bg-red-50/60 p-3">
                  <label className="block text-sm font-medium text-ink">
                    Reason (shown to the family)
                    <textarea value={rejecting.reason} onChange={(e) => setRejecting({ ...rejecting, reason: e.target.value })} rows={3} maxLength={2000} placeholder="e.g. The screenshot is cropped and the amount isn't visible." className={fieldCls} />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" checked={rejecting.email} onChange={(e) => setRejecting({ ...rejecting, email: e.target.checked })} />
                    Email the family with a new upload link
                  </label>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => void reject()} disabled={busyId === p.id} className="rounded-lg bg-red-700 px-4 py-1.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">Reject proof</button>
                    <button type="button" onClick={() => setRejecting(null)} className="text-sm text-ink/70 underline">Cancel</button>
                  </div>
                </div>
              )}
              {viewing?.id === p.id && (
                <div className="mt-3 space-y-2">
                  <div className="flex justify-end gap-2 text-xs font-semibold">
                    <a href={viewing.url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-gold-light px-3 py-1 text-ink/80 hover:bg-cream">Open in new tab</a>
                    <button type="button" onClick={() => setViewing(null)} className="px-2 py-1 text-ink/70 underline">Close</button>
                  </div>
                  <FilePreview key={viewing.url} url={viewing.url} type={viewing.type || "application/pdf"} name={viewing.name} heightClass="h-[26rem]" />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
