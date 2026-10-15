"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isDefaultRow, MAX_TEACHER_LESSONS_PER_WEEK, rowFor, teacherFor, teacherLoad, todayIso, type CstRow } from "@/lib/learn/teacherFor";
import { dangerBtn, ghostBtn, inputCls, Notice, primaryBtn } from "./shared";
import type { ClassRow, ClassTeacher, Subject, Teacher, YearGroup } from "./shared";

type Props = {
  classes: ClassRow[];
  yearGroups: YearGroup[];
  subjects: Subject[];
  teachers: Teacher[];
  classTeachers: ClassTeacher[];
  subjectTeachers: CstRow[];
  reload: () => Promise<void>;
};

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-gold-500 bg-gold-500 text-ink" : "border-gold-light bg-white text-ink/70 hover:bg-cream"}`;

const fmt = (d: string | null): string => (d ? d.split("-").reverse().join("/") : "");

function rangeLabel(r: CstRow): string {
  if (r.valid_from && r.valid_to) return `${fmt(r.valid_from)} to ${fmt(r.valid_to)}`;
  if (r.valid_from) return `from ${fmt(r.valid_from)}`;
  if (r.valid_to) return `until ${fmt(r.valid_to)}`;
  return "default";
}

type Cell = { classId: string; subjectId: string };

