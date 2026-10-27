"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ui } from "@/components/learn/ui";

// Report settings (Headteacher/Admin): the comment bank teachers draw on,
// assessment types and per-subject mark schemes / grade boundaries.

type AssessmentType = { id: string; name: string };
type Comment = { id: string; text: string; subject_id: string | null };

function AssessmentTypesAdmin() {
  const supabase = getSupabaseClient();
  const [types, setTypes] = useState<AssessmentType[]>([]);
  const [name, setName] = useState("");

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("assessment_types").select("id, name").order("name");
    setTypes((data as AssessmentType[]) || []);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const add = async () => {
    if (!supabase || !name.trim()) return;
    await supabase.from("assessment_types").insert({ name: name.trim() });
    setName("");
    await load();
  };

  return (
    <div className="rounded-2xl border border-gold-light bg-white p-4 sm:p-5">
      <h2 className="text-base font-semibold text-ink">Assessment types</h2>
      <div className="mt-3 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spelling test" className={`min-w-0 flex-1 ${ui.input}`} />
        <button type="button" onClick={add} className={ui.btnPrimary}>
          Add
        </button>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {types.map((t) => (
          <li key={t.id} className="rounded-full border border-gold-light/40 px-3 py-1 text-xs text-ink/70">
            {t.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CommentBankAdmin() {
  const supabase = getSupabaseClient();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("comment_bank").select("id, text, subject_id").order("created_at", { ascending: false }).limit(200);
    setComments((data as Comment[]) || []);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const add = async () => {
    if (!supabase || !text.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("comment_bank").insert({ text: text.trim(), created_by: user?.id });
    setText("");
    await load();
  };

  const remove = async (id: string) => {
    if (!supabase || !window.confirm("Remove this sentence from the comment bank?")) return;
    await supabase.from("comment_bank").delete().eq("id", id);
    await load();
  };

  return (
    <div className="rounded-2xl border border-gold-light bg-white p-4 sm:p-5">
      <h2 className="text-base font-semibold text-ink">Comment bank</h2>
      <p className="mt-1 text-xs text-ink/65">Reusable sentences teachers can add to a report comment. Write {"{name}"} where the pupil&apos;s first name should go.</p>
      <div className="mt-3 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. {name} makes a positive contribution in class discussions." className={`min-w-0 flex-1 ${ui.input}`} />
        <button type="button" onClick={add} className={ui.btnPrimary}>
          Add
        </button>
      </div>
      <ul className="mt-3 space-y-1">
        {comments.map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-3 rounded-lg border border-gold-light/60 px-3 py-1.5 text-sm text-ink/75">
            <span className="min-w-0">{c.text}</span>
            <button type="button" onClick={() => remove(c.id)} className={ui.btnLinkDanger}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Subject = { id: string; name: string };
type MarkScheme = { id: string; scale_name: string; subject_id: string };
type Boundary = { id: string; label: string; min_percent: number };

function MarkSchemesAdmin() {
  const supabase = getSupabaseClient();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [schemes, setSchemes] = useState<MarkScheme[]>([]);
  const [schemeName, setSchemeName] = useState("");
  const [selectedScheme, setSelectedScheme] = useState("");
  const [boundaries, setBoundaries] = useState<Boundary[]>([]);
  const [label, setLabel] = useState("");
  const [minPercent, setMinPercent] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase.from("subjects").select("id, name").order("name").then(({ data }) => setSubjects((data as Subject[]) || []));
  }, [supabase]);

  const loadSchemes = async (sid: string) => {
    if (!supabase || !sid) return;
    const { data } = await supabase.from("mark_schemes").select("id, scale_name, subject_id").eq("subject_id", sid);
    setSchemes((data as MarkScheme[]) || []);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    loadSchemes(subjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, subjectId]);

  const loadBoundaries = async (sid: string) => {
    if (!supabase || !sid) return;
    const { data } = await supabase.from("grade_boundaries").select("id, label, min_percent").eq("mark_scheme_id", sid).order("min_percent", { ascending: false });
    setBoundaries((data as Boundary[]) || []);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    loadBoundaries(selectedScheme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, selectedScheme]);

  const addScheme = async () => {
    if (!supabase || !subjectId || !schemeName.trim()) return;
    await supabase.from("mark_schemes").insert({ subject_id: subjectId, scale_name: schemeName.trim() });
    setSchemeName("");
    await loadSchemes(subjectId);
  };

  const addBoundary = async () => {
    if (!supabase || !selectedScheme || !label.trim() || !minPercent) return;
    await supabase.from("grade_boundaries").insert({ mark_scheme_id: selectedScheme, label: label.trim(), min_percent: Number(minPercent) });
    setLabel("");
    setMinPercent("");
    await loadBoundaries(selectedScheme);
  };

  return (
    <div className="rounded-2xl border border-gold-light bg-white p-4 sm:p-5">
      <h2 className="text-base font-semibold text-ink">Mark schemes &amp; grade boundaries</h2>
      <p className="mt-1 text-xs text-ink/65">Per-subject percentage bands, the single source of truth grades are resolved against, never hardcoded.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Subject" className={`${ui.input} !w-auto`}>
          <option value="">Select a subject…</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {subjectId && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input value={schemeName} onChange={(e) => setSchemeName(e.target.value)} placeholder="New scale name (e.g. A*-U)" className={`${ui.input} !w-auto`} />
          <button type="button" onClick={addScheme} className={ui.btnSecondary}>
            Add scale
          </button>
          <select value={selectedScheme} onChange={(e) => setSelectedScheme(e.target.value)} aria-label="Mark scheme scale" className={`${ui.input} !w-auto`}>
            <option value="">Select a scale…</option>
            {schemes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.scale_name}
              </option>
            ))}
          </select>
        </div>
      )}
      {selectedScheme && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Grade label (e.g. B)" className={`${ui.input} !w-28`} />
            <input value={minPercent} onChange={(e) => setMinPercent(e.target.value)} type="text" inputMode="decimal" placeholder="Min %" className={`${ui.input} !w-28`} />
            <button type="button" onClick={addBoundary} className={ui.btnPrimary}>
              Add boundary
            </button>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {boundaries.map((b) => (
              <li key={b.id} className="rounded-full border border-gold-light/40 px-3 py-1 text-xs text-ink/70">
                {b.label} ≥ {b.min_percent}%
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Everything that shapes how reports are written, in one place. */
export function ReportSettings() {
  return (
    <div className="space-y-4">
      <CommentBankAdmin />
      <AssessmentTypesAdmin />
      <MarkSchemesAdmin />
    </div>
  );
}
