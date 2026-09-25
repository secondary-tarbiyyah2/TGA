"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { getSupabaseClient } from "@/lib/supabase/client";

type AcademicYear = { id: string; label: string; starts_on: string; ends_on: string; is_test: boolean };
type Term = { id: string; name: string; starts_on: string; ends_on: string; academic_year_id: string; sanity_document_id: string | null };
type YearGroup = { id: string; name: string; sort_order: number };
type Subject = { id: string; name: string; code: string | null; is_core: boolean };
type ClassRow = { id: string; name: string; year_group_id: string | null; subject_id: string | null; weekly_lessons: number; academic_year_id: string | null };
type Child = { id: string; name: string };
type Enrolment = { id: string; class_id: string; child_id: string };

function TermsSection() {
  const supabase = getSupabaseClient();
  const [years, setYears] = useState<AcademicYear[] | null>(null);
  const [terms, setTerms] = useState<Term[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("academic_years").select("*").order("starts_on").then(({ data }) => setYears((data as AcademicYear[]) || []));
    supabase.from("terms").select("*").order("starts_on").then(({ data }) => setTerms((data as Term[]) || []));
  }, [supabase]);

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Academic years &amp; terms</h2>
      <p className="mt-1 text-xs text-ink/60">
        Read-only here — term dates are the single source of truth in Sanity and sync in automatically (see
        scripts/sync-terms-from-sanity.mjs). Edit them in the Sanity Studio&apos;s Term Dates, not here.
      </p>
      <div className="mt-4 space-y-4">
        {years?.map((y) => (
          <div key={y.id} className="rounded-lg border border-gold-light/30 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              {y.label}
              {y.is_test && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">TEST</span>}
            </div>
            <ul className="mt-2 space-y-1 text-xs text-ink/70">
              {terms?.filter((t) => t.academic_year_id === y.id).map((t) => (
                <li key={t.id}>
                  {t.name}: {t.starts_on} – {t.ends_on} {t.sanity_document_id ? "(synced from Sanity)" : "(manual)"}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {years && years.length === 0 && <p className="text-sm text-ink/60">No academic years yet — run the Sanity sync script.</p>}
      </div>
    </div>
  );
}

function NamedListSection<T extends { id: string; name: string }>({
  title,
  table,
  extraFields,
}: {
  title: string;
  table: "year_groups" | "subjects";
  extraFields?: { key: string; label: string; type: "text" | "checkbox" }[];
}) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<T[] | null>(null);
  const [name, setName] = useState("");
  const [extra, setExtra] = useState<Record<string, string | boolean>>({});

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase.from(table).select("*").order("name");
    setRows((data as T[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const add = async () => {
    if (!supabase || !name.trim()) return;
    const { error } = await supabase.from(table).insert({ name: name.trim(), ...extra });
    if (!error) {
      setName("");
      setExtra({});
      await load();
    }
  };

  const remove = async (id: string) => {
    if (!supabase) return;
    await supabase.from(table).delete().eq("id", id);
    await load();
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">{title}</h2>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
        />
        {extraFields?.map((f) =>
          f.type === "checkbox" ? (
            <label key={f.key} className="flex items-center gap-1 text-xs text-ink/70">
              <input
                type="checkbox"
                checked={Boolean(extra[f.key])}
                onChange={(e) => setExtra((s) => ({ ...s, [f.key]: e.target.checked }))}
              />
              {f.label}
            </label>
          ) : (
            <input
              key={f.key}
              value={(extra[f.key] as string) || ""}
              onChange={(e) => setExtra((s) => ({ ...s, [f.key]: e.target.value }))}
              placeholder={f.label}
              className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
            />
          )
        )}
        <button type="button" onClick={add} className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900">
          Add
        </button>
      </div>
      <ul className="mt-4 space-y-1">
        {rows?.map((r) => (
          <li key={r.id} className="flex items-center justify-between rounded-lg border border-gold-light/20 px-3 py-2 text-sm">
            {r.name}
            <button type="button" onClick={() => remove(r.id)} className="text-xs text-red-700 underline">
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClassesSection() {
  const supabase = getSupabaseClient();
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [yearGroups, setYearGroups] = useState<YearGroup[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [form, setForm] = useState({ name: "", year_group_id: "", subject_id: "", academic_year_id: "", weekly_lessons: "1" });
  const [enrolForm, setEnrolForm] = useState<Record<string, string>>({});

  const load = async () => {
    if (!supabase) return;
    const [c, yg, s, ay, ch, en] = await Promise.all([
      supabase.from("classes").select("id, name, year_group_id, subject_id, weekly_lessons, academic_year_id").order("name"),
      supabase.from("year_groups").select("id, name, sort_order").order("sort_order"),
      supabase.from("subjects").select("id, name, code, is_core").order("name"),
      supabase.from("academic_years").select("*").order("starts_on"),
      supabase.from("children").select("id, name").order("name"),
      supabase.from("enrolments").select("id, class_id, child_id"),
    ]);
    setClasses((c.data as ClassRow[]) || []);
    setYearGroups((yg.data as YearGroup[]) || []);
    setSubjects((s.data as Subject[]) || []);
    setAcademicYears((ay.data as AcademicYear[]) || []);
    setChildren((ch.data as Child[]) || []);
    setEnrolments((en.data as Enrolment[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const addClass = async () => {
    if (!supabase || !form.name.trim() || !form.year_group_id || !form.subject_id) return;
    const yearGroupName = yearGroups.find((y) => y.id === form.year_group_id)?.name || "";
    const { error } = await supabase.from("classes").insert({
      name: form.name.trim(),
      year_group: yearGroupName,
      year_group_id: form.year_group_id,
      subject_id: form.subject_id,
      academic_year_id: form.academic_year_id || null,
      weekly_lessons: Number(form.weekly_lessons) || 1,
    });
    if (!error) {
      setForm({ name: "", year_group_id: "", subject_id: "", academic_year_id: "", weekly_lessons: "1" });
      await load();
    }
  };

  const enrol = async (classId: string) => {
    if (!supabase || !enrolForm[classId]) return;
    const { error } = await supabase.from("enrolments").insert({ class_id: classId, child_id: enrolForm[classId] });
    if (!error) {
      setEnrolForm((s) => ({ ...s, [classId]: "" }));
      await load();
    }
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Classes &amp; enrolment</h2>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="Class name" className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        <select value={form.year_group_id} onChange={(e) => setForm((s) => ({ ...s, year_group_id: e.target.value }))} className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm">
          <option value="">Year group…</option>
          {yearGroups.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select value={form.subject_id} onChange={(e) => setForm((s) => ({ ...s, subject_id: e.target.value }))} className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm">
          <option value="">Subject…</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={form.academic_year_id} onChange={(e) => setForm((s) => ({ ...s, academic_year_id: e.target.value }))} className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm">
          <option value="">Academic year…</option>
          {academicYears.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
        </select>
        <input
          type="number"
          min={1}
          value={form.weekly_lessons}
          onChange={(e) => setForm((s) => ({ ...s, weekly_lessons: e.target.value }))}
          className="w-24 rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
          placeholder="Lessons/wk"
        />
        <button type="button" onClick={addClass} className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900">
          Add class
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {classes?.map((c) => (
          <div key={c.id} className="rounded-lg border border-gold-light/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-ink">
              <span>
                {c.name} · {yearGroups.find((y) => y.id === c.year_group_id)?.name || "—"} ·{" "}
                {subjects.find((s) => s.id === c.subject_id)?.name || "—"} · {c.weekly_lessons}/wk
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <select
                value={enrolForm[c.id] || ""}
                onChange={(e) => setEnrolForm((s) => ({ ...s, [c.id]: e.target.value }))}
                className="rounded-lg border border-gold-light/60 px-2 py-1"
              >
                <option value="">Enrol child…</option>
                {children.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
              </select>
              <button type="button" onClick={() => enrol(c.id)} className="rounded-full border border-gold-500 px-3 py-1 text-gold-700">
                Enrol
              </button>
              <span className="text-ink/60">
                {enrolments.filter((e) => e.class_id === c.id).length} enrolled
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AcademicContent() {
  return (
    <div className="space-y-6">
      <TermsSection />
      <NamedListSection<YearGroup> title="Year groups" table="year_groups" />
      <NamedListSection<Subject> title="Subjects" table="subjects" extraFields={[{ key: "is_core", label: "Core subject", type: "checkbox" }]} />
      <ClassesSection />
    </div>
  );
}

export default function AdminAcademicPage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <AdminShell>
          <AcademicContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
