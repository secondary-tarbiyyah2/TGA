"use client";

import { useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatHijri, toHijri } from "@/lib/learn/hijri";
import { CLOSURE_LABEL, type ClosureKind, type ClosureRow, type TermRow, type YearRow } from "./useCalendarTerms";

const GREG = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

function parse(k: string): Date {
  return new Date(`${k}T12:00:00`);
}
function key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function greg(k: string): string {
  const d = parse(k);
  return `${d.getDate()} ${GREG[d.getMonth()]} ${d.getFullYear()}`;
}
/** Hijri first, then Gregorian. */
function both(k: string): string {
  return `${formatHijri(toHijri(parse(k)))} · ${greg(k)}`;
}
function span(a: string, b: string): string {
  return a === b ? both(a) : `${both(a)} → ${both(b)}`;
}

/** First weekday on or after the given date. */
function nextWeekday(y: number, m: number, d: number): Date {
  const dt = new Date(y, m, d, 12);
  while (dt.getDay() === 0 || dt.getDay() === 6) dt.setDate(dt.getDate() + 1);
  return dt;
}
/** Last Friday on or before the given date. */
function prevFriday(y: number, m: number, d: number): Date {
  const dt = new Date(y, m, d, 12);
  while (dt.getDay() !== 5) dt.setDate(dt.getDate() - 1);
  return dt;
}
/** Monday on or after the given date. */
function nextMonday(y: number, m: number, d: number): Date {
  const dt = new Date(y, m, d, 12);
  while (dt.getDay() !== 1) dt.setDate(dt.getDate() + 1);
  return dt;
}
function plusDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

type Draft = { name: string; starts_on: string; ends_on: string; ht_start: string; ht_end: string };

/** Sensible UK-style defaults for an academic year starting in September of `y`. All editable. */
function defaultTerms(y: number): Draft[] {
  const ht = (s: Date) => ({ ht_start: key(s), ht_end: key(plusDays(s, 4)) });
  return [
    { name: "Autumn Term", starts_on: key(nextWeekday(y, 8, 2)), ends_on: key(prevFriday(y, 11, 20)), ...ht(nextMonday(y, 9, 26)) },
    { name: "Spring Term", starts_on: key(nextWeekday(y + 1, 0, 5)), ends_on: key(prevFriday(y + 1, 2, 28)), ...ht(nextMonday(y + 1, 1, 15)) },
    { name: "Summer Term", starts_on: key(nextMonday(y + 1, 3, 14)), ends_on: key(prevFriday(y + 1, 6, 20)), ...ht(nextMonday(y + 1, 4, 25)) },
  ];
}

