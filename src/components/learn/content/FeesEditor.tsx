"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Card } from "@/components/learn/Card";
import { triggerPublish } from "@/lib/learn/publishSiteContent";
import { formatGBP } from "@/lib/format";
import {
  FEE_DEFAULTS, FEE_POLICY_DEFAULTS, FEES_POLICY_REMINDER, roundingNote, INSTALMENT_CHOICES, MAX_INSTALMENTS, MAX_TERMS,
  computeFeeSchedule, describePlan, sanitiseFeeSettings, sumPounds,
} from "@/lib/fees";

type BandDraft = { key: string; id?: string; year_group_range: string; annual_fee: string; notes: string };

type SettingsDraft = {
  fee_terms: string;
  fee_instalments: string;
  application_fee: string;
  registration_fee: string;
  annual_discount_percent: string;
  payment_schedule_text: string;
  admissions_deposit_amount: string;
};

const input = "mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm";
let keyCounter = 0;
const newKey = () => `new-${++keyCounter}`;

const numOrNull = (v: string): number | null => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * Fees editor (/learn/admin/content -> Fees). The ANNUAL fee is the only fee
 * number stored per band; termly / monthly are derived (src/lib/fees.ts) from
 * the site-wide number of terms and monthly instalments set here. Saves to
 * fee_bands + the site_settings singleton, then triggers the site rebuild,
 * same as every other content editor.
 */
