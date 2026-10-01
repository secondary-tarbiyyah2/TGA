"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { dangerBtn, EmptyState, Field, ghostBtn, inputCls, Notice, primaryBtn, StepCard } from "./shared";
import type { AcademicYear, ClassRow, Enrolment, Subject, Term, YearGroup } from "./shared";

type Common = { reload: () => Promise<void> };

function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, after?: () => void): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await fn();
      if (err) {
        setError(err.message);
        return false;
      }
      after?.();
      return true;
    } finally {
      setBusy(false);
    }
  };
  return { error, setError, busy, run };
}

/* ── Step 1: academic years & terms ─────────────────────────────────── */
export function YearsSection({ years, terms, reload }: Common & { years: AcademicYear[]; terms: Term[] }) {
  const supabase = getSupabaseClient();
  const { error, setError, busy, run } = useAction();
  const [form, setForm] = useState({ label: "", starts_on: "", ends_on: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ label: "", starts_on: "", ends_on: "" });

  const validate = (v: { label: string; starts_on: string; ends_on: string }): string | null => {
    if (!v.label.trim() || !v.starts_on || !v.ends_on) return "Fill in the name, start date and end date.";
    if (v.ends_on <= v.starts_on) return "The end date must be after the start date.";
    return null;
  };

  const add = async () => {
    if (!supabase) return;
    const problem = validate(form);
    if (problem) return setError(problem);
    await run(
      () => supabase.from("academic_years").insert({ label: form.label.trim(), starts_on: form.starts_on, ends_on: form.ends_on }),
      () => setForm({ label: "", starts_on: "", ends_on: "" }),
    ).then((ok) => ok && reload());
  };

  const save = async (id: string) => {
    if (!supabase) return;
    const problem = validate(draft);
    if (problem) return setError(problem);
    const ok = await run(() => supabase.from("academic_years").update({ label: draft.label.trim(), starts_on: draft.starts_on, ends_on: draft.ends_on }).eq("id", id), () => setEditId(null));
    if (ok) await reload();
  };

  return (
    <StepCard step={1} id="years" done={years.length > 0} title="Academic years & terms" help="The school year the timetable is built for. Add the year here; term dates come from the website's Term Dates and appear automatically.">
      {years.length === 0 && <EmptyState>No academic year yet. Add one below (for example &quot;2026/27&quot;, 1 Sep 2026 to 31 Aug 2027). The timetable can&apos;t be built without it.</EmptyState>}
      <div className="space-y-3">
        {years.map((y) => {
          const yTerms = terms.filter((t) => t.academic_year_id === y.id);
          return (
            <div key={y.id} className="rounded-xl border border-gold-light/40 p-3">
              {editId === y.id ? (
                <div className="grid gap-2 sm:grid-cols-4 sm:items-end">
                  <Field label="Name"><input className={inputCls} value={draft.label} onChange={(e) => setDraft((s) => ({ ...s, label: e.target.value }))} /></Field>
                  <Field label="Starts"><input type="date" className={inputCls} value={draft.starts_on} onChange={(e) => setDraft((s) => ({ ...s, starts_on: e.target.value }))} /></Field>
                  <Field label="Ends"><input type="date" className={inputCls} value={draft.ends_on} onChange={(e) => setDraft((s) => ({ ...s, ends_on: e.target.value }))} /></Field>
                  <div className="flex gap-2">
                    <button type="button" className={primaryBtn} disabled={busy} onClick={() => save(y.id)}>Save</button>
                    <button type="button" className={ghostBtn} onClick={() => setEditId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-ink">
                    {y.label} <span className="font-normal text-ink/55">· {y.starts_on} to {y.ends_on}</span>
                    {y.is_test && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">TEST</span>}
                  </div>
                  <button type="button" className={ghostBtn} onClick={() => { setEditId(y.id); setDraft({ label: y.label, starts_on: y.starts_on, ends_on: y.ends_on }); setError(null); }}>Edit</button>
                </div>
              )}
              <ul className="mt-2 flex flex-wrap gap-2 text-xs text-ink/70">
                {yTerms.map((t) => (
                  <li key={t.id} className="rounded-full bg-cream px-2.5 py-1">{t.name}: {t.starts_on} to {t.ends_on}</li>
                ))}
                {yTerms.length === 0 && <li className="text-ink/50">No terms synced for this year yet. Add them as Term Dates in the website editor (Sanity).</li>}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4 sm:items-end">
        <Field label="New year name"><input className={inputCls} placeholder="2026/27" value={form.label} onChange={(e) => setForm((s) => ({ ...s, label: e.target.value }))} /></Field>
        <Field label="Starts"><input type="date" className={inputCls} value={form.starts_on} onChange={(e) => setForm((s) => ({ ...s, starts_on: e.target.value }))} /></Field>
        <Field label="Ends"><input type="date" className={inputCls} value={form.ends_on} onChange={(e) => setForm((s) => ({ ...s, ends_on: e.target.value }))} /></Field>
        <div><button type="button" className={`${primaryBtn} w-full sm:w-auto`} disabled={busy} onClick={add}>Add year</button></div>
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </StepCard>
  );
}

/* ── Step 2: year groups (+ capacity) ───────────────────────────────── */
export function YearGroupsSection({ yearGroups, classes, enrolments, reload }: Common & { yearGroups: YearGroup[]; classes: ClassRow[]; enrolments: Enrolment[] }) {
  const supabase = getSupabaseClient();
  const { error, setError, busy, run } = useAction();
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", sort_order: "0", capacity: "" });

  const parseCap = (raw: string): number | null | "invalid" => {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 && Number.isInteger(n) ? n : "invalid";
  };

  const used = (ygId: string): number => {
    const classIds = new Set(classes.filter((c) => c.year_group_id === ygId).map((c) => c.id));
    return new Set(enrolments.filter((e) => classIds.has(e.class_id)).map((e) => e.child_id)).size;
  };

  const add = async () => {
    if (!supabase || !name.trim()) return setError("Enter a year group name.");
    const cap = parseCap(capacity);
    if (cap === "invalid") return setError("Capacity must be a whole number above zero, or blank.");
    const next = yearGroups.reduce((m, y) => Math.max(m, y.sort_order), -1) + 1;
    const ok = await run(() => supabase.from("year_groups").insert({ name: name.trim(), sort_order: next, capacity: cap }), () => { setName(""); setCapacity(""); });
    if (ok) await reload();
  };

  const save = async (id: string) => {
    if (!supabase || !draft.name.trim()) return setError("Enter a year group name.");
    const cap = parseCap(draft.capacity);
    const order = Number(draft.sort_order);
    if (cap === "invalid" || !Number.isFinite(order)) return setError("Capacity must be a whole number above zero, or blank.");
    const ok = await run(() => supabase.from("year_groups").update({ name: draft.name.trim(), sort_order: order, capacity: cap }).eq("id", id), () => setEditId(null));
    if (ok) await reload();
  };

  const remove = async (y: YearGroup) => {
    if (!supabase || !window.confirm(`Remove ${y.name}? Classes in it will be left without a year group.`)) return;
    const ok = await run(() => supabase.from("year_groups").delete().eq("id", y.id));
    if (ok) await reload();
  };

  return (
    <StepCard step={2} id="year-groups" done={yearGroups.length > 0} title="Year groups" help="Reception, Year 1 and so on. Capacity is the total places in that year; leave it blank to hide “places remaining” on the public site.">
      {yearGroups.length === 0 && <EmptyState>No year groups yet. Add them below, in order from youngest to oldest.</EmptyState>}
      <ul className="space-y-2">
        {yearGroups.map((y) => (
          <li key={y.id} className="rounded-xl border border-gold-light/40 px-3 py-2 text-sm">
            {editId === y.id ? (
              <div className="grid gap-2 sm:grid-cols-4 sm:items-end">
                <Field label="Name"><input className={inputCls} value={draft.name} onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))} /></Field>
                <Field label="Order"><input type="number" className={inputCls} value={draft.sort_order} onChange={(e) => setDraft((s) => ({ ...s, sort_order: e.target.value }))} /></Field>
                <Field label="Capacity"><input type="number" min={1} inputMode="numeric" className={inputCls} placeholder="Unset" value={draft.capacity} onChange={(e) => setDraft((s) => ({ ...s, capacity: e.target.value }))} /></Field>
                <div className="flex gap-2">
                  <button type="button" className={primaryBtn} disabled={busy} onClick={() => save(y.id)}>Save</button>
                  <button type="button" className={ghostBtn} onClick={() => setEditId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-ink">{y.name}</span>
                <span className="text-xs text-ink/60">{y.capacity ? `${used(y.id)} of ${y.capacity} places used` : "Capacity not set"}</span>
                <span className="flex gap-1">
                  <button type="button" className={ghostBtn} onClick={() => { setEditId(y.id); setDraft({ name: y.name, sort_order: String(y.sort_order), capacity: y.capacity ? String(y.capacity) : "" }); setError(null); }}>Edit</button>
                  <button type="button" className={dangerBtn} onClick={() => remove(y)}>Remove</button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-2 sm:grid-cols-3 sm:items-end">
        <Field label="New year group"><input className={inputCls} placeholder="Year 7" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Capacity (optional)"><input type="number" min={1} inputMode="numeric" className={inputCls} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
        <div><button type="button" className={`${primaryBtn} w-full sm:w-auto`} disabled={busy} onClick={add}>Add year group</button></div>
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </StepCard>
  );
}

/* ── Step 3: subjects ───────────────────────────────────────────────── */
export function SubjectsSection({ subjects, reload }: Common & { subjects: Subject[] }) {
  const supabase = getSupabaseClient();
  const { error, setError, busy, run } = useAction();
  const [form, setForm] = useState({ name: "", code: "", is_core: false });
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", code: "", is_core: false });

  const add = async () => {
    if (!supabase || !form.name.trim()) return setError("Enter a subject name.");
    const ok = await run(() => supabase.from("subjects").insert({ name: form.name.trim(), code: form.code.trim() || null, is_core: form.is_core }), () => setForm({ name: "", code: "", is_core: false }));
    if (ok) await reload();
  };
  const save = async (id: string) => {
    if (!supabase || !draft.name.trim()) return setError("Enter a subject name.");
    const ok = await run(() => supabase.from("subjects").update({ name: draft.name.trim(), code: draft.code.trim() || null, is_core: draft.is_core }).eq("id", id), () => setEditId(null));
    if (ok) await reload();
  };
  const remove = async (s: Subject) => {
    if (!supabase || !window.confirm(`Remove ${s.name}?`)) return;
    const ok = await run(() => supabase.from("subjects").delete().eq("id", s.id));
    if (ok) await reload();
  };

  return (
    <StepCard step={3} id="subjects" done={subjects.length > 0} title="Subjects" help="What is taught. Core subjects (English, Maths, Science) are placed earlier in the day when the timetable is generated.">
      {subjects.length === 0 && <EmptyState>No subjects yet. Add the subjects you teach below.</EmptyState>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {subjects.map((s) => (
          <li key={s.id} className="rounded-xl border border-gold-light/40 px-3 py-2 text-sm">
            {editId === s.id ? (
              <div className="space-y-2">
                <input className={inputCls} aria-label="Subject name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                <label className="flex items-center gap-2 text-xs text-ink/70"><input type="checkbox" checked={draft.is_core} onChange={(e) => setDraft((d) => ({ ...d, is_core: e.target.checked }))} /> Core subject</label>
                <div className="flex gap-2">
                  <button type="button" className={primaryBtn} disabled={busy} onClick={() => save(s.id)}>Save</button>
                  <button type="button" className={ghostBtn} onClick={() => setEditId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-ink">{s.name}{s.is_core && <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-normal text-teal-900">Core</span>}</span>
                <span className="flex shrink-0 gap-1">
                  <button type="button" className={ghostBtn} onClick={() => { setEditId(s.id); setDraft({ name: s.name, code: s.code || "", is_core: s.is_core }); setError(null); }}>Edit</button>
                  <button type="button" className={dangerBtn} onClick={() => remove(s)}>Remove</button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-2 sm:grid-cols-3 sm:items-end">
        <Field label="New subject"><input className={inputCls} placeholder="Arabic" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} /></Field>
        <label className="flex items-center gap-2 pb-2 text-sm text-ink/70"><input type="checkbox" checked={form.is_core} onChange={(e) => setForm((s) => ({ ...s, is_core: e.target.checked }))} /> Core subject</label>
        <div><button type="button" className={`${primaryBtn} w-full sm:w-auto`} disabled={busy} onClick={add}>Add subject</button></div>
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </StepCard>
  );
}
