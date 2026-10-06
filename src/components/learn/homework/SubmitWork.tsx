"use client";

import { useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  FILE_CATEGORY_LABEL,
  MAX_FILES,
  MAX_FILE_BYTES,
  acceptFor,
  formatBytes,
  mimeForName,
  safeObjectName,
  uploadWithProgress,
  validateFile,
  type HomeworkFileRef,
} from "@/lib/learn/homeworkFiles";
import { fileTypesOf, submissionTypesOf, type Homework } from "@/lib/learn/homework";

export type ExistingSubmission = {
  id: string;
  response_text: string | null;
  link_url: string | null;
  files: HomeworkFileRef[];
};

type Picked = { key: string; file: File; progress: number; error: string | null };

function friendlyError(message: string): string {
  if (/text_not_allowed/.test(message)) return "This homework doesn't accept a typed answer.";
  if (/link_not_allowed/.test(message)) return "This homework doesn't accept a link.";
  if (/file_not_allowed/.test(message)) return "This homework doesn't accept files.";
  if (/file_type_not_allowed/.test(message)) return "One of the files is a type this homework doesn't accept.";
  if (/row-level security|violates row-level/.test(message)) return "This homework is closed for new work, or you don't have permission to hand it in.";
  if (/duplicate key|unique/.test(message)) return "Work has already been handed in for this homework. Reload the page.";
  return message;
}

/**
 * Hand in (or replace) work: typed text, a link and any number of files, as far as
 * the assignment allows. Used for a first submission and for a resubmission. Shows
 * a progress bar per file; on a phone the camera can be opened directly.
 */
