"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Switch } from "@/components/learn/homework/Switch";
import {
  ALL_FILE_CATEGORIES,
  ALL_SUBMISSION_TYPES,
  FILE_CATEGORY_LABEL,
  MAX_FILE_BYTES,
  SUBMISSION_TYPE_LABEL,
  formatBytes,
  mimeForName,
  removeObjects,
  safeObjectName,
  uploadWithProgress,
  validateFile,
  type FileCategory,
  type HomeworkFileRef,
  type SubmissionType,
} from "@/lib/learn/homeworkFiles";
import { attachmentsOf, fileTypesOf, submissionTypesOf, toLocalInput, type Homework } from "@/lib/learn/homework";
import { ui } from "@/components/learn/ui";
import { PupilPicker } from "@/components/learn/class/PupilPicker";

export type ClassOption = { id: string; name: string };
export type HomeworkKind = "assignment" | "quiz";

/** Classwork extras (migration 0125). Read on their own, so the editor still
 * works, as before, on a database that doesn't have them yet. */
type Extras = { assigned_child_ids: string[] | null; kind: HomeworkKind; topic_id: string | null };

const inputCls = ui.input;
const MAX_ATTACHMENTS = 10;

function friendlyError(message: string): string {
  if (/class_locked_has_submissions/.test(message)) return "Pupils have already handed work in, so this homework can't be moved to another class.";
  if (/not_your_class/.test(message)) return "You can only move homework to a class you teach.";
  if (/row-level security|violates row-level/.test(message)) return "You don't have permission to do that for this class.";
  if (/assigned_child_ids|homework_kind_check|'kind' column/.test(message)) return "Setting work for chosen pupils (or as a quiz) isn't switched on yet. Set it for the whole class, or ask the office to run the latest update.";
  if (/homework_assigned_not_empty/.test(message)) return "Choose at least one pupil, or set it for the whole class.";
  return message;
}

/**
 * Create or edit a homework assignment: title, instructions, due date/time, mark
 * out of, which kinds of work students may hand in, late policy, attachments,
 * class, who it is for (the whole class or chosen pupils) and, in a class's
 * Classwork, its topic. Used by the class Classwork tab and the teacher and
 * admin homework overviews.
 */
