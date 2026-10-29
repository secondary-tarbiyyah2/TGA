"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ui } from "@/components/learn/ui";
import { accessList, useSupportPlans } from "@/lib/learn/send";
import { SupportAtAGlance } from "@/components/learn/send/SupportAtAGlance";

export type GbPupil = { id: string; name: string };
type Type = { id: string; name: string };
type Scheme = { id: string; scale_name: string };
type Status = "marked" | "absent" | "exempt" | "not_submitted";
type Row = {
  id: string;
  child_id: string;
  assessment_type_id: string;
  mark_scheme_id: string | null;
  title: string;
  date: string;
  raw_score: number | null;
  max_score: number | null;
  percent: number | null;
  grade_label: string | null;
  status: Status;
};
type Column = { key: string; title: string; date: string; typeId: string; schemeId: string | null; max: number | null; rows: Map<string, Row> };

const STATUS_SHORT: Record<Exclude<Status, "marked">, string> = { absent: "Absent", exempt: "Exempt", not_submitted: "Not handed in" };
const colKey = (r: { title: string; date: string; assessment_type_id: string }) => `${r.title}\u0000${r.date}\u0000${r.assessment_type_id}`;
const input = "rounded-lg border border-gold-light bg-white px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";
const btn = ui.btnSecondary;
const btnPrimary = ui.btnPrimary;

type Entry = { score: string; status: Status | "" };

/**
 * A class-first gradebook: pupils down the side, assessments across the top.
 * "Add assessment" (or a column heading) opens one form with every pupil in
 * it, so a whole class's results are entered at once. A blank cell means not
 * marked yet; Absent, Exempt and Not handed in are recorded as such, so they
 * are never confused with a real score of 0. Averages only use marked scores
 * that have an "out of".
 */
