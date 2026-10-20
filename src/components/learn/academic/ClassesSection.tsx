"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { classTeacherNames, todayIso, type CstRow } from "@/lib/learn/teacherFor";
import { cleanMeetingUrl, dangerBtn, EmptyState, Field, ghostBtn, inputCls, Notice, primaryBtn, StepCard } from "./shared";
import type { AcademicYear, Child, ClassRow, ClassTeacher, Enrolment, Subject, Teacher, YearGroup } from "./shared";

type Props = {
  classes: ClassRow[];
  yearGroups: YearGroup[];
  subjects: Subject[];
  years: AcademicYear[];
  kids: Child[];
  enrolments: Enrolment[];
  teachers: Teacher[];
  classTeachers: ClassTeacher[];
  subjectTeachers: CstRow[];
  reload: () => Promise<void>;
  ready: boolean;
};

type Draft = { name: string; year_group_id: string; subject_id: string; academic_year_id: string; weekly_lessons: string; lesson_length_minutes: string; meeting_url: string };
const BLANK: Draft = { name: "", year_group_id: "", subject_id: "", academic_year_id: "", weekly_lessons: "1", lesson_length_minutes: "60", meeting_url: "" };

const MEETING_HELP = "Paste a recurring Teams (or Zoom/Meet) link. Used to join this class's lessons.";

