"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMyClasses } from "@/lib/learn/useMyClasses";

type Child = { id: string; name: string };
type Term = { id: string; name: string };
type Comment = { id: string; text: string };
type Report = { id: string; status: string; overall_comment: string | null };

function TeachReportsContent() {
  const supabase = getSupabaseClient();
  const [classId, setClassId] = useState("");
  const classes = useMyClasses(setClassId) || [];
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState("");
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [overall, setOverall] = useState("");
  const [existing, setExisting] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: termRows } = await supabase.from("terms").select("id, name").order("starts_on", { ascending: false }).limit(6);
      setTerms((termRows as Term[]) || []);
      const { data: commentRows } = await supabase.from("comment_bank").select("id, text").limit(30);
      setComments((commentRows as Comment[]) || []);
    })();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !classId) return;
    supabase
      .from("enrolments")
      .select("child_id, children(id, name)")
      .eq("class_id", classId)
      .then(({ data }) => setChildren((((data as unknown as { children: Child | null }[]) || []).map((r) => r.children).filter(Boolean)) as Child[]));
  }, [supabase, classId]);

  useEffect(() => {
    if (!supabase || !childId || !termId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting derived state when selection clears, not a render-cycle sync
      setExisting(null);
      return;
    }
    supabase
      .from("term_reports")
      .select("id, status, overall_comment")
      .eq("child_id", childId)
      .eq("term_id", termId)
      .maybeSingle()
      .then(({ data }) => {
        setExisting((data as Report) || null);
        setOverall((data as Report)?.overall_comment || "");
      });
  }, [supabase, childId, termId]);

  const saveDraft = async (submit: boolean) => {
    if (!supabase || !childId || !termId) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const payload = { overall_comment: overall.trim() || null, status: submit ? "pending_approval" : "draft", written_by: user.id };
      if (existing) {
        await supabase.from("term_reports").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("term_reports").insert({ child_id: childId, term_id: termId, ...payload });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-h2 font-semibold text-ink">Term reports</h1>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class" className="rounded-md border border-gold-light/60 px-3 py-2 text-sm">
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={childId} onChange={(e) => setChildId(e.target.value)} aria-label="Student" className="rounded-md border border-gold-light/60 px-3 py-2 text-sm">
            <option value="">Select a student…</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={termId} onChange={(e) => setTermId(e.target.value)} aria-label="Term" className="rounded-md border border-gold-light/60 px-3 py-2 text-sm">
            <option value="">Select a term…</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {childId && termId && (
        <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-h3 font-semibold text-ink">Overall comment</h2>
            {existing && <span className="rounded-full bg-gold-light/40 px-2 py-0.5 text-xs text-gold-700">{existing.status}</span>}
          </div>
          <textarea value={overall} onChange={(e) => setOverall(e.target.value)} rows={5} className="mt-3 w-full rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
          {comments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {comments.slice(0, 8).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setOverall((o) => (o ? `${o} ${c.text}` : c.text))}
                  className="rounded-full border border-gold-light/40 px-2 py-1 text-xs text-ink/60 hover:bg-cream"
                >
                  + {c.text.slice(0, 30)}
                  {c.text.length > 30 ? "…" : ""}
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy || (!!existing && existing.status !== "draft")} onClick={() => saveDraft(false)} className="rounded-full border border-gold-500 px-4 py-2 text-sm text-gold-700 disabled:opacity-50">
              Save draft
            </button>
            <button type="button" disabled={busy || (!!existing && existing.status !== "draft")} onClick={() => saveDraft(true)} className="rounded-full bg-gold-600 px-4 py-2 text-sm text-white disabled:opacity-50">
              Submit for approval
            </button>
          </div>
          <p className="mt-2 text-xs text-ink/50">Once submitted, only Head Teacher/Admin can approve and release it to the family.</p>
        </div>
      )}
    </div>
  );
}

export default function TeachReportsPage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <TeachReportsContent />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
