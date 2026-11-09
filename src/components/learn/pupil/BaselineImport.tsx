"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ui } from "@/components/learn/ui";
import { TESTS, sasBand, type BaselineRow } from "./BaselineAssessments";

import { Select } from "@/components/ui/Dropdown";
type Child = { id: string; name: string; dob: string | null; year: string | null };
type Parsed = { name: string; match: Child | null; test: BaselineRow["test"]; level: string; taken: string; v: Record<string, number | null>; raw: Record<string, string> };

/** Lower-cased, punctuation-free header key. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const pick = (row: Record<string, string>, ...keys: string[]): string => {
  for (const k of keys) { const hit = Object.keys(row).find((h) => norm(h) === norm(k) || norm(h).includes(norm(k))); if (hit && row[hit] !== undefined) return row[hit]; }
  return "";
};
const toNum = (s: string): number | null => (s.trim() === "" ? null : Number.isFinite(Number(s)) ? Math.round(Number(s)) : null);
const toIso = (s: string): string => {
  const m = s.trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  const d = new Date(s); return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const split = (l: string) => { const out: string[] = []; let cur = ""; let q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
  const head = split(lines[0]);
  return lines.slice(1).map((l) => { const cells = split(l); const r: Record<string, string> = {}; head.forEach((h, i) => (r[h] = cells[i] ?? "")); return r; });
}

/**
 * Imports GL Assessment's CSV export (CAT4 / NGRT / PTE / PTM). Column names
 * vary by product and year, so matching is by keyword: pupil name (or
 * "forename"+"surname"), date, level, and the SAS columns. Pupils are matched
 * to portal records by name (exact, then surname + first initial); unmatched
 * rows are shown and skipped, never guessed.
 */
