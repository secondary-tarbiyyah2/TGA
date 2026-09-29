"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { getSupabaseClient } from "@/lib/supabase/client";

type Report = { id: string; child_id: string; term_id: string; status: string; overall_comment: string | null; children?: { name: string } | null; terms?: { name: string } | null };
type AssessmentType = { id: string; name: string };
type Comment = { id: string; text: string; subject_id: string | null };

function TermReportApprovals() {
  const supabase = getSupabaseClient();
  const [reports, setReports] = useState<Report[] | null>(null);

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("term_reports")
      .select("id, child_id, term_id, status, overall_comment, children(name), terms(name)")
      .in("status", ["pending_approval", "approved"])
      .order("updated_at", { ascending: false });
    setReports((data as unknown as Report[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const approve = async (id: string) => {
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("term_reports").update({ status: "approved", approved_by: user?.id, approved_at: new Date().toISOString() }).eq("id", id);
    await load();
  };

  const release = async (id: string) => {
    if (!supabase) return;
    await supabase.from("term_reports").update({ status: "released", released_at: new Date().toISOString() }).eq("id", id);
    await load();
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Term report approvals</h2>
      <p className="mt-1 text-xs text-ink/50">Approve, then release — release is what makes a report visible to the parent/student.</p>
      <ul className="mt-3 space-y-3">
        {reports === null && <p className="text-sm text-ink/60">Loading…</p>}
        {(reports || []).map((r) => (
          <li key={r.id} className="rounded-lg border border-gold-light/40 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span>
                {r.children?.name} — {r.terms?.name}
              </span>
              <span className="rounded-full bg-gold-light/40 px-2 py-0.5 text-xs text-gold-700">{r.status}</span>
            </div>
            {r.overall_comment && <p className="mt-1 text-ink/70">{r.overall_comment}</p>}
            <div className="mt-2 flex gap-2">
              {r.status === "pending_approval" && (
                <button type="button" onClick={() => approve(r.id)} className="rounded-full bg-gold-600 px-3 py-1 text-xs text-white">
                  Approve
                </button>
              )}
              {r.status === "approved" && (
                <button type="button" onClick={() => release(r.id)} className="rounded-full bg-gold-600 px-3 py-1 text-xs text-white">
                  Release to family
                </button>
              )}
            </div>
          </li>
        ))}
        {reports?.length === 0 && <p className="text-sm text-ink/60">Nothing awaiting approval.</p>}
      </ul>
    </div>
  );
}

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
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Assessment types</h2>
      <div className="mt-3 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spelling test" className="flex-1 rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
        <button type="button" onClick={add} className="rounded-full bg-gold-600 px-4 py-2 text-sm text-white">
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
    const { data } = await supabase.from("comment_bank").select("id, text, subject_id").order("created_at", { ascending: false }).limit(20);
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

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Comment bank</h2>
      <p className="mt-1 text-xs text-ink/50">Reusable snippets teachers can pick from when writing report comments.</p>
      <div className="mt-3 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Makes a positive contribution in class discussions." className="flex-1 rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
        <button type="button" onClick={add} className="rounded-full bg-gold-600 px-4 py-2 text-sm text-white">
          Add
        </button>
      </div>
      <ul className="mt-3 space-y-1">
        {comments.map((c) => (
          <li key={c.id} className="rounded-md border border-gold-light/40 px-3 py-1.5 text-sm text-ink/70">
            {c.text}
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
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Mark schemes &amp; grade boundaries</h2>
      <p className="mt-1 text-xs text-ink/50">Per-subject percentage bands — the single source of truth grades are resolved against, never hardcoded.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Subject" className="rounded-md border border-gold-light/60 px-3 py-2 text-sm">
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
          <input value={schemeName} onChange={(e) => setSchemeName(e.target.value)} placeholder="New scale name (e.g. A*-U)" className="rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
          <button type="button" onClick={addScheme} className="rounded-full border border-gold-500 px-3 py-2 text-xs text-gold-700">
            Add scale
          </button>
          <select value={selectedScheme} onChange={(e) => setSelectedScheme(e.target.value)} aria-label="Mark scheme scale" className="rounded-md border border-gold-light/60 px-3 py-2 text-sm">
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
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Grade label (e.g. B)" className="w-28 rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
            <input value={minPercent} onChange={(e) => setMinPercent(e.target.value)} type="number" placeholder="Min %" className="w-28 rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
            <button type="button" onClick={addBoundary} className="rounded-full bg-gold-600 px-4 py-2 text-xs text-white">
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

function ReportsAdminContent() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h1 className="font-serif text-h2 font-semibold text-ink">Reports</h1>
        <p className="mt-1 text-sm text-ink/60">Term report approval, comment bank, and assessment types.</p>
      </div>
      <TermReportApprovals />
      <CommentBankAdmin />
      <AssessmentTypesAdmin />
      <MarkSchemesAdmin />
    </div>
  );
}

export default function AdminReportsPage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminShell>
          <ReportsAdminContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