function ClassFields({ d, set, props }: { d: Draft; set: (f: (s: Draft) => Draft) => void; props: Props }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Class name"><input className={inputCls} value={d.name} onChange={(e) => set((s) => ({ ...s, name: e.target.value }))} placeholder="Year 7 Arabic" /></Field>
      <Field label="Year group">
        <select className={inputCls} value={d.year_group_id} onChange={(e) => set((s) => ({ ...s, year_group_id: e.target.value }))}>
          <option value="">Choose…</option>
          {props.yearGroups.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
      </Field>
      <Field label="Subject">
        <select className={inputCls} value={d.subject_id} onChange={(e) => set((s) => ({ ...s, subject_id: e.target.value }))}>
          <option value="">Choose…</option>
          {props.subjects.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
      </Field>
      <Field label="Academic year">
        <select className={inputCls} value={d.academic_year_id} onChange={(e) => set((s) => ({ ...s, academic_year_id: e.target.value }))}>
          <option value="">Choose…</option>
          {props.years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
        </select>
      </Field>
      <Field label="Lessons per week"><input type="text" inputMode="decimal" min={1} className={inputCls} value={d.weekly_lessons} onChange={(e) => set((s) => ({ ...s, weekly_lessons: e.target.value }))} /></Field>
      <Field label="Lesson length (minutes)"><input type="text" inputMode="decimal" min={15} step={5} className={inputCls} value={d.lesson_length_minutes} onChange={(e) => set((s) => ({ ...s, lesson_length_minutes: e.target.value }))} /></Field>
      <Field label="Lesson meeting link (optional)" hint={MEETING_HELP} className="sm:col-span-2 lg:col-span-3">
        <input type="url" inputMode="url" className={inputCls} placeholder="https://teams.microsoft.com/l/meetup-join/…" value={d.meeting_url} onChange={(e) => set((s) => ({ ...s, meeting_url: e.target.value }))} />
      </Field>
    </div>
  );
}

export function ClassesSection(props: Props) {
  const supabase = getSupabaseClient();
  const { classes, yearGroups, subjects, kids, enrolments, teachers, classTeachers, subjectTeachers, reload, ready } = props;
  const [form, setForm] = useState<Draft>(BLANK);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [enrolForm, setEnrolForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const payload = (d: Draft): { error: string } | { row: Record<string, unknown> } => {
    if (!d.name.trim() || !d.year_group_id || !d.subject_id) return { error: "Class name, year group and subject are required." };
    const weekly = Number(d.weekly_lessons);
    const len = Number(d.lesson_length_minutes);
    if (!Number.isInteger(weekly) || weekly < 1) return { error: "Lessons per week must be 1 or more." };
    if (!Number.isInteger(len) || len < 1) return { error: "Lesson length must be a number of minutes." };
    const url = cleanMeetingUrl(d.meeting_url);
    if (url === "invalid") return { error: "The meeting link must be a full https:// link." };
    return {
      row: {
        name: d.name.trim(),
        year_group: yearGroups.find((y) => y.id === d.year_group_id)?.name || "",
        year_group_id: d.year_group_id,
        subject_id: d.subject_id,
        academic_year_id: d.academic_year_id || null,
        weekly_lessons: weekly,
        lesson_length_minutes: len,
        meeting_url: url,
      },
    };
  };

  const write = async (fn: () => PromiseLike<{ error: { message: string } | null }>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await fn();
      if (err) return setError(err.message);
      after?.();
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!supabase) return;
    const p = payload(form);
    if ("error" in p) return setError(p.error);
    await write(() => supabase.from("classes").insert(p.row), () => setForm(BLANK));
  };
  const save = async (id: string) => {
    if (!supabase) return;
    const p = payload(draft);
    if ("error" in p) return setError(p.error);
    await write(() => supabase.from("classes").update(p.row).eq("id", id), () => setEditId(null));
  };
  const remove = async (c: ClassRow) => {
    if (!supabase || !window.confirm(`Delete ${c.name}? Its enrolments and timetable slots are deleted too.`)) return;
    await write(() => supabase.from("classes").delete().eq("id", c.id));
  };
  const enrol = async (classId: string) => {
    if (!supabase || !enrolForm[classId]) return;
    await write(() => supabase.from("enrolments").insert({ class_id: classId, child_id: enrolForm[classId] }), () => setEnrolForm((s) => ({ ...s, [classId]: "" })));
  };

  // Derived from the per-subject teacher mapping, e.g. "Mr X (Arabic), Ms Y (Maths)".
  // Classes not yet mapped fall back to the older class-scoped teacher roles.
  const teacherNames = (classId: string): string[] => {
    const cls = classes.find((c) => c.id === classId);
    const sids = new Set<string>();
    if (cls?.subject_id) sids.add(cls.subject_id);
    for (const r of subjectTeachers) if (r.class_id === classId) sids.add(r.subject_id);
    const mapped = classTeacherNames(
      subjectTeachers, classId, [...sids], todayIso(),
      (id) => teachers.find((x) => x.id === id)?.full_name || "Unnamed teacher",
      (id) => subjects.find((s) => s.id === id)?.name || "Subject",
    );
    if (mapped) return [mapped];
    return classTeachers.filter((t) => t.scope_id === classId).map((t) => teachers.find((x) => x.id === t.user_id)?.full_name || "Unnamed teacher");
  };

  return (
    <StepCard step={4} id="classes" done={classes.length > 0} title="Classes" help="A class is a subject taught to a year group. Set how many lessons it needs each week; the timetable is built from this.">
      {!ready && <EmptyState>Finish steps 1 to 3 first: a class needs an academic year, a year group and a subject to pick from.</EmptyState>}
      {ready && classes.length === 0 && <EmptyState>No classes yet. Add your first class below.</EmptyState>}
      <div className="space-y-3">
        {classes.map((c) => {
          const names = teacherNames(c.id);
          const enrolled = enrolments.filter((e) => e.class_id === c.id);
          const yg = yearGroups.find((y) => y.id === c.year_group_id);
          return (
            <div key={c.id} className="rounded-xl border border-gold-light/40 p-3">
              {editId === c.id ? (
                <div className="space-y-3">
                  <ClassFields d={draft} set={setDraft} props={props} />
                  <div className="flex gap-2">
                    <button type="button" className={primaryBtn} disabled={busy} onClick={() => save(c.id)}>Save class</button>
                    <button type="button" className={ghostBtn} onClick={() => setEditId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{c.name}</p>
                      <p className="text-xs text-ink/60">
                        {yg?.name || "No year group"} · {subjects.find((s) => s.id === c.subject_id)?.name || "No subject"} · {c.weekly_lessons} lesson{c.weekly_lessons === 1 ? "" : "s"}/week × {c.lesson_length_minutes} min
                      </p>
                    </div>
                    <span className="flex gap-1">
                      <button type="button" className={ghostBtn} onClick={() => { setEditId(c.id); setDraft({ name: c.name, year_group_id: c.year_group_id || "", subject_id: c.subject_id || "", academic_year_id: c.academic_year_id || "", weekly_lessons: String(c.weekly_lessons), lesson_length_minutes: String(c.lesson_length_minutes), meeting_url: c.meeting_url || "" }); setError(null); }}>Edit</button>
                      <button type="button" className={dangerBtn} onClick={() => remove(c)}>Delete</button>
                    </span>
                  </div>
                  <dl className="mt-2 grid gap-1 text-xs text-ink/70 sm:grid-cols-3">
                    <div><dt className="inline font-medium">Teachers: </dt><dd className="inline">{names.length ? names.join(", ") : <span className="text-amber-800">none assigned (choose one in &quot;Who teaches what&quot; above)</span>}</dd></div>
                    <div><dt className="inline font-medium">Enrolled: </dt><dd className="inline">{enrolled.length}{yg?.capacity ? ` (year group capacity ${yg.capacity})` : ""}</dd></div>
                    <div className="truncate"><dt className="inline font-medium">Meeting link: </dt><dd className="inline">{c.meeting_url ? "set" : <span className="text-ink/65">not set</span>}</dd></div>
                  </dl>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select value={enrolForm[c.id] || ""} onChange={(e) => setEnrolForm((s) => ({ ...s, [c.id]: e.target.value }))} aria-label={`Enrol a child into ${c.name}`} className="rounded-lg border border-gold-light/70 px-2 py-1.5 text-xs">
                      <option value="">Enrol child…</option>
                      {kids.filter((ch) => !enrolled.some((e) => e.child_id === ch.id)).map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                    </select>
                    <button type="button" className={ghostBtn} disabled={busy || !enrolForm[c.id]} onClick={() => enrol(c.id)}>Enrol</button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {ready && (
        <div className="mt-5 rounded-xl bg-cream/60 p-3 sm:p-4">
          <p className="mb-3 text-sm font-medium text-ink">Add a class</p>
          <ClassFields d={form} set={setForm} props={props} />
          <div className="mt-3"><button type="button" className={primaryBtn} disabled={busy} onClick={add}>Add class</button></div>
        </div>
      )}
      <p className="mt-3 text-xs text-ink/65">Teachers are chosen per class subject in &quot;Who teaches what&quot; above, so one teacher can teach many classes. A dated override there covers a period without changing the weekly timetable.</p>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </StepCard>
  );
}
