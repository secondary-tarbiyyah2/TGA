"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ui } from "@/components/learn/ui";

export type BaselineRow = {
  id: string;
  child_id: string;
  provider: string;
  test: "CAT4" | "NGRT" | "PTE" | "PTM" | "Baseline interview" | "Other";
  level: string | null;
  taken_on: string;
  verbal_sas: number | null;
  quantitative_sas: number | null;
  nonverbal_sas: number | null;
  spatial_sas: number | null;
  mean_sas: number | null;
  score_sas: number | null;
  stanine: number | null;
  percentile: number | null;
  age_equivalent: string | null;
  notes: string | null;
  source: "manual" | "csv_import";
};

export const TESTS: { key: BaselineRow["test"]; label: string; batteries: boolean }[] = [
  { key: "CAT4", label: "CAT4 (reasoning: verbal, quantitative, non-verbal, spatial)", batteries: true },
  { key: "NGRT", label: "NGRT (reading)", batteries: false },
  { key: "PTE", label: "PTE (English)", batteries: false },
  { key: "PTM", label: "PTM (maths)", batteries: false },
  { key: "Baseline interview", label: "Baseline interview / Academy entry check", batteries: false },
  { key: "Other", label: "Other", batteries: false },
];

/** GL's SAS bands, as GL describes them (mean 100, SD 15). */
export function sasBand(sas: number | null): { label: string; cls: string } | null {
  if (sas == null) return null;
  if (sas >= 127) return { label: "Very high", cls: "bg-teal-700/10 text-teal-700" };
  if (sas >= 112) return { label: "Above average", cls: "bg-teal-700/10 text-teal-700" };
  if (sas >= 89) return { label: "Average", cls: "bg-gold-100 text-gold-900" };
  if (sas >= 74) return { label: "Below average", cls: "bg-amber-100 text-amber-900" };
  return { label: "Very low", cls: "bg-red-100 text-red-800" };
}