export function FeesEditor() {
  const supabase = getSupabaseClient();
  const [bands, setBands] = useState<BandDraft[] | null>(null);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [settings, setSettings] = useState<SettingsDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const [bandRes, setRes] = await Promise.all([
        supabase.from("fee_bands").select("id, year_group_range, order_index, annual_fee, notes").order("order_index"),
        supabase.from("site_settings").select("*").eq("id", true).maybeSingle(),
      ]);
      if (cancelled) return;
      const rows = (bandRes.data as { id: string; year_group_range: string; annual_fee: number; notes: string | null }[]) || [];
      setBands(rows.map((r) => ({ key: r.id, id: r.id, year_group_range: r.year_group_range, annual_fee: String(r.annual_fee), notes: r.notes || "" })));
      const s = (setRes.data as Record<string, unknown> | null) || {};
      const fs = sanitiseFeeSettings({ terms: s.fee_terms, instalments: s.fee_instalments });
      setSettings({
        fee_terms: String(fs.terms),
        fee_instalments: String(fs.instalments),
        application_fee: s.application_fee != null ? String(s.application_fee) : String(FEE_POLICY_DEFAULTS.applicationFee),
        registration_fee: s.registration_fee != null ? String(s.registration_fee) : String(FEE_POLICY_DEFAULTS.registrationFee),
        annual_discount_percent: s.annual_discount_percent != null ? String(s.annual_discount_percent) : String(FEE_POLICY_DEFAULTS.annualDiscountPercent),
        // Never blank: pre-fill the default so the admin edits real text.
        payment_schedule_text: typeof s.payment_schedule_text === "string" && s.payment_schedule_text.trim() ? s.payment_schedule_text : FEE_POLICY_DEFAULTS.paymentScheduleText,
        admissions_deposit_amount: s.admissions_deposit_amount != null ? String(s.admissions_deposit_amount) : "",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (!bands || !settings) return <p className="text-sm text-ink/60">Loading…</p>;

  const terms = Number(settings.fee_terms);
  const instalments = Number(settings.fee_instalments);
  const settingsOk = Number.isInteger(terms) && terms >= 1 && terms <= MAX_TERMS && Number.isInteger(instalments) && instalments >= 1 && instalments <= MAX_INSTALMENTS;
  const live = settingsOk ? { terms, instalments } : FEE_DEFAULTS;

  const problems: string[] = [];
  if (!settingsOk) problems.push(`Terms must be a whole number 1–${MAX_TERMS} and instalments a whole number 1–${MAX_INSTALMENTS}.`);
  bands.forEach((b, i) => {
    const n = numOrNull(b.annual_fee);
    if (!b.year_group_range.trim()) problems.push(`Band ${i + 1}: name is required.`);
    if (n == null || n <= 0) problems.push(`Band ${i + 1}: annual fee must be a positive number.`);
  });
  if (settings.application_fee.trim() !== "" && (numOrNull(settings.application_fee) ?? -1) < 0) problems.push("Application fee must be zero or more.");
  {
    const d = numOrNull(settings.annual_discount_percent);
    if (d == null || d < 0 || d > 100) problems.push("Annual payment discount must be between 0 and 100 (%).");
  }
  if (!settings.payment_schedule_text.trim()) problems.push("Payment schedule text cannot be blank.");
  if (settings.registration_fee.trim() !== "" && (numOrNull(settings.registration_fee) ?? -1) < 0) problems.push("Registration fee must be zero or more.");
  if (settings.admissions_deposit_amount.trim() !== "" && (numOrNull(settings.admissions_deposit_amount) ?? -1) < 0) problems.push("Deposit must be zero or more.");

  const patch = (key: string, p: Partial<BandDraft>) => setBands(bands.map((b) => (b.key === key ? { ...b, ...p } : b)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= bands.length) return;
    const next = [...bands];
    [next[i], next[j]] = [next[j], next[i]];
    setBands(next);
  };
  const remove = (b: BandDraft) => {
    if (b.id) setRemovedIds([...removedIds, b.id]);
    setBands(bands.filter((x) => x.key !== b.key));
  };

  async function save() {
    if (!supabase || !bands || !settings || problems.length > 0) return;
    setSaving(true);
    setMessage(null);

    // Settings first: if the 0057 migration has not been applied the failure
    // shows up here, before any band is touched.
    const { error: sErr } = await supabase.from("site_settings").update({
      fee_terms: terms,
      fee_instalments: instalments,
      application_fee: numOrNull(settings.application_fee),
      registration_fee: numOrNull(settings.registration_fee),
      annual_discount_percent: numOrNull(settings.annual_discount_percent) ?? FEE_POLICY_DEFAULTS.annualDiscountPercent,
      payment_schedule_text: settings.payment_schedule_text.trim() || FEE_POLICY_DEFAULTS.paymentScheduleText,
      admissions_deposit_amount: numOrNull(settings.admissions_deposit_amount),
    }).eq("id", true);
    if (sErr) {
      setSaving(false);
      setMessage(`Could not save settings: ${sErr.message}`);
      return;
    }

    // Only annual_fee is stored. Legacy termly_fee / monthly_fee are ignored by the site.
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      const payload = { year_group_range: b.year_group_range.trim(), order_index: i + 1, annual_fee: numOrNull(b.annual_fee) as number, notes: b.notes.trim() || null };
      const { error } = b.id ? await supabase.from("fee_bands").update(payload).eq("id", b.id) : await supabase.from("fee_bands").insert(payload);
      if (error) {
        setSaving(false);
        setMessage(`Could not save "${b.year_group_range}": ${error.message}`);
        return;
      }
    }
    if (removedIds.length > 0) {
      const { error } = await supabase.from("fee_bands").delete().in("id", removedIds);
      if (error) {
        setSaving(false);
        setMessage(`Could not delete removed bands: ${error.message}`);
        return;
      }
      setRemovedIds([]);
    }

    // Reload so new rows pick up their ids (avoids duplicate inserts on a second save).
    const { data } = await supabase.from("fee_bands").select("id, year_group_range, annual_fee, notes").order("order_index");
    const rows = (data as { id: string; year_group_range: string; annual_fee: number; notes: string | null }[]) || [];
    setBands(rows.map((r) => ({ key: r.id, id: r.id, year_group_range: r.year_group_range, annual_fee: String(r.annual_fee), notes: r.notes || "" })));

    const publishMessage = await triggerPublish();
    setSaving(false);
    setMessage(publishMessage);
  }

  return (
    <div className="space-y-6">
      <Card title="Fee schedule settings" description="Applies to every band. Termly and monthly amounts are worked out from the annual fee — you never type them.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-ink">
            Number of terms
            <input type="number" min={1} max={MAX_TERMS} step={1} value={settings.fee_terms} onChange={(e) => setSettings({ ...settings, fee_terms: e.target.value })} className={input} />
            <span className="mt-0.5 block text-xs text-ink/60">Default {FEE_DEFAULTS.terms} (Fees Policy: 19 Dec 2026 and 28 Mar 2027). Termly fee = annual fee ÷ terms.</span>
          </label>
          <label className="text-sm text-ink">
            Number of monthly instalments
            <input
              type="number"
              list="fee-instalment-choices"
              min={1}
              max={MAX_INSTALMENTS}
              step={1}
              value={settings.fee_instalments}
              onChange={(e) => setSettings({ ...settings, fee_instalments: e.target.value })}
              className={input}
            />
            <datalist id="fee-instalment-choices">
              {INSTALMENT_CHOICES.map((n) => <option key={n} value={n} />)}
            </datalist>
            <span className="mt-0.5 block text-xs text-ink/60">Default {FEE_DEFAULTS.instalments} (28 Dec 2026 to 28 Jun 2027). Monthly fee = annual fee ÷ instalments.</span>
          </label>
          <label className="text-sm text-ink">
            Application fee (£, non-refundable)
            <input type="number" min={0} step="0.01" value={settings.application_fee} onChange={(e) => setSettings({ ...settings, application_fee: e.target.value })} className={input} />
            <span className="mt-0.5 block text-xs text-ink/60">Default £{FEE_POLICY_DEFAULTS.applicationFee} (Fees Policy).</span>
          </label>
          <label className="text-sm text-ink">
            Annual payment discount (%)
            <input type="number" min={0} max={100} step="0.1" value={settings.annual_discount_percent} onChange={(e) => setSettings({ ...settings, annual_discount_percent: e.target.value })} className={input} />
            <span className="mt-0.5 block text-xs text-ink/60">Default {FEE_POLICY_DEFAULTS.annualDiscountPercent}%, if paid in full by 19 Dec 2026. Applied automatically in the fee estimator.</span>
          </label>
          <label className="text-sm text-ink">
            Registration fee (£, one-time)
            <input type="number" min={0} step="0.01" value={settings.registration_fee} onChange={(e) => setSettings({ ...settings, registration_fee: e.target.value })} className={input} />
          </label>
          <label className="text-sm text-ink sm:col-span-2">
            Payment schedule text (shown on the Fees page)
            <textarea rows={4} value={settings.payment_schedule_text} onChange={(e) => setSettings({ ...settings, payment_schedule_text: e.target.value })} className={input} />
            <button type="button" onClick={() => setSettings({ ...settings, payment_schedule_text: FEE_POLICY_DEFAULTS.paymentScheduleText })} className="mt-1 text-xs text-gold-700 underline">Reset to policy default</button>
          </label>
          <label className="text-sm text-ink">
            Deposit (£, default amount)
            <input type="number" min={0} step="0.01" value={settings.admissions_deposit_amount} onChange={(e) => setSettings({ ...settings, admissions_deposit_amount: e.target.value })} className={input} />
            <span className="mt-0.5 block text-xs text-ink/60">Default deposit used by the admissions process. Leave blank for none.</span>
          </label>
        </div>
      </Card>

      <Card title="Fee bands" description="Name, order, annual fee and an optional note. Published on the Fees page and used by the fee estimator.">
        <ul className="space-y-4">
          {bands.map((b, i) => (
            <li key={b.key} className="rounded-xl border border-gold-light/50 p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                <label className="text-sm text-ink">
                  Band name
                  <input value={b.year_group_range} onChange={(e) => patch(b.key, { year_group_range: e.target.value })} className={input} placeholder="e.g. Reception – Year 2" />
                </label>
                <label className="text-sm text-ink">
                  Annual fee (£)
                  <input type="number" min={0} step="0.01" value={b.annual_fee} onChange={(e) => patch(b.key, { annual_fee: e.target.value })} className={input} />
                </label>
                <label className="text-sm text-ink sm:col-span-2">
                  Note (optional)
                  <input value={b.notes} onChange={(e) => patch(b.key, { notes: e.target.value })} className={input} placeholder="e.g. GCSE exam entry fees are billed separately." />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded-full border border-gold-light/60 px-3 py-1 disabled:opacity-40">Move up</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === bands.length - 1} className="rounded-full border border-gold-light/60 px-3 py-1 disabled:opacity-40">Move down</button>
                <button type="button" onClick={() => remove(b)} className="rounded-full border border-red-300 px-3 py-1 text-red-700">Remove</button>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setBands([...bands, { key: newKey(), year_group_range: "", annual_fee: "", notes: "" }])}
          className="mt-4 rounded-full border border-gold-light/60 px-4 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream"
        >
          Add a band
        </button>
        <p className="mt-2 text-xs text-ink/60">Order here is the order on the public page. The fee estimator and quiz expect bands in year-group order (Reception first).</p>
      </Card>

      <Card title="Live preview" description="Exactly what the public Fees page will show after saving.">
        <div className="overflow-x-auto rounded-xl border border-gold-light/50">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-cream text-ink/70">
              <tr>
                <th className="px-3 py-2 font-semibold">Band</th>
                <th className="px-3 py-2 font-semibold">Annual total</th>
                <th className="px-3 py-2 font-semibold">Termly ({live.terms})</th>
                <th className="px-3 py-2 font-semibold">Monthly ({live.instalments})</th>
                <th className="px-3 py-2 font-semibold">Sum check</th>
              </tr>
            </thead>
            <tbody>
              {bands.map((b) => {
                const annual = numOrNull(b.annual_fee);
                if (annual == null || annual <= 0) {
                  return (
                    <tr key={b.key} className="border-t border-gold-light/40"><td className="px-3 py-2">{b.year_group_range || "(unnamed)"}</td><td colSpan={4} className="px-3 py-2 text-red-700">Enter an annual fee.</td></tr>
                  );
                }
                const sched = computeFeeSchedule(annual, live);
                const termly = describePlan(sched.termly, "term");
                const monthly = describePlan(sched.monthly, "month");
                const note = roundingNote(sched.monthly);
                const ok = sumPounds(sched.termly) === sched.annual && sumPounds(sched.monthly) === sched.annual;
                return (
                  <tr key={b.key} className="border-t border-gold-light/40 align-top">
                    <td className="px-3 py-2 font-medium text-ink">{b.year_group_range || "(unnamed)"}</td>
                    <td className="px-3 py-2">{formatGBP(sched.annual)}</td>
                    <td className="px-3 py-2">{termly.headline}<span className="block text-xs text-ink/70">{termly.detail}</span></td>
                    <td className="px-3 py-2">{monthly.headline}<span className="block text-xs text-ink/70">{monthly.detail}</span>{note && <span className="mt-1 block text-xs text-amber-700">{note} Check this matches the Fees Policy PDF.</span>}</td>
                    <td className={`px-3 py-2 font-semibold ${ok ? "text-green-700" : "text-red-700"}`}>
                      {ok ? `OK — both plans total ${formatGBP(sched.annual)}` : "MISMATCH"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 rounded-lg bg-gold-100 px-3 py-2 text-sm text-ink/80">
          <strong>Reminder:</strong> {FEES_POLICY_REMINDER} The policy document is a separate PDF and is not updated by this page.
        </p>
        {problems.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-700" role="alert">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
        <button type="button" onClick={save} disabled={saving || problems.length > 0} className="mt-5 rounded-full bg-gold-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-60">
          {saving ? "Saving…" : "Save fees"}
        </button>
        {message && <p className="mt-2 text-sm text-ink/70">{message}</p>}
      </Card>
    </div>
  );
}