export function SubmitWork({
  homework,
  childId,
  existing,
  actionLabel,
  onDone,
}: {
  homework: Pick<Homework, "id" | "allowed_submission_types" | "allowed_file_types">;
  childId: string;
  /** Present when replacing earlier work; its text, link and files pre-fill the form. */
  existing?: ExistingSubmission | null;
  actionLabel: string;
  onDone: () => void;
}) {
  const supabase = getSupabaseClient();
  const types = submissionTypesOf(homework);
  const cats = fileTypesOf(homework);
  const allowText = types.includes("text");
  const allowLink = types.includes("link");
  const allowFile = types.includes("file") && cats.length > 0;
  const canCamera = allowFile && cats.includes("image");

  const [text, setText] = useState(existing?.response_text || "");
  const [link, setLink] = useState(existing?.link_url || "");
  const [kept, setKept] = useState<HomeworkFileRef[]>(existing?.files || []);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const problems: string[] = [];
    const next = [...picked];
    for (const file of Array.from(list)) {
      if (kept.length + next.length >= MAX_FILES) {
        problems.push(`You can hand in at most ${MAX_FILES} files.`);
        break;
      }
      const bad = validateFile(file, cats);
      if (bad) {
        problems.push(bad);
        continue;
      }
      next.push({ key: `${file.name}-${file.size}-${file.lastModified}-${next.length}`, file, progress: 0, error: null });
    }
    setPicked(next);
    setError(problems.length ? problems.join(" ") : null);
    if (fileInput.current) fileInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
  };

  const hasContent = text.trim() !== "" || link.trim() !== "" || kept.length > 0 || picked.length > 0;

  const submit = async () => {
    if (!supabase) return;
    setError(null);
    const trimmedLink = link.trim();
    if (trimmedLink && !/^https?:\/\/\S+$/i.test(trimmedLink)) {
      setError("The link must start with http:// or https://");
      return;
    }
    if (!hasContent) {
      setError("Add an answer, a link or a file first.");
      return;
    }
    setBusy(true);
    try {
      // Upload the new files one at a time so each bar is meaningful.
      const uploaded: HomeworkFileRef[] = [];
      for (let i = 0; i < picked.length; i++) {
        const p = picked[i];
        const mime = mimeForName(p.file.name, p.file.type);
        const path = `${homework.id}/${childId}/${Date.now()}-${i}-${safeObjectName(p.file.name)}`;
        const res = await uploadWithProgress("homework-submissions", path, p.file, mime, p.file.name, (f) =>
          setPicked((cur) => cur.map((c) => (c.key === p.key ? { ...c, progress: f, error: null } : c)))
        );
        if (!res.ok) {
          setPicked((cur) => cur.map((c) => (c.key === p.key ? { ...c, error: res.error } : c)));
          setError(`"${p.file.name}" didn't upload: ${res.error} Nothing has been handed in yet — try again.`);
          return;
        }
        uploaded.push({ path, name: p.file.name, mime, size: p.file.size });
      }
      const files = [...kept, ...uploaded];
      const parts = [text.trim() ? "text" : null, trimmedLink ? "link" : null, files.length > 0 ? "file" : null].filter(Boolean) as string[];
      const kind = parts.length > 1 ? "mixed" : parts[0];
      const payload = {
        kind,
        response_text: text.trim() || null,
        link_url: trimmedLink || null,
        files,
        file_path: files[0]?.path ?? null,
      };
      const res = existing
        ? await supabase.from("homework_submissions").update(payload).eq("id", existing.id)
        : await supabase.from("homework_submissions").insert({
            ...payload,
            homework_id: homework.id,
            child_id: childId,
            submitted_at: new Date().toISOString(),
          });
      if (res.error) {
        setError(friendlyError(res.error.message));
        return;
      }
      setPicked([]);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {allowText && (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your answer…"
          rows={4}
          className="w-full rounded-md border border-gold-light/60 bg-white px-3 py-2 text-sm"
        />
      )}
      {allowLink && (
        <input
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Link to your work (https://…)"
          aria-label="Link to your work"
          className="w-full rounded-md border border-gold-light/60 bg-white px-3 py-2 text-sm"
        />
      )}
      {allowFile && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream disabled:opacity-50"
            >
              Choose files
            </button>
            {canCamera && (
              <button
                type="button"
                disabled={busy}
                onClick={() => cameraInput.current?.click()}
                className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream disabled:opacity-50"
              >
                Take a photo
              </button>
            )}
            <span className="text-xs text-ink/50">
              {cats.map((c) => FILE_CATEGORY_LABEL[c]).join(", ")} · up to {formatBytes(MAX_FILE_BYTES)} each
            </span>
          </div>
          <input ref={fileInput} type="file" multiple accept={acceptFor(cats)} onChange={(e) => addFiles(e.target.files)} className="hidden" aria-label="Choose files" />
          {/* capture opens the rear camera on phones; desktop browsers just show a normal picker */}
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={(e) => addFiles(e.target.files)} className="hidden" aria-label="Take a photo" />
          {(kept.length > 0 || picked.length > 0) && (
            <ul className="space-y-1.5">
              {kept.map((f) => (
                <li key={f.path} className="flex items-center justify-between gap-2 rounded-md bg-cream px-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate">{f.name}</span>
                  <button type="button" disabled={busy} onClick={() => setKept((k) => k.filter((x) => x.path !== f.path))} className="shrink-0 text-xs text-red-700 underline disabled:opacity-50">
                    Remove
                  </button>
                </li>
              ))}
              {picked.map((p) => (
                <li key={p.key} className="rounded-md bg-cream px-3 py-1.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {p.file.name} <span className="text-xs text-ink/50">{formatBytes(p.file.size)}</span>
                    </span>
                    <button type="button" disabled={busy} onClick={() => setPicked((cur) => cur.filter((x) => x.key !== p.key))} className="shrink-0 text-xs text-red-700 underline disabled:opacity-50">
                      Remove
                    </button>
                  </div>
                  {(busy || p.progress > 0) && (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.progress * 100)} aria-label={`Uploading ${p.file.name}`}>
                      <div className="h-full bg-teal-600 transition-all" style={{ width: `${Math.round(p.progress * 100)}%` }} />
                    </div>
                  )}
                  {p.error && <p className="mt-1 text-xs text-red-700">{p.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy || !hasContent}
        onClick={submit}
        className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-900 disabled:opacity-50"
      >
        {busy ? "Sending…" : actionLabel}
      </button>
    </div>
  );
}
