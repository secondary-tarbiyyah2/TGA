"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Card } from "@/components/learn/Card";
import { SaveBar } from "./SaveBar";
import { triggerPublish } from "@/lib/learn/publishSiteContent";
import { formatGBP } from "@/lib/format";
import type { Discount } from "@/content/seed";
import {
  FEE_DEFAULTS, FEE_POLICY_DEFAULTS, FEES_POLICY_REMINDER, roundingNote, INSTALMENT_CHOICES, MAX_INSTALMENTS, MAX_TERMS,
  computeFeeSchedule, describePlan, sanitiseFeeSettings, sumPounds,
} from "@/lib/fees";
import { btn } from "@/components/learn/ui";
import { Select } from "@/components/learn/Select";

type BandDraft = { key: string; id?: string; year_group_range: string; annual_fee: string; notes: string };

type SettingsDraft = {
  fee_terms: string;
  fee_instalments: string;
  application_fee: string;
  annual_discount_percent: string;
  payment_schedule_text: string;
  admissions_deposit_amount: string;
  sibling_discount_percent: string;
  sibling_discount_note: string;
};

type DiscountDraft = { key: string; label: string; type: "percent" | "fixedAmount"; value: string; note: string; eligibility: string; auto: boolean };

const input = "mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm";
/** What the form holds, for spotting unsaved changes (row keys are left out as they are only for React). */
const withoutKey = <T extends { key: string }>(x: T) => JSON.stringify({ ...x, key: undefined });
const snap = (b: BandDraft[], s: SettingsDraft, d: DiscountDraft[], removed: string[]) => JSON.stringify({ b: b.map(withoutKey), s, d: d.map(withoutKey), removed });
let keyCounter = 0;
const newKey = () => `new-${++keyCounter}`;