function yearLabel(y: number): string {
  return `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
}

function checkTerm(d: Draft): string | null {
  if (!d.name.trim()) return "Give the term a name.";
  if (!d.starts_on || !d.ends_on) return `${d.name || "Term"}: choose start and end dates.`;
  if (d.ends_on <= d.starts_on) return `${d.name}: the end date must be after the start date.`;
  if (!!d.ht_start !== !!d.ht_end) return `${d.name}: enter both half-term dates, or neither.`;
  if (d.ht_start && d.ht_end) {
    if (d.ht_end < d.ht_start) return `${d.name}: half-term ends before it starts.`;
    if (d.ht_start < d.starts_on || d.ht_end > d.ends_on) return `${d.name}: half-term must fall inside the term.`;
  }
  return null;
}

const field = "w-full rounded-lg border border-gold-light bg-white px-3 py-2 text-sm text-ink focus:border-gold-700 focus:outline-none focus:ring-2 focus:ring-gold-300/60";
const btn = "rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream disabled:opacity-50";
const btnPrimary = "rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50";

function Lbl({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-ink/70">
      <span className="mb-1 block">{text}</span>
      {children}
    </label>
  );
}

function TermFields({ d, onChange }: { d: Draft; onChange: (d: Draft) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Lbl text="Term name">
        <input className={field} value={d.name} onChange={(e) => onChange({ ...d, name: e.target.value })} />
      </Lbl>
      <Lbl text="Starts">
        <input type="date" className={field} value={d.starts_on} onChange={(e) => onChange({ ...d, starts_on: e.target.value })} />
      </Lbl>
      <Lbl text="Ends">
        <input type="date" className={field} value={d.ends_on} onChange={(e) => onChange({ ...d, ends_on: e.target.value })} />
      </Lbl>
      <Lbl text="Half-term break starts (optional)">
        <input type="date" className={field} value={d.ht_start} onChange={(e) => onChange({ ...d, ht_start: e.target.value })} />
      </Lbl>
      <Lbl text="Half-term break ends">
        <input type="date" className={field} value={d.ht_end} onChange={(e) => onChange({ ...d, ht_end: e.target.value })} />
      </Lbl>
    </div>
  );
}

/**
 * Terms tab: list / create / edit / delete terms, add an academic year with
 * three prefilled terms, and manage INSET / holiday / closure days. Terms
 * synced from Sanity are shown read-only. RLS (manage_academic) is the real
 * gate; `canManage` only decides whether the controls are shown.
 */
export function TermsManager({
  terms,
  years,
  closures,
  canManage,
  reload,
}: {
  terms: TermRow[] | null;
  years: YearRow[];
  closures: ClosureRow[];
  canManage: boolean;
  reload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // wizard
  const nowY = new Date();
  const [wizard, setWizard] = useState<{ year: number; terms: Draft[] } | null>(null);
  // single term editor ("new" or a term id)
  const [editing, setEditing] = useState<{ id: string | null; yearId: string; draft: Draft } | null>(null);
  // closure form
  const [cf, setCf] = useState<{ id: string | null; kind: ClosureKind; name: string; starts_on: string; ends_on: string; notes: string } | null>(null);

  const yearById = useMemo(() => new Map(years.map((y) => [y.id, y])), [years]);
  const grouped = useMemo(() => {
    const m = new Map<string, TermRow[]>();
    for (const t of terms || []) m.set(t.academic_year_id || "none", [...(m.get(t.academic_year_id || "none") || []), t]);
    return [...m.entries()].sort((a, b) => (b[1][0]?.starts_on || "").localeCompare(a[1][0]?.starts_on || ""));
  }, [terms]);

  const run = async (fn: () => Promise<string | null>, ok: string, after?: () => void) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const err = await fn();
      if (err) setError(err);
      else {
        setNotice(ok);
        after?.();
        reload();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const overlaps = (d: Draft, yearId: string, ignoreId: string | null, extra: Draft[] = []) => {
    const others = (terms || []).filter((t) => t.academic_year_id === yearId && t.id !== ignoreId).map((t) => ({ name: t.name, s: t.starts_on, e: t.ends_on }));
    for (const x of extra) others.push({ name: x.name, s: x.starts_on, e: x.ends_on });
    return others.find((o) => d.starts_on <= o.e && o.s <= d.ends_on)?.name || null;
  };

  const startWizard = () => {
    const y = nowY.getMonth() >= 6 ? nowY.getFullYear() : nowY.getFullYear() - 1;
    // Offer the next year that has no terms yet.
    let pick = y;
    while ((terms || []).some((t) => t.academic_year_id && yearById.get(t.academic_year_id)?.label === yearLabel(pick))) pick += 1;
    setEditing(null);
    setWizard({ year: pick, terms: defaultTerms(pick) });
  };

  const saveWizard = () => {
    if (!wizard) return;
    for (const d of wizard.terms) {
      const e = checkTerm(d);
      if (e) return setError(e);
    }
    for (let i = 0; i < wizard.terms.length; i++) {
      const o = overlaps(wizard.terms[i], "", null, wizard.terms.filter((_, j) => j < i));
      if (o) return setError(`${wizard.terms[i].name} overlaps ${o}.`);
    }
    const w = wizard;
    run(
      async () => {
        const supabase = getSupabaseClient();
        if (!supabase) return "Not connected.";
        const label = yearLabel(w.year);
        let yearId = years.find((y) => y.label === label)?.id;
        const starts = w.terms.map((t) => t.starts_on).sort()[0];
        const ends = w.terms.map((t) => t.ends_on).sort().at(-1) as string;
        if (!yearId) {
          const ins = await supabase.from("academic_years").insert({ label, starts_on: starts, ends_on: ends, is_test: false }).select("id").single();
          if (ins.error) return ins.error.message;
          yearId = (ins.data as { id: string }).id;
        }
        const clash = (terms || []).find((t) => t.academic_year_id === yearId && w.terms.some((d) => d.starts_on <= t.ends_on && t.starts_on <= d.ends_on));
        if (clash) return `${label} already has a term (${clash.name}) overlapping these dates.`;
        const ins = await supabase.from("terms").insert(
          w.terms.map((d) => ({
            academic_year_id: yearId,
            name: d.name.trim(),
            starts_on: d.starts_on,
            ends_on: d.ends_on,
            half_term_starts_on: d.ht_start || null,
            half_term_ends_on: d.ht_end || null,
            source: "portal",
          })),
        );
        return ins.error ? ins.error.message : null;
      },
      `Academic year ${yearLabel(w.year)} created with ${w.terms.length} terms.`,
      () => setWizard(null),
    );
  };

  const saveTerm = () => {
    if (!editing) return;
    const e = checkTerm(editing.draft);
    if (e) return setError(e);
    if (!editing.yearId) return setError("Choose an academic year (use “Add term year” to create one).");
    const o = overlaps(editing.draft, editing.yearId, editing.id);
    if (o) return setError(`Dates overlap ${o} in the same academic year.`);
    const ed = editing;
    run(
      async () => {
        const supabase = getSupabaseClient();
        if (!supabase) return "Not connected.";
        const row = {
          academic_year_id: ed.yearId,
          name: ed.draft.name.trim(),
          starts_on: ed.draft.starts_on,
          ends_on: ed.draft.ends_on,
          half_term_starts_on: ed.draft.ht_start || null,
          half_term_ends_on: ed.draft.ht_end || null,
        };
        const res = ed.id ? await supabase.from("terms").update(row).eq("id", ed.id) : await supabase.from("terms").insert({ ...row, source: "portal" });
        return res.error ? res.error.message : null;
      },
      ed.id ? "Term updated." : "Term added.",
      () => setEditing(null),
    );
  };

  const deleteTerm = (t: TermRow) => {
    if (!window.confirm(`Delete ${t.name}? Anything linked to this term (timetable, reports) may be removed with it.`)) return;
    run(async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return "Not connected.";
      const res = await supabase.from("terms").delete().eq("id", t.id);
      return res.error ? res.error.message : null;
    }, "Term deleted.");
  };

  const saveClosure = () => {
    if (!cf) return;
    if (!cf.name.trim() || !cf.starts_on) return setError("Give the closure a name and a date.");
    const end = cf.ends_on || cf.starts_on;
    if (end < cf.starts_on) return setError("The closure ends before it starts.");
    const f = cf;
    run(
      async () => {
        const supabase = getSupabaseClient();
        if (!supabase) return "Not connected.";
        const containing = (terms || []).find((t) => t.starts_on <= f.starts_on && f.starts_on <= t.ends_on);
        const row = { kind: f.kind, name: f.name.trim(), starts_on: f.starts_on, ends_on: end, notes: f.notes.trim() || null, academic_year_id: containing?.academic_year_id || null };
        const res = f.id ? await supabase.from("school_closures").update(row).eq("id", f.id) : await supabase.from("school_closures").insert(row);
        return res.error ? res.error.message : null;
      },
      "Saved.",
      () => setCf(null),
    );
  };

  const deleteClosure = (c: ClosureRow) => {
    if (!window.confirm(`Remove ${c.name}?`)) return;
    run(async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return "Not connected.";
      const res = await supabase.from("school_closures").delete().eq("id", c.id);
      return res.error ? res.error.message : null;
    }, "Removed.");
  };

  const draftOf = (t: TermRow): Draft => ({ name: t.name, starts_on: t.starts_on, ends_on: t.ends_on, ht_start: t.half_term_starts_on || "", ht_end: t.half_term_ends_on || "" });

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-900">
          {notice}
        </p>
      )}

      <section className="rounded-2xl border border-gold-light bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-gold-light px-4 py-3">
          <h3 className="mr-auto text-sm font-semibold text-ink">Terms</h3>
          {canManage && (
            <>
              <button type="button" className={btnPrimary} disabled={busy} onClick={startWizard}>
                Add term year
              </button>
              <button
                type="button"
                className={btn}
                disabled={busy}
                onClick={() => {
                  setWizard(null);
                  setEditing({ id: null, yearId: years[0]?.id || "", draft: { name: "", starts_on: "", ends_on: "", ht_start: "", ht_end: "" } });
                }}
              >
                Add single term
              </button>
            </>
          )}
        </div>

        {wizard && (
          <div className="space-y-4 border-b border-gold-light bg-cream/40 px-4 py-4">
            <div className="flex flex-wrap items-end gap-3">
              <Lbl text="Academic year starting September">
                <select
                  className={field}
                  value={wizard.year}
                  onChange={(e) => {
                    const y = Number(e.target.value);
                    setWizard({ year: y, terms: defaultTerms(y) });
                  }}
                >
                  {[nowY.getFullYear() - 1, nowY.getFullYear(), nowY.getFullYear() + 1, nowY.getFullYear() + 2].map((y) => (
                    <option key={y} value={y}>
                      {yearLabel(y)}
                    </option>
                  ))}
                </select>
              </Lbl>
              <p className="pb-2 text-xs text-ink/60">Prefilled with typical UK dates (Sept–Dec, Jan–Mar, Apr–Jul). Change anything before saving.</p>
            </div>
            {wizard.terms.map((d, i) => (
              <div key={i} className="rounded-xl border border-gold-light bg-white p-3">
                <TermFields d={d} onChange={(nd) => setWizard({ ...wizard, terms: wizard.terms.map((x, j) => (j === i ? nd : x)) })} />
              </div>
            ))}
            <div className="flex gap-2">
              <button type="button" className={btnPrimary} disabled={busy} onClick={saveWizard}>
                {busy ? "Saving…" : `Create ${yearLabel(wizard.year)}`}
              </button>
              <button type="button" className={btn} onClick={() => setWizard(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {editing && (
          <div className="space-y-3 border-b border-gold-light bg-cream/40 px-4 py-4">
            <h4 className="text-sm font-semibold text-ink">{editing.id ? "Edit term" : "New term"}</h4>
            <Lbl text="Academic year">
              <select className={`${field} sm:w-64`} value={editing.yearId} onChange={(e) => setEditing({ ...editing, yearId: e.target.value })}>
                <option value="">Choose…</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                  </option>
                ))}
              </select>
            </Lbl>
            <TermFields d={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} />
            <div className="flex gap-2">
              <button type="button" className={btnPrimary} disabled={busy} onClick={saveTerm}>
                {busy ? "Saving…" : "Save term"}
              </button>
              <button type="button" className={btn} onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {terms === null ? (
          <p className="px-4 py-3 text-sm text-ink/55">Loading…</p>
        ) : terms.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink/55">No terms have been set up yet.{canManage ? " Use “Add term year” to create this year’s three terms in one go." : ""}</p>
        ) : (
          grouped.map(([yid, list]) => (
            <div key={yid}>
              <p className="bg-cream/50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink/55">{yearById.get(yid)?.label || "No academic year"}</p>
              <ul className="divide-y divide-gold-light/60">
                {list.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-start gap-2 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 font-medium text-ink">
                        {t.name}
                        {t.source === "sanity" && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800">From website</span>}
                      </span>
                      <span className="block text-xs text-ink/60">Starts: {both(t.starts_on)}</span>
                      <span className="block text-xs text-ink/60">Ends: {both(t.ends_on)}</span>
                      {t.half_term_starts_on && t.half_term_ends_on && <span className="block text-xs text-amber-800">Half-term: {span(t.half_term_starts_on, t.half_term_ends_on)}</span>}
                    </div>
                    {canManage && t.source === "portal" && (
                      <div className="flex gap-2">
                        <button type="button" className={btn} disabled={busy} onClick={() => { setWizard(null); setEditing({ id: t.id, yearId: t.academic_year_id || "", draft: draftOf(t) }); }}>
                          Edit
                        </button>
                        <button type="button" className={`${btn} text-red-700`} disabled={busy} onClick={() => deleteTerm(t)}>
                          Delete
                        </button>
                      </div>
                    )}
                    {canManage && t.source === "sanity" && <span className="text-[11px] text-ink/65">Edit in the website CMS</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="rounded-2xl border border-gold-light bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-gold-light px-4 py-3">
          <h3 className="mr-auto text-sm font-semibold text-ink">INSET days, holidays and closures</h3>
          {canManage && (
            <button type="button" className={btn} disabled={busy} onClick={() => setCf({ id: null, kind: "inset", name: "INSET day", starts_on: "", ends_on: "", notes: "" })}>
              Add
            </button>
          )}
        </div>
        {cf && (
          <div className="space-y-3 border-b border-gold-light bg-cream/40 px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Lbl text="Type">
                <select className={field} value={cf.kind} onChange={(e) => setCf({ ...cf, kind: e.target.value as ClosureKind, name: cf.name || CLOSURE_LABEL[e.target.value as ClosureKind] })}>
                  {(Object.keys(CLOSURE_LABEL) as ClosureKind[]).map((k) => (
                    <option key={k} value={k}>
                      {CLOSURE_LABEL[k]}
                    </option>
                  ))}
                </select>
              </Lbl>
              <Lbl text="Name">
                <input className={field} value={cf.name} onChange={(e) => setCf({ ...cf, name: e.target.value })} />
              </Lbl>
              <Lbl text="From">
                <input type="date" className={field} value={cf.starts_on} onChange={(e) => setCf({ ...cf, starts_on: e.target.value })} />
              </Lbl>
              <Lbl text="To (blank = one day)">
                <input type="date" className={field} value={cf.ends_on} onChange={(e) => setCf({ ...cf, ends_on: e.target.value })} />
              </Lbl>
            </div>
            <Lbl text="Notes (optional)">
              <input className={field} value={cf.notes} onChange={(e) => setCf({ ...cf, notes: e.target.value })} />
            </Lbl>
            <div className="flex gap-2">
              <button type="button" className={btnPrimary} disabled={busy} onClick={saveClosure}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button type="button" className={btn} onClick={() => setCf(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {closures.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink/55">None recorded.</p>
        ) : (
          <ul className="divide-y divide-gold-light/60">
            {closures.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-2 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">
                    {c.name} <span className="text-xs font-normal text-ink/65">· {CLOSURE_LABEL[c.kind]}</span>
                  </span>
                  <span className="block text-xs text-ink/60">{span(c.starts_on, c.ends_on)}</span>
                  {c.notes && <span className="block text-xs text-ink/65">{c.notes}</span>}
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <button type="button" className={btn} disabled={busy} onClick={() => setCf({ id: c.id, kind: c.kind, name: c.name, starts_on: c.starts_on, ends_on: c.ends_on === c.starts_on ? "" : c.ends_on, notes: c.notes || "" })}>
                      Edit
                    </button>
                    <button type="button" className={`${btn} text-red-700`} disabled={busy} onClick={() => deleteClosure(c)}>
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