export function TeacherMatrix({ classes, yearGroups, subjects, teachers, classTeachers, subjectTeachers, reload }: Props) {
  const today = todayIso();
  const [yg, setYg] = useState<string>("all");
  const [showAllSubjects, setShowAllSubjects] = useState(false);
  const [cell, setCell] = useState<Cell | null>(null);

  const teacherName = (id: string | null | undefined): string => teachers.find((t) => t.id === id)?.full_name || "Unnamed teacher";
  const offered = (c: ClassRow, sid: string): boolean => c.subject_id === sid || subjectTeachers.some((r) => r.class_id === c.id && r.subject_id === sid);
  const legacyTeacher = (c: ClassRow, sid: string): string | null =>
    c.subject_id === sid ? classTeachers.find((t) => t.scope_id === c.id)?.user_id ?? null : null;
  const effective = (c: ClassRow, sid: string): string | null => teacherFor(subjectTeachers, c.id, sid, today) ?? legacyTeacher(c, sid);

  const shownClasses = useMemo(() => classes.filter((c) => yg === "all" || c.year_group_id === yg).sort((a, b) => a.name.localeCompare(b.name)), [classes, yg]);
  const columns = useMemo(() => {
    if (showAllSubjects) return subjects;
    const used = new Set<string>();
    for (const c of shownClasses) {
      if (c.subject_id) used.add(c.subject_id);
      for (const r of subjectTeachers) if (r.class_id === c.id) used.add(r.subject_id);
    }
    return subjects.filter((s) => used.has(s.id));
  }, [subjects, shownClasses, subjectTeachers, showAllSubjects]);

  // Load per teacher over every class (not just the filtered ones).
  const pairs = useMemo(() => {
    const out: { class_id: string; subject_id: string; lessons: number }[] = [];
    for (const c of classes) {
      const sids = new Set<string>();
      if (c.subject_id) sids.add(c.subject_id);
      for (const r of subjectTeachers) if (r.class_id === c.id) sids.add(r.subject_id);
      for (const sid of sids) {
        const dflt = subjectTeachers.find((r) => r.class_id === c.id && r.subject_id === sid && isDefaultRow(r));
        const n = dflt?.lessons_per_week ?? (c.subject_id === sid ? c.weekly_lessons : 0);
        out.push({ class_id: c.id, subject_id: sid, lessons: n });
      }
    }
    return out;
  }, [classes, subjectTeachers]);
  // teacherLoad returns a new Map that is then added to, so this is computed
  // on each render rather than memoised.
  const load = (() => {
    const l = teacherLoad(pairs, subjectTeachers, today);
    // legacy class teachers with no mapping row yet
    for (const c of classes) {
      if (c.subject_id && !teacherFor(subjectTeachers, c.id, c.subject_id, today)) {
        const t = classTeachers.find((x) => x.scope_id === c.id)?.user_id;
        if (t) l.set(t, (l.get(t) || 0) + c.weekly_lessons);
      }
    }
    return l;
  })();
  const loadRows = [...load.entries()].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n);

  // Problems worth a warning
  const problems: string[] = [];
  for (const { id, n } of loadRows) if (n > MAX_TEACHER_LESSONS_PER_WEEK) problems.push(`${teacherName(id)} has ${n} lessons a week, over the ${MAX_TEACHER_LESSONS_PER_WEEK} limit.`);
  for (const c of classes) {
    const total = pairs.filter((p) => p.class_id === c.id).reduce((n, p) => n + p.lessons, 0);
    if (total > 30) problems.push(`${c.name} needs ${total} lessons a week; the timetable has 30 periods.`);
    const sids = new Set(subjectTeachers.filter((r) => r.class_id === c.id).map((r) => r.subject_id));
    for (const sid of sids) {
      const dated = subjectTeachers.filter((r) => r.class_id === c.id && r.subject_id === sid && !isDefaultRow(r));
      for (let i = 0; i < dated.length; i++) {
        for (let j = i + 1; j < dated.length; j++) {
          const a = dated[i], b = dated[j];
          if ((!a.valid_to || !b.valid_from || b.valid_from <= a.valid_to) && (!b.valid_to || !a.valid_from || a.valid_from <= b.valid_to)) {
            problems.push(`${c.name} ${subjects.find((s) => s.id === sid)?.name || ""}: two overrides overlap (${rangeLabel(a)} and ${rangeLabel(b)}). The narrower one wins.`);
          }
        }
      }
    }
  }

  const maxed = (id: string | null) => id !== null && (load.get(id) || 0) > MAX_TEACHER_LESSONS_PER_WEEK;

  return (
    <section id="teacher-matrix" className="scroll-mt-20 rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Who teaches what</h2>
      <p className="mt-0.5 text-sm text-ink/60">
        Each class subject has its own teacher, so one teacher can teach many classes. Pick a cell to choose the teacher, or to add a dated override such as cover while someone is away.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by year group">
        <button type="button" aria-pressed={yg === "all"} className={chip(yg === "all")} onClick={() => setYg("all")}>All year groups</button>
        {yearGroups.map((y) => <button key={y.id} type="button" aria-pressed={yg === y.id} className={chip(yg === y.id)} onClick={() => setYg(y.id)}>{y.name}</button>)}
        <label className="ml-auto flex items-center gap-2 text-xs text-ink/70">
          <input type="checkbox" checked={showAllSubjects} onChange={(e) => setShowAllSubjects(e.target.checked)} />
          Show every subject
        </label>
      </div>

      {shownClasses.length === 0 || columns.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-gold-light bg-cream/60 px-4 py-4 text-sm text-ink/70">
          {classes.length === 0 ? "Add classes below first, then choose their teachers here." : "No classes or subjects match this filter."}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-gold-light/50">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-cream/70">
                <th scope="col" className="sticky left-0 z-10 min-w-[9rem] bg-cream px-3 py-2 font-semibold text-ink/70">Class</th>
                {columns.map((s) => <th key={s.id} scope="col" className="min-w-[8.5rem] px-2 py-2 font-semibold text-ink/70">{s.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {shownClasses.map((c) => (
                <tr key={c.id} className="border-t border-gold-light/40">
                  <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-ink">
                    {c.name}
                    <span className="block text-[11px] font-normal text-ink/65">{yearGroups.find((y) => y.id === c.year_group_id)?.name || ""}</span>
                  </th>
                  {columns.map((s) => {
                    if (!offered(c, s.id)) {
                      return (
                        <td key={s.id} className="px-2 py-1.5">
                          {showAllSubjects && (
                            <button type="button" className="rounded-lg border border-dashed border-gold-light px-2 py-1 text-ink/65 hover:bg-cream" aria-label={`Add ${s.name} to ${c.name}`} onClick={() => setCell({ classId: c.id, subjectId: s.id })}>+</button>
                          )}
                        </td>
                      );
                    }
                    const t = effective(c, s.id);
                    const eff = rowFor(subjectTeachers, c.id, s.id, today);
                    const overrides = subjectTeachers.filter((r) => r.class_id === c.id && r.subject_id === s.id && !isDefaultRow(r));
                    return (
                      <td key={s.id} className="px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => setCell({ classId: c.id, subjectId: s.id })}
                          aria-label={`${c.name} ${s.name}: ${t ? teacherName(t) : "no teacher"}. Change`}
                          className={`flex w-full items-center justify-between gap-1 rounded-lg border px-2 py-1.5 text-left ${t ? (maxed(t) ? "border-red-300 bg-red-50 text-red-900" : eff && !isDefaultRow(eff) ? "border-teal-500/50 bg-teal-100/60 text-teal-900" : "border-gold-light bg-cream/50 text-ink") : "border-amber-300 bg-amber-50 text-amber-900"}`}
                        >
                          <span className="truncate">{t ? teacherName(t) : "Choose teacher"}</span>
                          {overrides.length > 0 && <span className="shrink-0 rounded bg-white/70 px-1 text-[10px] font-semibold" title={overrides.map(rangeLabel).join(", ")}>{eff && !isDefaultRow(eff) ? "cover" : `+${overrides.length}`}</span>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {problems.length > 0 && (
        <ul className="mt-4 space-y-1" aria-label="Warnings">
          {problems.slice(0, 8).map((p, i) => <li key={i}><Notice tone="error">{p}</Notice></li>)}
          {problems.length > 8 && <li className="text-xs text-ink/60">and {problems.length - 8} more.</li>}
        </ul>
      )}

      {loadRows.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-ink/70">Lessons a week per teacher (limit {MAX_TEACHER_LESSONS_PER_WEEK})</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {loadRows.map(({ id, n }) => (
              <li key={id} className={`rounded-full border px-3 py-1 text-xs ${n > MAX_TEACHER_LESSONS_PER_WEEK ? "border-red-300 bg-red-50 text-red-900" : "border-gold-light bg-white text-ink/80"}`}>
                {teacherName(id)}: <strong>{n}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cell && (
        <CellDialog
          key={`${cell.classId}-${cell.subjectId}`}
          cls={classes.find((c) => c.id === cell.classId)!}
          subject={subjects.find((s) => s.id === cell.subjectId)!}
          teachers={teachers}
          rows={subjectTeachers.filter((r) => r.class_id === cell.classId && r.subject_id === cell.subjectId)}
          load={load}
          legacyTeacher={legacyTeacher(classes.find((c) => c.id === cell.classId)!, cell.subjectId)}
          onClose={() => setCell(null)}
          reload={reload}
        />
      )}
    </section>
  );
}

function CellDialog({ cls, subject, teachers, rows, load, legacyTeacher, onClose, reload }: {
  cls: ClassRow; subject: Subject; teachers: Teacher[]; rows: CstRow[]; load: Map<string, number>; legacyTeacher: string | null; onClose: () => void; reload: () => Promise<void>;
}) {
  const supabase = getSupabaseClient();
  const dflt = rows.find(isDefaultRow) || null;
  const overrides = rows.filter((r) => !isDefaultRow(r)).sort((a, b) => (a.valid_from || "").localeCompare(b.valid_from || ""));
  const isOwn = cls.subject_id === subject.id;
  const [q, setQ] = useState("");
  const [lessons, setLessons] = useState<string>(String(dflt?.lessons_per_week ?? ""));
  const [ovTeacher, setOvTeacher] = useState("");
  const [ovFrom, setOvFrom] = useState(todayIso());
  const [ovTo, setOvTo] = useState("");
  const [ovNote, setOvNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = (id: string) => teachers.find((t) => t.id === id)?.full_name || "Unnamed teacher";
  const list = teachers.filter((t) => t.full_name.toLowerCase().includes(q.trim().toLowerCase()));

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, close = false) => {
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await fn();
      if (err) return setError(err.message);
      await reload();
      if (close) onClose();
    } finally {
      setBusy(false);
    }
  };

  const lessonsValue = (): number | null | "bad" => {
    if (!lessons.trim()) return null;
    const n = Number(lessons);
    return Number.isInteger(n) && n > 0 ? n : "bad";
  };

  const pick = async (teacherId: string) => {
    if (!supabase) return;
    const lw = lessonsValue();
    if (lw === "bad") return setError("Lessons per week must be a whole number of 1 or more.");
    if (!isOwn && lw === null) return setError("Say how many lessons a week this extra subject needs.");
    if (dflt) await run(() => supabase.from("class_subject_teachers").update({ teacher_id: teacherId, lessons_per_week: lw }).eq("id", dflt.id), true);
    else {
      const { data: u } = await supabase.auth.getUser();
      await run(() => supabase.from("class_subject_teachers").insert({ class_id: cls.id, subject_id: subject.id, teacher_id: teacherId, lessons_per_week: lw, created_by: u.user?.id ?? null }), true);
    }
  };

  const clear = async () => {
    if (!supabase || !dflt) return;
    await run(() => supabase.from("class_subject_teachers").delete().eq("id", dflt.id), true);
  };

  const addOverride = async () => {
    if (!supabase) return;
    if (!ovTeacher) return setError("Choose who covers.");
    if (!ovFrom) return setError("Choose the first date.");
    if (ovTo && ovTo < ovFrom) return setError("The last date can't be before the first.");
    const { data: u } = await supabase.auth.getUser();
    await run(() => supabase.from("class_subject_teachers").insert({
      class_id: cls.id, subject_id: subject.id, teacher_id: ovTeacher, valid_from: ovFrom, valid_to: ovTo || null,
      notes: ovNote.trim() || null, created_by: u.user?.id ?? null,
    }));
    setOvTeacher(""); setOvNote("");
  };

  const delOverride = async (id: string) => {
    if (!supabase) return;
    await run(() => supabase.from("class_subject_teachers").delete().eq("id", id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-2 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={`${cls.name} ${subject.name} teacher`} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-serif text-lg font-semibold text-ink">{subject.name}</h3>
            <p className="text-xs text-ink/60">{cls.name}</p>
          </div>
          <button type="button" className={ghostBtn} onClick={onClose}>Close</button>
        </div>

        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium text-ink/70">
            Lessons a week{isOwn ? " (blank = the class setting, " + cls.weekly_lessons + ")" : ""}
            <input type="number" min={1} className={`${inputCls} mt-1`} value={lessons} onChange={(e) => setLessons(e.target.value)} />
          </label>
          <p className="text-xs font-medium text-ink/70">Usual teacher{dflt ? `: ${name(dflt.teacher_id)}` : legacyTeacher ? `: ${name(legacyTeacher)} (from People, not yet saved here)` : ""}</p>
          <input className={inputCls} placeholder="Search teachers" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search teachers" autoFocus />
          <ul className="max-h-44 divide-y divide-gold-light/40 overflow-y-auto rounded-lg border border-gold-light/60">
            {list.length === 0 && <li className="px-3 py-2 text-xs text-ink/60">No teachers match.</li>}
            {list.map((t) => {
              const n = load.get(t.id) || 0;
              return (
                <li key={t.id}>
                  <button type="button" disabled={busy} onClick={() => pick(t.id)} className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-cream ${dflt?.teacher_id === t.id ? "bg-gold-100/60 font-semibold" : ""}`}>
                    <span>{t.full_name}</span>
                    <span className={`text-xs ${n >= MAX_TEACHER_LESSONS_PER_WEEK ? "font-semibold text-red-700" : "text-ink/65"}`}>{n} lessons</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {dflt && <button type="button" className={dangerBtn} disabled={busy} onClick={clear}>Remove usual teacher</button>}
        </div>

        <div className="mt-4 rounded-xl bg-cream/60 p-3">
          <p className="text-sm font-medium text-ink">Dated override</p>
          <p className="text-xs text-ink/60">A different teacher for these dates only. Lessons in that period change teacher; the weekly timetable stays as it is.</p>
          {overrides.length > 0 && (
            <ul className="mt-2 space-y-1">
              {overrides.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 rounded-lg border border-gold-light/60 bg-white px-2 py-1.5 text-xs">
                  <span><strong>{name(o.teacher_id)}</strong> {rangeLabel(o)}{o.notes ? ` · ${o.notes}` : ""}</span>
                  <button type="button" className={dangerBtn} disabled={busy} onClick={() => delOverride(o.id)}>Delete</button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="block text-xs font-medium text-ink/70 sm:col-span-2">
              Covering teacher
              <select className={`${inputCls} mt-1`} value={ovTeacher} onChange={(e) => setOvTeacher(e.target.value)}>
                <option value="">Choose…</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name} ({load.get(t.id) || 0} lessons)</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium text-ink/70">From<input type="date" className={`${inputCls} mt-1`} value={ovFrom} onChange={(e) => setOvFrom(e.target.value)} /></label>
            <label className="block text-xs font-medium text-ink/70">To (blank = until further notice)<input type="date" className={`${inputCls} mt-1`} value={ovTo} min={ovFrom} onChange={(e) => setOvTo(e.target.value)} /></label>
            <label className="block text-xs font-medium text-ink/70 sm:col-span-2">Note (optional)<input className={`${inputCls} mt-1`} value={ovNote} onChange={(e) => setOvNote(e.target.value)} placeholder="e.g. Maternity cover" /></label>
          </div>
          <div className="mt-3"><button type="button" className={primaryBtn} disabled={busy} onClick={addOverride}>Add dated override</button></div>
        </div>
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      </div>
    </div>
  );
}
