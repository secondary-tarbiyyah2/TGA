"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { btn, ui } from "@/components/learn/ui";
import { Select } from "@/components/learn/Select";

type RuleRow = {
  id: number;
  category: string;
  label: string;
  description: string;
  retention_months: number;
  action: "delete" | "anonymise";
  allowed_actions: string[];
  basis_note: string;
  enabled: boolean;
  last_run_at: string | null;
  last_run_count: number | null;
};
type PreviewRow = {
  category: string;
  rule_label: string;
  action: string;
  retention_months: number;
  record_id: string;
  record_label: string;
  record_date: string;
  held: boolean;
  held_reason: string | null;
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function RuleCard({ rule, due, onChanged }: { rule: RuleRow; due: PreviewRow[]; onChanged: () => void }) {
  const supabase = getSupabaseClient();
  const [months, setMonths] = useState(String(rule.retention_months));
  const [action, setAction] = useState<string>(rule.action);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [basis, setBasis] = useState(rule.basis_note);
  const [showList, setShowList] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const runnable = due.filter((d) => !d.held);
  const held = due.filter((d) => d.held);
  const monthsNum = Number(months);
  const validMonths = Number.isInteger(monthsNum) && monthsNum >= 1 && monthsNum <= 600;
  const dirty = monthsNum !== rule.retention_months || action !== rule.action || enabled !== rule.enabled || basis !== rule.basis_note;

  async function save() {
    if (!supabase || !validMonths) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.from("retention_rules").update({ retention_months: monthsNum, action, enabled, basis_note: basis }).eq("id", rule.id);
    setBusy(false);
    if (error) {
      setMessage(`Couldn't save. Please try again.`);
      return;
    }
    setReviewed(false);
    setMessage("Saved. The list below has been recalculated.");
    onChanged();
  }

  async function run() {
    if (!supabase) return;
    const verb = rule.action === "delete" ? "permanently delete" : "anonymise";
    if (!confirm(`This will ${verb} ${runnable.length} record(s) under "${rule.label}". It cannot be undone. Continue?`)) return;
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.rpc("retention_run", { p_category: rule.category, p_expected: runnable.length });
    setBusy(false);
    if (error) {
      setMessage(`Nothing was changed. Please try again.`);
      onChanged();
      return;
    }
    setReviewed(false);
    setShowList(false);
    setMessage(`Done: ${Number(data ?? 0)} record(s) ${rule.action === "delete" ? "deleted" : "anonymised"}. The run is in the audit log.`);
    onChanged();
  }

  return (
    <li className="rounded-xl border border-gold-light/60 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink">{rule.label}</p>
          <p className="text-xs text-ink/65">{rule.description}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${!rule.enabled ? "bg-ink/10 text-ink/65" : runnable.length > 0 ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-800"}`}>
          {!rule.enabled ? "Switched off" : runnable.length > 0 ? `${runnable.length} due` : "Nothing due"}
          {rule.enabled && held.length > 0 ? ` · ${held.length} held back` : ""}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <label className="text-xs text-ink/70">
          Keep for (months)
          <input type="text" inputMode="decimal" min={1} max={600} value={months} onChange={(e) => setMonths(e.target.value)} className={`${ui.input} mt-1`} />
        </label>
        <label className="text-xs text-ink/70">
          Then
          <Select value={action} onChange={(e) => setAction(e.target.value)} className={`${ui.select} mt-1`}>
            {rule.allowed_actions.map((a) => (
              <option key={a} value={a}>
                {a === "delete" ? "Delete" : "Anonymise"}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-end gap-2 pb-1.5 text-xs text-ink/70">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Rule is on
        </label>
        <div className="flex items-end">
          <button type="button" onClick={save} disabled={busy || !dirty || !validMonths} className={btn("primary", "sm")}>
            Save rule
          </button>
        </div>
      </div>
      <label className="mt-2 block text-xs text-ink/70">
        Basis for this period (your note - check with legal / ICO guidance)
        <textarea value={basis} onChange={(e) => setBasis(e.target.value)} rows={2} className={`${ui.textarea} mt-1`} />
      </label>
      <p className="mt-1 text-xs text-ink/65">
        {rule.last_run_at ? `Last run ${new Date(rule.last_run_at).toLocaleString("en-GB")}: ${rule.last_run_count ?? 0} record(s).` : "Never run."}
      </p>

      {message && <p role="status" className="mt-2 rounded-lg bg-cream px-3 py-1.5 text-xs text-ink/80">{message}</p>}

      {rule.enabled && due.length > 0 && (
        <div className="mt-3 border-t border-gold-light/40 pt-3">
          <button type="button" onClick={() => setShowList((v) => !v)} className="text-xs font-medium text-teal-700 underline">
            {showList ? "Hide the list" : "Review the list before running"}
          </button>
          {showList && (
            <div className="mt-2">
              {due.length >= 1000 && <p className="mb-1 text-xs text-amber-800">Showing the first 1,000 records.</p>}
              <div className="max-h-64 overflow-auto rounded-lg border border-gold-light/40">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-cream text-left text-ink/65">
                      <th className="px-2 py-1.5">Record</th>
                      <th className="px-2 py-1.5">Last activity</th>
                      <th className="px-2 py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {due.map((d) => (
                      <tr key={d.record_id} className="border-t border-gold-light/30">
                        <td className="px-2 py-1">{d.record_label}</td>
                        <td className="px-2 py-1 whitespace-nowrap">{fmtDate(d.record_date)}</td>
                        <td className="px-2 py-1">{d.held ? <span className="text-amber-800">Held back: {d.held_reason}</span> : `Will be ${rule.action === "delete" ? "deleted" : "anonymised"}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {runnable.length > 0 && (
                <div className="mt-3 space-y-2">
                  <label className="flex items-start gap-2 text-xs text-ink/80">
                    <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="mt-0.5" />
                    I have reviewed this list and these {runnable.length} record(s) are no longer needed.
                  </label>
                  <button type="button" onClick={run} disabled={busy || !reviewed} className={btn("danger", "sm")}>
                    {rule.action === "delete" ? `Delete ${runnable.length} record(s) now` : `Anonymise ${runnable.length} record(s) now`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Admin-editable retention rules with a dry-run-first workflow. Nothing here
 * runs automatically: the list shows exactly what a run would remove, and the
 * run only proceeds if the number of records still matches what was reviewed.
 */
export function RetentionRules() {
  const supabase = getSupabaseClient();
  const [rules, setRules] = useState<RuleRow[] | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [r, p] = await Promise.all([supabase.from("retention_rules").select("*").order("label"), supabase.rpc("retention_preview")]);
    if (r.error) setError(r.error.message);
    setRules((r.data as RuleRow[] | null) || []);
    setPreview((p.data as PreviewRow[] | null) || []);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Retention rules</h2>
      <div role="note" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
        The periods below are sensible starting points, not legal advice. Before you rely on or change them, check the latest ICO and DfE guidance and take advice from your legal adviser or Data Protection Officer. Records that must be kept by law (safeguarding files, financial records) are not covered by these rules.
      </div>
      <p className="mt-2 text-xs text-ink/65">
        Nothing is removed automatically from here. Review the list for a rule, tick the box, then run it. Every run is logged, and the audit history of removed records is redacted. Recordings, the sign-in log and (in part) messages are also handled by their own scheduled jobs; see the retention schedule on the Compliance page.
      </p>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {rules === null && <div className="mt-3 h-24 animate-pulse rounded-xl bg-cream" />}
      <ul className="mt-4 space-y-3">
        {(rules || []).map((r) => (
          <RuleCard key={`${r.id}-${r.retention_months}-${r.action}-${r.enabled}`} rule={r} due={preview.filter((p) => p.category === r.category)} onChanged={load} />
        ))}
      </ul>
    </div>
  );
}