export function HomeworkEditor({
  classes,
  initialClassId,
  editing,
  onSaved,
  onCancel,
  lockClass = false,
  topics,
  initialTopicId = "",
  kind: newKind = "assignment",
}: {
  classes: ClassOption[];
  initialClassId?: string;
  editing: Homework | null;
  /** note: something to tell the user after saving (e.g. an attachment that did not upload). */
  onSaved: (note?: string) => void;
  onCancel?: () => void;
  /** Inside a class: no class picker. */
  lockClass?: boolean;
  /** Inside a class: the class's Classwork topics, so the work can be filed under one. */
  topics?: { id: string; name: string }[];
  initialTopicId?: string;
  /** For new work: a quiz is an assignment with marks, shown as "Quiz". */
  kind?: HomeworkKind;
}) {
  const supabase = getSupabaseClient();
  const [chosenClass, setClassId] = useState(editing?.class_id || initialClassId || "");
  const [assigned, setAssigned] = useState<string[] | null>(null);
  const [topicId, setTopicId] = useState(initialTopicId);
  const [saved, setSaved] = useState<Extras | null>(null);
  const kind: HomeworkKind = editing ? saved?.kind || "assignment" : newKind;

  // When editing, read who it is for, its kind and topic (columns from 0125/0079).
  useEffect(() => {
    if (!supabase || !editing) return;
    let alive = true;
    supabase
      .from("homework")
      .select("assigned_child_ids, kind, topic_id")
      .eq("id", editing.id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!alive || err || !data) return;
        const x = data as unknown as Extras;
        setSaved(x);
        setAssigned(x.assigned_child_ids && x.assigned_child_ids.length ? x.assigned_child_ids : null);
        setTopicId(x.topic_id || "");
      });
    return () => {
      alive = false;
    };
  }, [supabase, editing]);
  // Falls back to the first class once the list has loaded.
  const classId = chosenClass || classes[0]?.id || "";
  const [title, setTitle] = useState(editing?.title || "");
  const [instructions, setInstructions] = useState(editing?.instructions || "");
  const [dueAt, setDueAt] = useState(editing ? toLocalInput(editing.due_at) : "");
  const [maxPoints, setMaxPoints] = useState(editing?.max_points != null ? String(editing.max_points) : "");
  const [types, setTypes] = useState<SubmissionType[]>(editing ? submissionTypesOf(editing) : ALL_SUBMISSION_TYPES);
  const [cats, setCats] = useState<FileCategory[]>(editing ? fileTypesOf(editing) : ALL_FILE_CATEGORIES);
  const [blockLate, setBlockLate] = useState(editing?.late_policy === "block");
  const [kept, setKept] = useState<HomeworkFileRef[]>(editing ? attachmentsOf(editing) : []);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const toggleType = (t: SubmissionType, on: boolean) => {
    setTypes((cur) => {
      const next = on ? [...cur.filter((x) => x !== t), t] : cur.filter((x) => x !== t);
      return ALL_SUBMISSION_TYPES.filter((x) => next.includes(x));
    });
  };
  const toggleCat = (c: FileCategory, on: boolean) => {
    setCats((cur) => {
      const next = on ? [...cur.filter((x) => x !== c), c] : cur.filter((x) => x !== c);
      return ALL_FILE_CATEGORIES.filter((x) => next.includes(x));
    });
  };

  const pointsNumber = maxPoints.trim() === "" ? null : Number(maxPoints);
  const pointsInvalid = pointsNumber !== null && (!Number.isFinite(pointsNumber) || pointsNumber < 0 || pointsNumber > 100000);
  const filesOn = types.includes("file");
  const audienceEmpty = assigned !== null && assigned.length === 0;
  const pointsMissing = kind === "quiz" && pointsNumber === null;
  const canSave = !!classId && title.trim() !== "" && dueAt !== "" && !pointsInvalid && !pointsMissing && !audienceEmpty && (!filesOn || cats.length > 0) && !busy;

  /** Only the classwork columns that differ from the default, so saving whole-class
   * work never touches columns an older database doesn't have. */
  const extras = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    if (assigned !== null) out.assigned_child_ids = assigned;
    else if (saved?.assigned_child_ids) out.assigned_child_ids = null;
    if (!editing && kind === "quiz") out.kind = "quiz";
    if (topics && (topicId || null) !== (saved?.topic_id ?? null)) out.topic_id = topicId || null;
    return out;
  };

  const addAttachments = (list: FileList | null) => {
    if (!list) return;
    const problems: string[] = [];
    const next = [...newFiles];
    for (const f of Array.from(list)) {
      if (kept.length + next.length >= MAX_ATTACHMENTS) {
        problems.push(`At most ${MAX_ATTACHMENTS} attachments.`);
        break;
      }
      const bad = validateFile(f, ALL_FILE_CATEGORIES);
      if (bad) problems.push(bad);
      else next.push(f);
    }
    setNewFiles(next);
    setError(problems.length ? problems.join(" ") : null);
    if (picker.current) picker.current.value = "";
  };

  const uploadAttachments = async (homeworkId: string): Promise<{ done: HomeworkFileRef[]; failed: string[] }> => {
    const done: HomeworkFileRef[] = [];
    const failed: string[] = [];
    for (let i = 0; i < newFiles.length; i++) {
      const f = newFiles[i];
      const key = `${f.name}-${i}`;
      const mime = mimeForName(f.name, f.type);
      const path = `${homeworkId}/${Date.now()}-${i}-${safeObjectName(f.name)}`;
      const res = await uploadWithProgress("homework-attachments", path, f, mime, f.name, (p) => setProgress((cur) => ({ ...cur, [key]: p })));
      if (res.ok) done.push({ path, name: f.name, mime, size: f.size });
      else failed.push(`${f.name} (${res.error})`);
    }
    return { done, failed };
  };

  const save = async () => {
    if (!supabase || !canSave) return;
    setBusy(true);
    setError(null);
    try {
      const fields = {
        title: title.trim(),
        instructions: instructions.trim() || null,
        due_at: new Date(dueAt).toISOString(),
        max_points: pointsNumber,
        allowed_submission_types: types,
        allowed_file_types: cats,
        late_policy: blockLate ? "block" : "allow",
      };

      if (editing) {
        const { done, failed } = await uploadAttachments(editing.id);
        const attachments = [...kept, ...done];
        const removed = attachmentsOf(editing).filter((a) => !kept.some((k) => k.path === a.path));
        const patch = { ...fields, ...extras(), attachments, ...(classId !== editing.class_id ? { class_id: classId } : {}) };
        const { error: err } = await supabase.from("homework").update(patch).eq("id", editing.id);
        if (err) {
          // The new files are orphans now; clean them up.
          await removeObjects("homework-attachments", done.map((d) => d.path));
          setError(friendlyError(err.message));
          return;
        }
        if (removed.length > 0) await removeObjects("homework-attachments", removed.map((r) => r.path));
        onSaved(failed.length > 0 ? `Saved, but these attachments didn't upload: ${failed.join("; ")}. Edit the homework to try again.` : undefined);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const id = crypto.randomUUID();
      const { error: insErr } = await supabase.from("homework").insert({ id, class_id: classId, teacher_id: user.id, ...fields, ...extras() });
      if (insErr) {
        setError(friendlyError(insErr.message));
        return;
      }
      let note: string | undefined;
      if (newFiles.length > 0) {
        const { done, failed } = await uploadAttachments(id);
        if (done.length > 0) {
          const { error: upErr } = await supabase.from("homework").update({ attachments: done }).eq("id", id);
          if (upErr) failed.push(`attachment list (${friendlyError(upErr.message)})`);
        }
        if (failed.length > 0) {
          note = `Homework set, but these attachments didn't upload: ${failed.join("; ")}. Edit the homework to add them again.`;
        }
      }
      setTitle("");
      setInstructions("");
      setDueAt("");
      setMaxPoints("");
      setNewFiles([]);
      setProgress({});
      setAssigned(null);
      onSaved(note);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {lockClass ? (
          topics ? (
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-ink/70">Topic</span>
              <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className={inputCls}>
                <option value="">No topic</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div />
          )
        ) : (
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-ink/70">Class</span>
            <select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setAssigned(null); // chosen pupils belong to the old class
              }}
              className={inputCls}
            >
              {classes.length === 0 && <option value="">No classes</option>}
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-ink/70">Due</span>
          <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={inputCls} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-ink/70">Title</span>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-ink/70">Instructions</span>
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4} placeholder="Objectives, instructions, resource links" className={inputCls} />
      </label>
      {classId && (
        <div className="rounded-lg border border-gold-light/40 p-3">
          <PupilPicker classId={classId} value={assigned} onChange={setAssigned} />
          {audienceEmpty && <p className="mt-2 text-xs text-red-700">Choose at least one pupil, or set it for all pupils.</p>}
        </div>
      )}
      <label className="block text-sm sm:w-48">
        <span className="mb-1 block text-xs font-medium text-ink/70">{kind === "quiz" ? "Marks available" : "Marks available (optional)"}</span>
        <input type="text" inputMode="decimal" min={0} step="any" value={maxPoints} onChange={(e) => setMaxPoints(e.target.value)} placeholder="e.g. 10" className={inputCls} />
      </label>

      <div className="space-y-3 rounded-lg border border-gold-light/40 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink/65">What pupils can hand in</p>
        {ALL_SUBMISSION_TYPES.map((t) => (
          <Switch
            key={t}
            label={SUBMISSION_TYPE_LABEL[t]}
            checked={types.includes(t)}
            disabled={types.includes(t) && types.length === 1}
            onChange={(on) => toggleType(t, on)}
          />
        ))}
        {filesOn && (
          <div className="space-y-3 border-t border-gold-light/30 pt-3">
            <p className="text-xs text-ink/65">Allowed kinds of file (up to {formatBytes(MAX_FILE_BYTES)} each)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {ALL_FILE_CATEGORIES.map((c) => (
                <Switch key={c} label={FILE_CATEGORY_LABEL[c]} checked={cats.includes(c)} onChange={(on) => toggleCat(c, on)} />
              ))}
            </div>
            {cats.length === 0 && <p className="text-xs text-red-700">Choose at least one kind of file, or turn file upload off.</p>}
          </div>
        )}
        <div className="border-t border-gold-light/30 pt-3">
          <Switch label="Close to late work" description="After the due time pupils can no longer hand in, unless you ask for a resubmission." checked={blockLate} onChange={setBlockLate} />
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-gold-light/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/65">Attachments for pupils</p>
          <button type="button" disabled={busy} onClick={() => picker.current?.click()} className="rounded-lg border border-gold-light bg-white px-3 py-1 text-xs font-medium text-ink/80 hover:bg-cream disabled:opacity-50">
            Add files
          </button>
          <input ref={picker} type="file" multiple onChange={(e) => addAttachments(e.target.files)} className="hidden" aria-label="Add attachments" />
        </div>
        {kept.length === 0 && newFiles.length === 0 ? (
          <p className="text-xs text-ink/65">None.</p>
        ) : (
          <ul className="space-y-1">
            {kept.map((f) => (
              <li key={f.path} className="flex items-center justify-between gap-2 rounded-md bg-cream px-3 py-1.5 text-sm">
                <span className="min-w-0 truncate">{f.name}</span>
                <button type="button" disabled={busy} onClick={() => setKept((k) => k.filter((x) => x.path !== f.path))} className="shrink-0 text-xs text-red-700 underline disabled:opacity-50">
                  Remove
                </button>
              </li>
            ))}
            {newFiles.map((f, i) => {
              const p = progress[`${f.name}-${i}`] ?? 0;
              return (
                <li key={`${f.name}-${i}`} className="rounded-md bg-cream px-3 py-1.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {f.name} <span className="text-xs text-ink/65">{formatBytes(f.size)}</span>
                    </span>
                    <button type="button" disabled={busy} onClick={() => setNewFiles((cur) => cur.filter((_, j) => j !== i))} className="shrink-0 text-xs text-red-700 underline disabled:opacity-50">
                      Remove
                    </button>
                  </div>
                  {busy && (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} aria-label={`Uploading ${f.name}`}>
                      <div className="h-full bg-teal-600 transition-all" style={{ width: `${Math.round(p * 100)}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pointsMissing && <p className="text-xs text-ink/70">A quiz needs the marks it is out of.</p>}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!canSave} onClick={save} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-900 disabled:opacity-50">
          {busy ? "Saving…" : editing ? "Save changes" : kind === "quiz" ? "Set quiz" : lockClass ? "Assign" : "Set homework"}
        </button>
        {onCancel && (
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/80 hover:bg-cream disabled:opacity-50">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