export function ClassGradebook({
  classId,
  subjectId,
  pupils,
  selected,
  onSelect,
}: {
  classId: string;
  subjectId: string | null;
  pupils: GbPupil[] | null;
  selected: string;
  onSelect: (childId: string) => void;
}) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [types, setTypes] = useState<Type[]>([]);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [editing, setEditing] = useState<{ key: string | null; title: string; date: string; typeId: string; schemeId: string; max: string; entries: Record<string, Entry> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  // Access arrangements from support plans (0169), shown while a test is set up or marked.
  const plans = useSupportPlans(pupils ? pupils.map((p) => p.id) : null);

  const load = useCallback(async () => {
    if (!supabase || !classId) return;
    const { data, error } = await supabase
      .from("assessments")
      .select("id, child_id, assessment_type_id, mark_scheme_id, title, date, raw_score, max_score, percent, grade_label, status")
      .eq("class_id", classId)
      .order("date");
    if (error) setMsg({ text: `Couldn't load results: ${error.message}`, error: true });
    setRows((data as Row[]) || []);
  }, [supabase, classId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load when the class changes
    load();
  }, [load]);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("assessment_types")
      .select("id, name")
      .order("name")
      .then(({ data }) => setTypes((data as Type[]) || []));
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !subjectId) return;
    supabase
      .from("mark_schemes")
      .select("id, scale_name")
      .eq("subject_id", subjectId)
      .then(({ data }) => setSchemes((data as Scheme[]) || []));
  }, [supabase, subjectId]);

  const columns = useMemo(() => {
    const m = new Map<string, Column>();
    for (const r of rows || []) {
      const k = colKey(r);
      const c = m.get(k) || { key: k, title: r.title, date: r.date, typeId: r.assessment_type_id, schemeId: r.mark_scheme_id, max: r.max_score, rows: new Map() };
      c.rows.set(r.child_id, r);
      if (c.max === null && r.max_score !== null) c.max = r.max_score;
      m.set(k, c);
    }
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  }, [rows]);

  const typeName = (id: string) => types.find((t) => t.id === id)?.name || "";

  const average = (childId: string): number | null => {
    const ps = columns.map((c) => c.rows.get(childId)).filter((r): r is Row => !!r && r.status === "marked" && r.percent !== null).map((r) => Number(r.percent));
    return ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : null;
  };

  const openNew = () =>
    setEditing({
      key: null,
      title: "",
      date: new Date().toLocaleDateString("en-CA"),
      typeId: types[0]?.id || "",
      schemeId: "",
      max: "",
      entries: Object.fromEntries((pupils || []).map((p) => [p.id, { score: "", status: "" as const }])),
    });

  const openColumn = (c: Column) =>
    setEditing({
      key: c.key,
      title: c.title,
      date: c.date,
      typeId: c.typeId,
      schemeId: c.schemeId || "",
      max: c.max === null ? "" : String(c.max),
      entries: Object.fromEntries(
        (pupils || []).map((p) => {
          const r = c.rows.get(p.id);
          return [p.id, { score: r && r.raw_score !== null ? String(r.raw_score) : "", status: r ? r.status : ("" as const) }];
        }),
      ),
    });

  async function save() {
    if (!supabase || !editing) return;
    const e = editing;
    if (!e.title.trim()) return setMsg({ text: "Give the assessment a title.", error: true });
    if (!e.typeId) return setMsg({ text: "Choose the type of assessment.", error: true });
    if (!e.date) return setMsg({ text: "Choose the date.", error: true });
    const max = e.max.trim() ? Number(e.max) : null;
    if (max !== null && (!Number.isFinite(max) || max <= 0)) return setMsg({ text: "“Out of” must be a number above 0.", error: true });
    const bad = Object.entries(e.entries).find(([, v]) => v.score.trim() && (!Number.isFinite(Number(v.score)) || Number(v.score) < 0 || (max !== null && Number(v.score) > max)));
    if (bad) return setMsg({ text: `${pupils?.find((p) => p.id === bad[0])?.name || "A pupil"}'s score isn't valid${max !== null ? ` (0 to ${max})` : ""}.`, error: true });

    setBusy(true);
    setMsg(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const old = e.key ? columns.find((c) => c.key === e.key) : null;
    let saved = 0;
    let failed = 0;
    for (const p of pupils || []) {
      const v = e.entries[p.id] || { score: "", status: "" };
      const existing = old?.rows.get(p.id);
      const raw = v.score.trim() ? Number(v.score) : null;
      const status: Status | "" = raw !== null ? "marked" : v.status;
      if (!status) {
        // Cleared: "not marked yet" means no result at all.
        if (existing) {
          const { error } = await supabase.from("assessments").delete().eq("id", existing.id);
          if (error) failed++;
          else saved++;
        }
        continue;
      }
      let grade: string | null = null;
      if (e.schemeId && raw !== null && max) {
        const { data } = await supabase.rpc("grade_for_percent", { p_mark_scheme_id: e.schemeId, p_percent: (raw / max) * 100 });
        grade = (data as string) || null;
      }
      const row = {
        class_id: classId,
        child_id: p.id,
        assessment_type_id: e.typeId,
        mark_scheme_id: e.schemeId || null,
        title: e.title.trim(),
        date: e.date,
        raw_score: status === "marked" ? raw : null,
        max_score: max,
        grade_label: status === "marked" ? grade : null,
        status,
      };
      const res = existing
        ? await supabase.from("assessments").update(row).eq("id", existing.id)
        : await supabase.from("assessments").insert({ ...row, entered_by: user?.id || null });
      if (res.error) failed++;
      else saved++;
    }
    setBusy(false);
    await load();
    if (failed) setMsg({ text: `Saved ${saved}, but ${failed} couldn't be saved. Check you teach this class and try again.`, error: true });
    else {
      setMsg({ text: saved ? `Saved results for ${saved} pupil${saved === 1 ? "" : "s"}.` : "Nothing to save." });
      setEditing(null);
    }
  }

  async function removeColumn() {
    if (!supabase || !editing?.key) return;
    const c = columns.find((x) => x.key === editing.key);
    if (!c) return;
    setBusy(true);
    const { error } = await supabase.from("assessments").delete().in("id", [...c.rows.values()].map((r) => r.id));
    setBusy(false);
    if (error) return setMsg({ text: `Couldn't delete: ${error.message}`, error: true });
    setEditing(null);
    setMsg({ text: "Assessment deleted." });
    load();
  }

  const cell = (r: Row | undefined) => {
    if (!r) return <span className="text-ink/35">–</span>;
    if (r.status !== "marked") return <span className="text-xs font-medium text-ink/70">{STATUS_SHORT[r.status]}</span>;
    if (r.grade_label) return <span className="font-semibold text-ink">{r.grade_label}</span>;
    if (r.raw_score === null) return <span className="text-ink/35">–</span>;
    return (
      <span className="tabular-nums text-ink">
        {Number(r.raw_score)}
        {r.max_score !== null && <span className="text-ink/65">/{Number(r.max_score)}</span>}
      </span>
    );
  };

  if (editing) {
    const set = (patch: Partial<typeof editing>) => setEditing({ ...editing, ...patch });
    const setEntry = (id: string, patch: Partial<Entry>) => setEditing({ ...editing, entries: { ...editing.entries, [id]: { ...editing.entries[id], ...patch } } });
    return (
      <div className="space-y-4 rounded-2xl border border-gold-light bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-h3 font-semibold text-ink">{editing.key ? `Results: ${editing.title}` : "Add an assessment"}</h2>
          <button type="button" className={btn} onClick={() => setEditing(null)}>
            Cancel
          </button>
        </div>
        {msg && (
          <p role={msg.error ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${msg.error ? "bg-red-50 text-red-800" : "bg-teal-100 text-teal-900"}`}>
            {msg.text}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm font-medium text-ink lg:col-span-2">
            Title
            <input className={`${input} mt-1 block w-full`} value={editing.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Fractions end-of-unit test" />
          </label>
          <label className="text-sm font-medium text-ink">
            Type
            <select className={`${input} mt-1 block w-full`} value={editing.typeId} onChange={(e) => set({ typeId: e.target.value })}>
              <option value="">Choose…</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-ink">
            Date
            <input type="date" className={`${input} mt-1 block w-full`} value={editing.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
          <label className="text-sm font-medium text-ink">
            Out of
            <input type="text" min={1} inputMode="decimal" className={`${input} mt-1 block w-full`} value={editing.max} onChange={(e) => set({ max: e.target.value })} placeholder="e.g. 40" />
          </label>
          {schemes.length > 0 && (
            <label className="text-sm font-medium text-ink lg:col-span-2">
              Mark scheme (turns scores into grades)
              <select className={`${input} mt-1 block w-full`} value={editing.schemeId} onChange={(e) => set({ schemeId: e.target.value })}>
                <option value="">None, just scores</option>
                {schemes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.scale_name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <SupportAtAGlance pupils={pupils || []} plans={plans} mode="assessment" />

        <table className="w-full text-sm">
          <caption className="sr-only">Results for each pupil</caption>
          <thead>
            <tr className="border-b border-gold-light text-left text-xs uppercase tracking-wide text-ink/65">
              <th scope="col" className="py-2 pr-3 font-semibold">Pupil</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Score</th>
              <th scope="col" className="py-2 font-semibold">Or</th>
            </tr>
          </thead>
          <tbody>
            {(pupils || []).map((p) => {
              const v = editing.entries[p.id] || { score: "", status: "" };
              return (
                <tr key={p.id} className="border-b border-gold-light/50">
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium text-ink">
                    {p.name}
                    {plans?.[p.id] && accessList(plans[p.id]).length > 0 && (
                      <span className="block text-xs font-normal text-amber-900">{accessList(plans[p.id]).join(" · ")}</span>
                    )}
                  </th>
                  <td className="py-1.5 pr-3">
                    <input
                      type="text"
                      min={0}
                      inputMode="decimal"
                      aria-label={`${p.name}: score`}
                      className={`${input} w-24 tabular-nums`}
                      value={v.score}
                      onChange={(e) => setEntry(p.id, { score: e.target.value, status: e.target.value ? "marked" : v.status === "marked" ? "" : v.status })}
                    />
                  </td>
                  <td className="py-1.5">
                    <select
                      aria-label={`${p.name}: status`}
                      className={input}
                      value={v.score.trim() ? "marked" : v.status}
                      onChange={(e) => setEntry(p.id, { status: e.target.value as Status | "", score: e.target.value === "marked" ? v.score : "" })}
                    >
                      <option value="">Not marked yet</option>
                      <option value="marked" disabled={!v.score.trim()}>
                        Scored
                      </option>
                      <option value="absent">Absent</option>
                      <option value="exempt">Exempt</option>
                      <option value="not_submitted">Not handed in</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnPrimary} disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save results"}
          </button>
          <span className="text-xs text-ink/65">Leave a pupil blank if their work isn&apos;t marked yet. A real 0 is a score.</span>
          <span className="flex-1" />
          {editing.key && (
            <button type="button" className="text-sm font-medium text-red-700 hover:underline" disabled={busy} onClick={removeColumn}>
              Delete this assessment
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-gold-light bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-serif text-h3 font-semibold text-ink">Gradebook</h2>
          <p className="text-sm text-ink/65">Pupils down the side, assessments across. Choose a heading to enter or change its results; choose a pupil for their Qur&apos;an progress and weekly note.</p>
        </div>
        <button type="button" className={btnPrimary} onClick={openNew} disabled={!pupils?.length || !types.length}>
          + Add assessment
        </button>
      </div>
      {msg && (
        <p role={msg.error ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${msg.error ? "bg-red-50 text-red-800" : "bg-teal-100 text-teal-900"}`}>
          {msg.text}
        </p>
      )}
      {!types.length && <p className="text-sm text-ink/70">No assessment types are set up yet. The head or office adds them under Academic setup.</p>}
      {pupils === null || rows === null ? (
        <div className="h-32 animate-pulse rounded-lg bg-cream" />
      ) : pupils.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gold-light p-6 text-center text-sm text-ink/70">No pupils are enrolled in this class yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gold-light/70">
          <table className="w-full text-sm">
            <caption className="sr-only">Gradebook</caption>
            <thead className="bg-cream/60">
              <tr>
                <th scope="col" className="sticky left-0 z-[1] min-w-[8rem] bg-cream px-3 sm:min-w-[11rem] py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink/65">
                  Pupil
                </th>
                {columns.map((c) => (
                  <th key={c.key} scope="col" className="min-w-[7.5rem] px-2 py-2 text-left align-bottom">
                    <button type="button" onClick={() => openColumn(c)} className="block text-left hover:text-teal-800" title="Enter or change results">
                      <span className="block text-sm font-semibold text-ink">{c.title}</span>
                      <span className="block text-xs font-normal text-ink/65">
                        {new Date(c.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        {typeName(c.typeId) ? ` · ${typeName(c.typeId)}` : ""}
                        {c.max !== null ? ` · /${Number(c.max)}` : ""}
                      </span>
                    </button>
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink/65">
                  Average
                </th>
              </tr>
            </thead>
            <tbody>
              {pupils.map((p) => {
                const avg = average(p.id);
                return (
                  <tr key={p.id} className={`border-t border-gold-light/50 ${selected === p.id ? "bg-teal-100/60" : "hover:bg-cream/50"}`}>
                    <th scope="row" className={`sticky left-0 z-[1] px-3 py-2 text-left font-medium ${selected === p.id ? "bg-teal-100" : "bg-white"}`}>
                      <button type="button" onClick={() => onSelect(p.id)} className="text-left text-ink hover:text-teal-800 hover:underline" aria-pressed={selected === p.id}>
                        {p.name}
                      </button>
                    </th>
                    {columns.map((c) => (
                      <td key={c.key} className="px-2 py-2">
                        {cell(c.rows.get(p.id))}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">{avg === null ? <span className="text-ink/35">–</span> : `${avg}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {columns.length === 0 && <p className="border-t border-gold-light/50 p-4 text-center text-sm text-ink/65">No assessments yet. Press “Add assessment” to enter the first set of results.</p>}
        </div>
      )}
    </div>
  );
}