const num = (v: string): number | null => (v.trim() === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

function Sas({ label, v }: { label: string; v: number | null }) {
  const b = sasBand(v);
  return (
    <div className="rounded-lg border border-gold-light/60 bg-cream/40 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/60">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-ink">{v ?? "—"}</p>
      {b && <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.cls}`}>{b.label}</span>}
    </div>
  );
}

/**
 * Standardised / baseline assessment results on a pupil's record. Results
 * come from GL Assessment (recorded by hand from the report, or imported from
 * GL's CSV export at /admin/assessments); nothing here generates a score.
 */
export function BaselineAssessments({ childId, canEdit }: { childId: string; canEdit: boolean }) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<BaselineRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState({ test: "CAT4" as BaselineRow["test"], level: "", taken_on: "", verbal: "", quant: "", nonverbal: "", spatial: "", mean: "", score: "", stanine: "", percentile: "", age: "", notes: "" });

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("baseline_assessments").select("*").eq("child_id", childId).order("taken_on", { ascending: false });
    setRows((data as BaselineRow[]) || []);
  }, [supabase, childId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const test = TESTS.find((t) => t.key === f.test)!;

  async function save() {
    if (!supabase) return;
    if (!f.taken_on) return setMsg("Enter the date the test was taken.");
    setBusy(true);
    setMsg(null);
    const { data: u } = await supabase.auth.getUser();
    const payload = {
      child_id: childId, test: f.test, level: f.level.trim() || null, taken_on: f.taken_on,
      verbal_sas: test.batteries ? num(f.verbal) : null, quantitative_sas: test.batteries ? num(f.quant) : null,
      nonverbal_sas: test.batteries ? num(f.nonverbal) : null, spatial_sas: test.batteries ? num(f.spatial) : null,
      mean_sas: test.batteries ? num(f.mean) : null, score_sas: test.batteries ? null : num(f.score),
      stanine: num(f.stanine), percentile: num(f.percentile), age_equivalent: f.age.trim() || null, notes: f.notes.trim() || null,
      source: "manual", created_by: u.user?.id ?? null,
    };
    const { error } = await supabase.from("baseline_assessments").insert(payload);
    setBusy(false);
    if (error) return setMsg(`Could not save: ${error.message}`);
    setAdding(false);
    setF({ ...f, verbal: "", quant: "", nonverbal: "", spatial: "", mean: "", score: "", stanine: "", percentile: "", age: "", notes: "" });
    await load();
  }

  async function remove(r: BaselineRow) {
    if (!supabase || !confirm("Remove this result? The change is recorded in the audit log.")) return;
    await supabase.from("baseline_assessments").delete().eq("id", r.id);
    await load();
  }

  return (
    <section className={`${ui.card} print:break-inside-avoid`} aria-labelledby="baseline-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="baseline-heading" className="text-base font-semibold text-ink">Baseline and standardised assessments</h2>
          <p className="text-xs text-ink/65">GL Assessment results (CAT4, NGRT, PTE, PTM) as recorded from the GL report. SAS: mean 100, 89–111 is average.</p>
        </div>
        {canEdit && !adding && (
          <button type="button" onClick={() => setAdding(true)} className={ui.btnSecondary}>Add a result</button>
        )}
      </div>

      {rows === null ? (
        <p className="mt-3 text-sm text-ink/65">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink/65">No results recorded yet. Entry assessments are sat on GL's platform; record the scores here or import GL&apos;s CSV export from Assessments.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-gold-light/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">
                  {r.test}{r.level ? ` · Level ${r.level}` : ""} <span className="font-normal text-ink/65">· {new Date(r.taken_on).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {r.provider}{r.source === "csv_import" ? " · imported" : ""}</span>
                </p>
                {canEdit && <button type="button" onClick={() => remove(r)} className={ui.btnLinkDanger}>Remove</button>}
              </div>
              {r.test === "CAT4" ? (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Sas label="Verbal" v={r.verbal_sas} /><Sas label="Quantitative" v={r.quantitative_sas} /><Sas label="Non-verbal" v={r.nonverbal_sas} /><Sas label="Spatial" v={r.spatial_sas} /><Sas label="Mean" v={r.mean_sas} />
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Sas label="SAS" v={r.score_sas} />
                  {r.stanine != null && <div className="rounded-lg border border-gold-light/60 bg-cream/40 px-3 py-2"><p className="text-[11px] font-semibold uppercase tracking-wide text-ink/60">Stanine</p><p className="text-lg font-semibold tabular-nums">{r.stanine}</p></div>}
                  {r.percentile != null && <div className="rounded-lg border border-gold-light/60 bg-cream/40 px-3 py-2"><p className="text-[11px] font-semibold uppercase tracking-wide text-ink/60">Percentile</p><p className="text-lg font-semibold tabular-nums">{r.percentile}</p></div>}
                  {r.age_equivalent && <div className="rounded-lg border border-gold-light/60 bg-cream/40 px-3 py-2"><p className="text-[11px] font-semibold uppercase tracking-wide text-ink/60">Age equivalent</p><p className="text-lg font-semibold">{r.age_equivalent}</p></div>}
                </div>
              )}
              {r.notes && <p className="mt-2 text-sm text-ink/75">{r.notes}</p>}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-4 space-y-3 rounded-xl border border-gold-light/60 bg-cream/40 p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm text-ink">Test
              <select value={f.test} onChange={(e) => setF({ ...f, test: e.target.value as BaselineRow["test"] })} className={`mt-1 ${ui.input}`}>
                {TESTS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>
            <label className="text-sm text-ink">Level (e.g. C, D, E)
              <input value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} className={`mt-1 ${ui.input}`} />
            </label>
            <label className="text-sm text-ink">Date taken
              <input type="date" value={f.taken_on} onChange={(e) => setF({ ...f, taken_on: e.target.value })} className={`mt-1 ${ui.input}`} />
            </label>
          </div>
          {test.batteries ? (
            <div className="grid gap-3 sm:grid-cols-5">
              {([["verbal", "Verbal SAS"], ["quant", "Quantitative SAS"], ["nonverbal", "Non-verbal SAS"], ["spatial", "Spatial SAS"], ["mean", "Mean SAS"]] as const).map(([k, label]) => (
                <label key={k} className="text-sm text-ink">{label}
                  <input inputMode="numeric" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={`mt-1 ${ui.input}`} placeholder="59–141" />
                </label>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="text-sm text-ink">SAS<input inputMode="numeric" value={f.score} onChange={(e) => setF({ ...f, score: e.target.value })} className={`mt-1 ${ui.input}`} placeholder="59–141" /></label>
              <label className="text-sm text-ink">Stanine<input inputMode="numeric" value={f.stanine} onChange={(e) => setF({ ...f, stanine: e.target.value })} className={`mt-1 ${ui.input}`} placeholder="1–9" /></label>
              <label className="text-sm text-ink">Percentile<input inputMode="numeric" value={f.percentile} onChange={(e) => setF({ ...f, percentile: e.target.value })} className={`mt-1 ${ui.input}`} placeholder="1–99" /></label>
              <label className="text-sm text-ink">Age equivalent<input value={f.age} onChange={(e) => setF({ ...f, age: e.target.value })} className={`mt-1 ${ui.input}`} placeholder="e.g. 9:06" /></label>
            </div>
          )}
          <label className="block text-sm text-ink">Notes (what this means for teaching)
            <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} className={`mt-1 ${ui.input}`} />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy} className={ui.btnPrimary}>{busy ? "Saving…" : "Save result"}</button>
            <button type="button" onClick={() => setAdding(false)} className={ui.btnSecondary}>Cancel</button>
          </div>
          {msg && <p className="text-sm text-red-700">{msg}</p>}
        </div>
      )}
    </section>
  );
}