export function BaselineImport() {
  const supabase = getSupabaseClient();
  const [children, setChildren] = useState<Child[]>([]);
  const [test, setTest] = useState<BaselineRow["test"]>("CAT4");
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [recent, setRecent] = useState<(BaselineRow & { children?: { name: string } })[]>([]);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("children").select("id, name, dob, year_groups(name)").order("name").then(({ data }) => {
      setChildren(((data as unknown as { id: string; name: string; dob: string | null; year_groups: { name: string } | null }[]) || []).map((c) => ({ id: c.id, name: c.name, dob: c.dob, year: c.year_groups?.name ?? null })));
    });
    supabase.from("baseline_assessments").select("*, children(name)").order("created_at", { ascending: false }).limit(25).then(({ data }) => setRecent((data as (BaselineRow & { children?: { name: string } })[]) || []));
  }, [supabase]);

  const parsed: Parsed[] = useMemo(() => {
    const rows = parseCsv(csv);
    const byName = new Map(children.map((c) => [norm(c.name), c]));
    return rows.map((r) => {
      const name = (pick(r, "pupil name", "student name", "name") || `${pick(r, "forename", "first name")} ${pick(r, "surname", "last name")}`).trim();
      let match = byName.get(norm(name)) || null;
      if (!match && name) {
        const parts = norm(name).split(" ");
        const sur = parts[parts.length - 1]; const ini = parts[0]?.[0];
        const cands = children.filter((c) => { const p = norm(c.name).split(" "); return p[p.length - 1] === sur && p[0]?.[0] === ini; });
        if (cands.length === 1) match = cands[0];
      }
      const v: Record<string, number | null> = {
        verbal: toNum(pick(r, "verbal sas", "verbal")), quant: toNum(pick(r, "quantitative sas", "quantitative")), nonverbal: toNum(pick(r, "non verbal sas", "non-verbal", "nonverbal")),
        spatial: toNum(pick(r, "spatial sas", "spatial")), mean: toNum(pick(r, "mean sas", "overall sas", "mean")), score: toNum(pick(r, "sas", "standard age score")),
        stanine: toNum(pick(r, "stanine")), percentile: toNum(pick(r, "percentile", "npr")),
      };
      return { name, match, test, level: pick(r, "level"), taken: toIso(pick(r, "date of test", "test date", "date")), v, raw: r };
    });
  }, [csv, children, test]);

  const ready = parsed.filter((p) => p.match && p.taken);

  async function importRows() {
    if (!supabase || ready.length === 0) return;
    setBusy(true); setMsg(null);
    const { data: u } = await supabase.auth.getUser();
    const batteries = TESTS.find((t) => t.key === test)!.batteries;
    const payload = ready.map((p) => ({
      child_id: p.match!.id, test, level: p.level || null, taken_on: p.taken,
      verbal_sas: batteries ? p.v.verbal : null, quantitative_sas: batteries ? p.v.quant : null, nonverbal_sas: batteries ? p.v.nonverbal : null, spatial_sas: batteries ? p.v.spatial : null,
      mean_sas: batteries ? p.v.mean : null, score_sas: batteries ? null : (p.v.score ?? p.v.mean), stanine: p.v.stanine, percentile: p.v.percentile,
      source: "csv_import", created_by: u.user?.id ?? null,
    }));
    const { error } = await supabase.from("baseline_assessments").insert(payload);
    setBusy(false);
    if (error) return setMsg(`Could not import: ${error.message}`);
    setMsg(`Imported ${payload.length} result${payload.length === 1 ? "" : "s"}. ${parsed.length - payload.length} row(s) skipped (no matching pupil or no date).`);
    setCsv("");
  }

  return (
    <div className="space-y-4">
      <section className={ui.card}>
        <h2 className="text-base font-semibold text-ink">How entry assessment works</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink/80">
          <li>Register the pupil in the GL Assessment account (shared with Tarbiyyah Secondary) and schedule CAT4 and, where useful, NGRT/PTE/PTM.</li>
          <li>The pupil sits the test online under supervised, camera-on conditions, as the Admissions Policy requires.</li>
          <li>Export the results from GL as CSV and paste them below, or type a result straight onto the pupil&apos;s record. Scores are GL&apos;s standardised scores (SAS): we record them, we never generate them.</li>
          <li>Results show on the pupil record for leadership, admissions and the pupil&apos;s own teachers, and inform setting (for example Qur&apos;an groups by ability) and support plans.</li>
        </ol>
      </section>

      <section className={ui.card}>
        <h2 className="text-base font-semibold text-ink">Import a GL CSV export</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[16rem_1fr]">
          <label className="text-sm text-ink">Test in this file
            <Select allowEmpty value={test} onChange={(e) => setTest(e.target.value as BaselineRow["test"])} className={`mt-1 ${ui.input}`}>
              {TESTS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </Select>
          </label>
          <label className="text-sm text-ink">Paste the CSV (first line = column headings)
            <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} className={`mt-1 ${ui.input} font-mono text-xs`} placeholder={"Pupil name,Date of test,Level,Verbal SAS,Quantitative SAS,Non-verbal SAS,Spatial SAS,Mean SAS\nAisha Khan,12/11/2026,D,108,115,101,97,105"} />
          </label>
        </div>
        {parsed.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-ink/65"><th className="py-1 pr-3">Row</th><th className="py-1 pr-3">Matched pupil</th><th className="py-1 pr-3">Date</th><th className="py-1 pr-3">Scores</th></tr></thead>
              <tbody>
                {parsed.map((p, i) => (
                  <tr key={i} className="border-t border-gold-light/60">
                    <td className="py-1.5 pr-3">{p.name || <span className="text-ink/50">(no name)</span>}</td>
                    <td className="py-1.5 pr-3">{p.match ? <span className="text-teal-700">{p.match.name}{p.match.year ? ` · ${p.match.year}` : ""}</span> : <span className="text-red-700">No match, add on the pupil record</span>}</td>
                    <td className="py-1.5 pr-3">{p.taken || <span className="text-red-700">missing</span>}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{Object.entries(p.v).filter(([, v]) => v != null).map(([k, v]) => `${k} ${v}`).join(" · ") || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={importRows} disabled={busy || ready.length === 0} className={ui.btnPrimary}>{busy ? "Importing…" : `Import ${ready.length} matched result${ready.length === 1 ? "" : "s"}`}</button>
          {msg && <p className="text-sm text-ink/75">{msg}</p>}
        </div>
      </section>

      <section className={ui.card}>
        <h2 className="text-base font-semibold text-ink">Recently recorded</h2>
        {recent.length === 0 ? <p className="mt-2 text-sm text-ink/65">Nothing recorded yet.</p> : (
          <ul className="mt-2 divide-y divide-gold-light/60 text-sm">
            {recent.map((r) => {
              const main = r.test === "CAT4" ? r.mean_sas : r.score_sas; const b = sasBand(main);
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><span className="font-medium text-ink">{r.children?.name ?? "Pupil"}</span> <span className="text-ink/65">· {r.test} · {new Date(r.taken_on).toLocaleDateString("en-GB")}</span></span>
                  <span className="tabular-nums">{main ?? "–"} {b && <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.cls}`}>{b.label}</span>}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
