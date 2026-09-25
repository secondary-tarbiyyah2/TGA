"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { useLearnSignOut, useLearnPermission } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { QuranProgressForm } from "@/components/learn/QuranProgressForm";

type ClassOption = { id: string; name: string; subject_id: string | null };
type Child = { id: string; name: string };
type AssessmentType = { id: string; name: string };
type MarkScheme = { id: string; scale_name: string };
type Assessment = {
  id: string;
  child_id: string;
  title: string;
  date: string;
  raw_score: number | null;
  max_score: number | null;
  percent: number | null;
  grade_label: string | null;
  moderation_notes: string | null;
};

function AssessmentContent() {
  const signOut = useLearnSignOut();
  const supabase = getSupabaseClient();
  const isAssessmentLead = useLearnPermission("assessment_lead");
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState("");
  const [children, setChildren] = useState<Child[]>([]);
  const [types, setTypes] = useState<AssessmentType[]>([]);
  const [schemes, setSchemes] = useState<MarkScheme[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);

  const [childId, setChildId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [schemeId, setSchemeId] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [rawScore, setRawScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: roleRows } = await supabase.from("user_roles").select("scope_id, classes(id, name, subject_id)").eq("user_id", user.id).eq("scope_type", "class");
    const opts = ((roleRows as unknown as { classes: ClassOption | null }[]) || []).map((r) => r.classes).filter(Boolean) as ClassOption[];
    setClasses(opts);
    if (!classId && opts[0]) setClassId(opts[0].id);
    const { data: typeRows } = await supabase.from("assessment_types").select("id, name").order("name");
    setTypes((typeRows as AssessmentType[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !classId) return;
    supabase
      .from("enrolments")
      .select("child_id, children(id, name)")
      .eq("class_id", classId)
      .then(({ data }) => {
        const kids = ((data as unknown as { children: Child | null }[]) || []).map((r) => r.children).filter(Boolean) as Child[];
        setChildren(kids);
      });
    const cls = classes.find((c) => c.id === classId);
    if (cls?.subject_id) {
      supabase
        .from("mark_schemes")
        .select("id, scale_name")
        .eq("subject_id", cls.subject_id)
        .then(({ data }) => setSchemes((data as MarkScheme[]) || []));
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting derived state, not a render-cycle sync
      setSchemes([]);
    }
  }, [supabase, classId, classes]);

  const loadAssessments = async () => {
    if (!supabase || !childId) return;
    const { data } = await supabase
      .from("assessments")
      .select("id, child_id, title, date, raw_score, max_score, percent, grade_label, moderation_notes")
      .eq("class_id", classId)
      .eq("child_id", childId)
      .order("date", { ascending: false });
    setAssessments((data as Assessment[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    loadAssessments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, classId, childId]);

  const save = async () => {
    if (!supabase || !classId || !childId || !typeId || !title.trim() || !date) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const raw = rawScore ? Number(rawScore) : null;
      const max = maxScore ? Number(maxScore) : null;
      let gradeLabel: string | null = null;
      if (schemeId && raw !== null && max) {
        const { data } = await supabase.rpc("grade_for_percent", { p_mark_scheme_id: schemeId, p_percent: (raw / max) * 100 });
        gradeLabel = (data as string) || null;
      }
      const { error } = await supabase.from("assessments").insert({
        class_id: classId,
        child_id: childId,
        assessment_type_id: typeId,
        mark_scheme_id: schemeId || null,
        title: title.trim(),
        date,
        raw_score: raw,
        max_score: max,
        grade_label: gradeLabel,
        moderation_notes: notes.trim() || null,
        entered_by: user.id,
      });
      if (!error) {
        setTitle("");
        setRawScore("");
        setMaxScore("");
        setNotes("");
        await loadAssessments();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-h2 font-semibold text-ink">Assessment &amp; grades</h1>
          <button type="button" onClick={signOut} className="rounded-full border border-gold-500 px-4 py-2 text-sm text-gold-700 hover:bg-cream">
            Sign out
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-md border border-gold-light/60 px-3 py-2 text-sm">
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={childId} onChange={(e) => setChildId(e.target.value)} className="rounded-md border border-gold-light/60 px-3 py-2 text-sm">
            <option value="">Select a student…</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {childId && (
        <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
          <h2 className="font-serif text-h3 font-semibold text-ink">Record a new assessment</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className="rounded-md border border-gold-light/60 px-3 py-2 text-sm">
              <option value="">Assessment type…</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {schemes.length > 0 && (
              <select value={schemeId} onChange={(e) => setSchemeId(e.target.value)} className="rounded-md border border-gold-light/60 px-3 py-2 text-sm">
                <option value="">No mark scheme</option>
                {schemes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.scale_name}
                  </option>
                ))}
              </select>
            )}
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
            <input type="number" value={rawScore} onChange={(e) => setRawScore(e.target.value)} placeholder="Score" className="rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
            <input type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} placeholder="Out of" className="rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Moderation notes (staff only — never seen by parents/students)"
            rows={2}
            className="mt-3 w-full rounded-md border border-gold-light/60 px-3 py-2 text-sm"
          />
          <button type="button" disabled={busy || !typeId || !title.trim() || !date} onClick={save} className="mt-3 rounded-full bg-gold-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            Save assessment
          </button>

          <div className="mt-6 border-t border-gold-light/30 pt-4">
            <h3 className="text-sm font-medium text-ink">Previous assessments</h3>
            <ul className="mt-2 space-y-2">
              {assessments.map((a) => (
                <li key={a.id} className="rounded-lg border border-gold-light/40 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span>{a.title}</span>
                    <span className="text-ink/60">
                      {a.grade_label || (a.percent !== null ? `${a.percent}%` : "—")} · {new Date(a.date).toLocaleDateString("en-GB")}
                    </span>
                  </div>
                  {a.moderation_notes && <p className="mt-1 text-xs text-ink/50">Moderation: {a.moderation_notes}</p>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {isAssessmentLead && childId && <QuranProgressForm childId={childId} classId={classId || null} />}
    </div>
  );
}

export default function TeachAssessmentPage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <AssessmentContent />
      </LearnGate>
    </section>
  );
}