/** "£2,130.00" or "2130" -> 2130; blank or not a number -> null. */
const numOrNull = (v: string): number | null => {
  const t = v.replace(/[£,\s%]/g, "");
  return t === "" || !Number.isFinite(Number(t)) ? null : Number(t);
};

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
  const [discountDrafts, setDiscountDrafts] = useState<DiscountDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [savedJson, setSavedJson] = useState("");

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
      const loadedBands = rows.map((r) => ({ key: r.id, id: r.id, year_group_range: r.year_group_range, annual_fee: String(r.annual_fee), notes: r.notes || "" }));
      setBands(loadedBands);
      const s = (setRes.data as Record<string, unknown> | null) || {};
      const fs = sanitiseFeeSettings({ terms: s.fee_terms, instalments: s.fee_instalments });
      const loadedSettings: SettingsDraft = {
        fee_terms: String(fs.terms),
        fee_instalments: String(fs.instalments),
        application_fee: s.application_fee != null ? String(s.application_fee) : String(FEE_POLICY_DEFAULTS.applicationFee),
        annual_discount_percent: s.annual_discount_percent != null ? String(s.annual_discount_percent) : String(FEE_POLICY_DEFAULTS.annualDiscountPercent),
        // Never blank: pre-fill the default so the admin edits real text.
        payment_schedule_text: typeof s.payment_schedule_text === "string" && s.payment_schedule_text.trim() ? s.payment_schedule_text : FEE_POLICY_DEFAULTS.paymentScheduleText,
        admissions_deposit_amount: s.admissions_deposit_amount != null ? String(s.admissions_deposit_amount) : "",
        sibling_discount_percent: s.sibling_discount_percent != null ? String(s.sibling_discount_percent) : "",
        sibling_discount_note: typeof s.sibling_discount_note === "string" ? s.sibling_discount_note : "",
      };
      setSettings(loadedSettings);
      const cat = Array.isArray(s.discounts) ? (s.discounts as Discount[]) : [];
      const loadedDiscounts: DiscountDraft[] = cat.map((d) => ({
        key: newKey(),
        label: d.label ?? "",
        type: d.type === "fixedAmount" ? "fixedAmount" : "percent",
        value: String(d.type === "fixedAmount" ? d.fixedAmount ?? "" : d.percent ?? ""),
        note: d.note ?? "",
        eligibility: d.eligibilityDescription ?? "",
        auto: !!d.appliesAutomatically,
      }));
      setDiscountDrafts(loadedDiscounts);
      setSavedJson(snap(loadedBands, loadedSettings, loadedDiscounts, []));
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (!bands || !settings) return <p className="text-sm text-ink/65">Loading…</p>;
  const dirty = savedJson !== "" && snap(bands, settings, discountDrafts, removedIds) !== savedJson;

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
  if (settings.sibling_discount_percent.trim() !== "") {
    const d = numOrNull(settings.sibling_discount_percent);
    if (d == null || d < 0 || d > 100) problems.push("Sibling discount must be between 0 and 100 (%).");
  }
  discountDrafts.forEach((d, i) => {
    const v = numOrNull(d.value);
    if (!d.label.trim()) problems.push(`Discount ${i + 1}: name is required.`);
    if (v == null || v <= 0 || (d.type === "percent" && v > 100)) problems.push(`Discount ${i + 1}: enter a ${d.type === "percent" ? "percentage between 0 and 100" : "positive amount in pounds"}.`);
  });
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
      annual_discount_percent: numOrNull(settings.annual_discount_percent) ?? FEE_POLICY_DEFAULTS.annualDiscountPercent,
      payment_schedule_text: settings.payment_schedule_text.trim() || FEE_POLICY_DEFAULTS.paymentScheduleText,
      admissions_deposit_amount: numOrNull(settings.admissions_deposit_amount),
      sibling_discount_percent: numOrNull(settings.sibling_discount_percent),
      sibling_discount_note: settings.sibling_discount_note.trim() || null,
      discounts: discountDrafts.map((d): Discount => {
        const v = numOrNull(d.value) as number;
        return {
          label: d.label.trim(),
          type: d.type,
          ...(d.type === "percent" ? { percent: v } : { fixedAmount: v }),
          ...(d.note.trim() ? { note: d.note.trim() } : {}),
          ...(d.eligibility.trim() ? { eligibilityDescription: d.eligibility.trim() } : {}),
          appliesAutomatically: d.auto,
        };
      }),
    }).eq("id", true);
    if (sErr) {
      setSaving(false);
      setMessage("Could not save the fee settings. Please try again.");
      return;
    }

    // Only annual_fee is stored. Legacy termly_fee / monthly_fee are ignored by the site.
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      const payload = { year_group_range: b.year_group_range.trim(), order_index: i + 1, annual_fee: numOrNull(b.annual_fee) as number, notes: b.notes.trim() || null };
      const { error } = b.id ? await supabase.from("fee_bands").update(payload).eq("id", b.id) : await supabase.from("fee_bands").insert(payload);
      if (error) {
        setSaving(false);
        setMessage(`Could not save "${b.year_group_range}". Please try again.`);
        return;
      }
    }
    if (removedIds.length > 0) {
      const { error } = await supabase.from("fee_bands").delete().in("id", removedIds);
      if (error) {
        setSaving(false);
        setMessage(`Could not delete removed bands. Please try again.`);
        return;
      }
      setRemovedIds([]);
    }

    // Reload so new rows pick up their ids (avoids duplicate inserts on a second save).
    const { data } = await supabase.from("fee_bands").select("id, year_group_range, annual_fee, notes").order("order_index");
    const rows = (data as { id: string; year_group_range: string; annual_fee: number; notes: string | null }[]) || [];
    const reloaded = rows.map((r) => ({ key: r.id, id: r.id, year_group_range: r.year_group_range, annual_fee: String(r.annual_fee), notes: r.notes || "" }));
    setBands(reloaded);
    setSavedJson(snap(reloaded, settings, discountDrafts, []));

    const publishMessage = await triggerPublish();
    setSaving(false);
    setMessage(publishMessage);
  }

  return (
    <div className="space-y-6">
      <Card title="Fee schedule settings" description="Applies to every band. The two-payment and monthly amounts are worked out from the annual fee, you never type them.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-ink">
            Number of payments (instalment plan)
            <input type="text" inputMode="decimal" min={1} max={MAX_TERMS} step={1} value={settings.fee_terms} onChange={(e) => setSettings({ ...settings, fee_terms: e.target.value })} className={input} />
            <span className="mt-0.5 block text-xs text-ink/65">Default {FEE_DEFAULTS.terms} (Fees Policy: 8 Jan 2027 and 28 Mar 2027). Each payment = annual fee ÷ number of payments.</span>
          </label>
          <label className="text-sm text-ink">
            Number of monthly instalments
            <input
              type="text" inputMode="decimal"
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
            <span className="mt-0.5 block text-xs text-ink/65">Default {FEE_DEFAULTS.instalments} (8 Jan 2027, then 28 Jan to 28 Jun 2027). Monthly fee = annual fee ÷ instalments.</span>
          </label>
          <label className="text-sm text-ink">
            Application fee (£, non-refundable)
            <input type="text" inputMode="decimal" min={0} step="0.01" value={settings.application_fee} onChange={(e) => setSettings({ ...settings, application_fee: e.target.value })} className={input} />
            <span className="mt-0.5 block text-xs text-ink/65">Default £{FEE_POLICY_DEFAULTS.applicationFee} (Fees Policy). Covers the baseline assessment and admin review. This is the only admissions fee (there is no registration fee). Shown on the Admissions, Apply and Fees pages and in the fee estimator.</span>
          </label>
          <label className="text-sm text-ink">
            Annual payment discount (%)
            <input type="text" inputMode="decimal" min={0} max={100} step="0.1" value={settings.annual_discount_percent} onChange={(e) => setSettings({ ...settings, annual_discount_percent: e.target.value })} className={input} />
            <span className="mt-0.5 block text-xs text-ink/65">Default {FEE_POLICY_DEFAULTS.annualDiscountPercent}%, if paid in full by 8 Jan 2027. Applied automatically in the fee estimator.</span>
          </label>
          <label className="text-sm text-ink sm:col-span-2">
            Payment schedule text (shown on the Fees page)
            <textarea rows={4} value={settings.payment_schedule_text} onChange={(e) => setSettings({ ...settings, payment_schedule_text: e.target.value })} className={input} />
            <button type="button" onClick={() => setSettings({ ...settings, payment_schedule_text: FEE_POLICY_DEFAULTS.paymentScheduleText })} className="mt-1 text-xs text-gold-700 underline">Reset to policy default</button>
          </label>
          <label className="text-sm text-ink">
            Deposit (£, default amount)
            <input type="text" inputMode="decimal" min={0} step="0.01" value={settings.admissions_deposit_amount} onChange={(e) => setSettings({ ...settings, admissions_deposit_amount: e.target.value })} className={input} />
            <span className="mt-0.5 block text-xs text-ink/65">Default deposit used by the admissions process. Leave blank for none.</span>
          </label>
        </div>
      </Card>

      <Card title="Discounts" description="Used by the fee estimator. The annual payment discount is set above. A sibling discount applies to each child after the first; other discounts below are applied automatically or offered as tick-boxes.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-ink">
            Sibling discount (%)
            <input type="text" inputMode="decimal" min={0} max={100} step="0.1" value={settings.sibling_discount_percent} onChange={(e) => setSettings({ ...settings, sibling_discount_percent: e.target.value })} className={input} />
            <span className="mt-0.5 block text-xs text-ink/65">Leave blank for no sibling discount.</span>
          </label>
          <label className="text-sm text-ink">
            Sibling discount note
            <input value={settings.sibling_discount_note} onChange={(e) => setSettings({ ...settings, sibling_discount_note: e.target.value })} className={input} placeholder="e.g. Applies to the second and each later child." />
          </label>
        </div>
        <ul className="mt-4 space-y-3">
          {discountDrafts.map((d) => {
            const patchD = (p: Partial<DiscountDraft>) => setDiscountDrafts(discountDrafts.map((x) => (x.key === d.key ? { ...x, ...p } : x)));
            return (
              <li key={d.key} className="grid gap-3 rounded-xl border border-gold-light/50 p-4 sm:grid-cols-2">
                <label className="text-sm text-ink">
                  Name
                  <input value={d.label} onChange={(e) => patchD({ label: e.target.value })} className={input} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm text-ink">
                    Type
                    <Select value={d.type} onChange={(e) => patchD({ type: e.target.value as DiscountDraft["type"] })} className={input}>
                      <option value="percent">Percent (%)</option>
                      <option value="fixedAmount">Fixed amount (£)</option>
                    </Select>
                  </label>
                  <label className="text-sm text-ink">
                    {d.type === "percent" ? "Percent" : "Amount (£)"}
                    <input type="text" inputMode="decimal" min={0} step="0.01" value={d.value} onChange={(e) => patchD({ value: e.target.value })} className={input} />
                  </label>
                </div>
                <label className="text-sm text-ink">
                  Note shown with the discount (optional)
                  <input value={d.note} onChange={(e) => patchD({ note: e.target.value })} className={input} />
                </label>
                <label className="text-sm text-ink">
                  Who qualifies (optional)
                  <input value={d.eligibility} onChange={(e) => patchD({ eligibility: e.target.value })} className={input} />
                </label>
                <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
                  <input type="checkbox" checked={d.auto} onChange={(e) => patchD({ auto: e.target.checked })} />
                  Apply automatically to every estimate (otherwise families tick it if they believe they qualify)
                </label>
                <div className="sm:col-span-2">
                  <button type="button" onClick={() => setDiscountDrafts(discountDrafts.filter((x) => x.key !== d.key))} className="rounded-full border border-red-300 px-3 py-1 text-xs text-red-700">Remove discount</button>
                </div>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => setDiscountDrafts([...discountDrafts, { key: newKey(), label: "", type: "percent", value: "", note: "", eligibility: "", auto: false }])}
          className={`${btn("secondary")} mt-4`}
        >
          Add a discount
        </button>

      </Card>

      <Card title="Fee bands" description="Name, order, annual fee and an optional note. Published on the Fees page and used by the fee estimator.">
        <ul className="space-y-4">
          {bands.map((b, i) => (
            <li key={b.key} className="rounded-xl border border-gold-light/50 p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                <label className="text-sm text-ink">
                  Band name
                  <input value={b.year_group_range} onChange={(e) => patch(b.key, { year_group_range: e.target.value })} className={input} placeholder="e.g. Year 1 – Year 2" />
                </label>
                <label className="text-sm text-ink">
                  Annual fee (£)
                  <input type="text" inputMode="decimal" min={0} step="0.01" value={b.annual_fee} onChange={(e) => patch(b.key, { annual_fee: e.target.value })} className={input} />
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
          className={`${btn("secondary")} mt-4`}
        >
          Add a band
        </button>
        <p className="mt-2 text-xs text-ink/65">Order here is the order on the public page. The fee estimator and quiz expect bands in year-group order (Year 1 first).</p>
      </Card>

      <Card title="Live preview" description="Exactly what the public Fees page will show after saving.">
        <div className="overflow-x-auto rounded-xl border border-gold-light/50">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-cream text-ink/70">
              <tr>
                <th className="px-3 py-2 font-semibold">Band</th>
                <th className="px-3 py-2 font-semibold">Annual total</th>
                <th className="px-3 py-2 font-semibold">{live.terms} payments</th>
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
                      {ok ? `OK, both plans total ${formatGBP(sched.annual)}` : "MISMATCH"}
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
      </Card>
      {problems.length > 0 && (
        <ul className="list-disc space-y-1 rounded-xl border border-red-200 bg-red-50 py-3 pl-8 pr-4 text-sm text-red-800" role="alert">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <SaveBar
        onSave={save}
        saving={saving}
        dirty={dirty}
        disabled={problems.length > 0}
        label="Save fees"
        message={problems.length > 0 ? `Fix ${problems.length} problem${problems.length === 1 ? "" : "s"} above before saving.` : message}
        error={problems.length > 0 || !!message?.startsWith("Could not")}
      />
    </div>
  );
}
