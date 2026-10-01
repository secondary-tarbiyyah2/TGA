"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getHomeworkFileUrl } from "@/lib/learn/homeworkFile";

export type Homework = { id: string; class_id: string; title: string; instructions: string | null; due_at: string; classes?: { name: string } | null };
type StatusRow = { child_id: string; status: string; submission_id: string | null };
type Child = { id: string; name: string };
type Mark = { id: string; submission_id: string; grade: string | null; feedback: string | null; released: boolean };
type Submission = { kind: string; response_text: string | null; file_path: string | null };

export function MarkRow({ submissionId, childName, existing, onSaved }: { submissionId: string; childName: string; existing: Mark | null; onSaved: () => void }) {
  const supabase = getSupabaseClient();
  const [grade, setGrade] = useState(existing?.grade || "");
  const [feedback, setFeedback] = useState(existing?.feedback || "");
  const [busy, setBusy] = useState(false);
  // Previously this row let a teacher grade+release feedback without ever
  // seeing what the student submitted — no response text, no way to open
  // an uploaded file. Fetched here rather than passed down from the parent
  // list load, since the parent only ever queried homework_status/marks,
  // not the submission content itself.
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [openingFile, setOpeningFile] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("homework_submissions")
      .select("kind, response_text, file_path")
      .eq("id", submissionId)
      .maybeSingle()
      .then(({ data }) => setSubmission((data as Submission) || null));
  }, [supabase, submissionId]);

  const openFile = async () => {
    if (!submission?.file_path) return;
    setOpeningFile(true);
    const url = await getHomeworkFileUrl(submission.file_path);
    setOpeningFile(false);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const save = async (release: boolean) => {
    if (!supabase) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const payload = {
        submission_id: submissionId,
        grade: grade || null,
        feedback: feedback || null,
        marked_by: user.id,
        marked_at: new Date().toISOString(),
        ...(release ? { released: true, released_by: user.id, released_at: new Date().toISOString() } : {}),
      };
      if (existing) {
        await supabase.from("homework_marks").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("homework_marks").insert(payload);
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-gold-light/40 p-3">
      <p className="text-sm font-medium text-ink">{childName}</p>
      {submission?.kind === "text" && <p className="mt-1 rounded-md bg-cream p-2 text-sm text-ink/80">{submission.response_text}</p>}
      {submission?.kind === "file" && (
        <button type="button" onClick={openFile} disabled={openingFile} className="mt-1 text-sm font-semibold text-gold-700 underline disabled:opacity-50">
          {openingFile ? "Opening…" : "Open submitted file"}
        </button>
      )}
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          placeholder="Grade"
          className="w-full rounded-md border border-gold-light/60 px-3 py-1.5 text-sm sm:w-32"
        />
        <input
          type="text"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Feedback"
          className="w-full rounded-md border border-gold-light/60 px-3 py-1.5 text-sm"
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" disabled={busy} onClick={() => save(false)} className="rounded-lg border border-gold-light px-3 py-1.5 text-xs bg-white text-ink/80 hover:bg-cream font-medium transition-colors">
          Save draft
        </button>
        <button type="button" disabled={busy} onClick={() => save(true)} className="rounded-lg bg-gold-700 px-3 py-1.5 text-xs text-white hover:bg-gold-900 font-medium transition-colors">
          Save &amp; release to family
        </button>
        {existing?.released && <span className="text-xs text-green-700">Released</span>}
      </div>
    </div>
  );
}

export function HomeworkCard({ hw, actions }: { hw: Homework; actions?: React.ReactNode }) {
  const supabase = getSupabaseClient();
  const [statuses, setStatuses] = useState<StatusRow[] | null>(null);
  const [children, setChildren] = useState<Record<string, string>>({});
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!supabase) return;
    const { data: statusRows } = await supabase.from("homework_status").select("child_id, status, submission_id").eq("homework_id", hw.id);
    setStatuses((statusRows as StatusRow[]) || []);
    const childIds = (statusRows || []).map((r) => r.child_id as string);
    if (childIds.length > 0) {
      const { data: kids } = await supabase.from("children").select("id, name").in("id", childIds);
      setChildren(Object.fromEntries(((kids as Child[]) || []).map((c) => [c.id, c.name])));
    }
    const submissionIds = (statusRows || []).map((r) => r.submission_id).filter(Boolean) as string[];
    if (submissionIds.length > 0) {
      const { data: markRows } = await supabase.from("homework_marks").select("id, submission_id, grade, feedback, released").in("submission_id", submissionIds);
      setMarks(Object.fromEntries(((markRows as Mark[]) || []).map((m) => [m.submission_id, m])));
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supabase]);

  const missing = (statuses || []).filter((s) => s.status === "missing").length;
  const late = (statuses || []).filter((s) => s.status === "late").length;

  return (
    <div className="rounded-lg border border-gold-light/40 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">{hw.title}</p>
          <p className="text-xs text-ink/60">
            {hw.classes?.name} · Due {new Date(hw.due_at).toLocaleString("en-GB")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {actions}
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-sm text-gold-700 underline">
            {open ? "Hide" : "Submissions"}
          </button>
        </div>
      </div>
      {(missing > 0 || late > 0) && (
        <p className="mt-1 text-xs text-ink/60">
          {missing > 0 && <span className="text-red-700">{missing} missing</span>}
          {missing > 0 && late > 0 && " · "}
          {late > 0 && <span className="text-amber-700">{late} late</span>}
        </p>
      )}
      {open && (
        <div className="mt-3 space-y-2 border-t border-gold-light/30 pt-3">
          {statuses === null ? (
            <p className="text-sm text-ink/60">Loading…</p>
          ) : statuses.length === 0 ? (
            <p className="text-sm text-ink/60">No enrolled students.</p>
          ) : (
            statuses.map((s) =>
              s.submission_id ? (
                <MarkRow
                  key={s.child_id}
                  submissionId={s.submission_id}
                  childName={children[s.child_id] || s.child_id}
                  existing={marks[s.submission_id] || null}
                  onSaved={load}
                />
              ) : (
                <div key={s.child_id} className="rounded-lg border border-gold-light/40 p-3 text-sm text-ink/60">
                  {children[s.child_id] || s.child_id} — not submitted{s.status === "missing" ? " (missing)" : ""}
                </div>
              )
            )
          )}
        </div>
      )}
    </div>
  );
}

