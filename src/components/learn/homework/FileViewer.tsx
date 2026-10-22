"use client";

import { useCallback, useEffect, useState } from "react";
import { categoryOfMime, downloadFileBlob, formatBytes, type HomeworkBucket, type HomeworkFileRef } from "@/lib/learn/homeworkFiles";

export type ViewerFile = HomeworkFileRef & { bucket: HomeworkBucket };

type State = { status: "loading" } | { status: "error" } | { status: "ready"; url: string; size: number };

/**
 * In-app viewer for a private homework file. The file is fetched with the
 * signed-in user's own access, wrapped in a same-origin blob: URL and shown
 * here, so no Supabase address is ever shown or opened in a new tab. PDFs and
 * images preview; audio and video play; anything else can be saved to the device.
 */
export function FileViewer({ file, onClose }: { file: ViewerFile; onClose: () => void }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset while a new file loads
    setState({ status: "loading" });
    downloadFileBlob(file.bucket, file.path, file.mime).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setState({ status: "error" });
        return;
      }
      made = URL.createObjectURL(blob);
      setState({ status: "ready", url: made, size: blob.size });
    });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [file.bucket, file.path, file.mime]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const kind = categoryOfMime(file.mime);

  const download = useCallback(() => {
    if (state.status !== "ready") return;
    const a = document.createElement("a");
    a.href = state.url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [state, file.name]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/70 p-2 sm:p-6" role="dialog" aria-modal="true" aria-label={`Viewing ${file.name}`}>
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-gold-light/40 px-4 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{file.name}</p>
            {state.status === "ready" && <p className="text-xs text-ink/65">{formatBytes(state.size)}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={download}
              disabled={state.status !== "ready"}
              className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-medium text-ink/80 hover:bg-cream disabled:opacity-50"
            >
              Save a copy
            </button>
            <button type="button" onClick={onClose} className="rounded-lg bg-gold-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-gold-900">
              Close
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-cream p-2">
          {state.status === "loading" && <p role="status" className="text-sm text-ink/65">Loading…</p>}
          {state.status === "error" && (
            <p role="alert" className="max-w-sm text-center text-sm text-red-700">
              This file couldn&apos;t be opened. It may have been removed, or you may not have access to it.
            </p>
          )}
          {state.status === "ready" && kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element -- local blob: URL
            <img src={state.url} alt={file.name} className="max-h-full max-w-full object-contain" />
          )}
          {state.status === "ready" && kind === "pdf" && (
            <object data={state.url} type="application/pdf" aria-label={file.name} className="h-full min-h-[60vh] w-full rounded bg-white">
              <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-ink/70">
                <p>This browser can&apos;t show PDFs inline.</p>
                <button type="button" onClick={download} className="font-semibold text-gold-700 underline">
                  Save a copy to open it
                </button>
              </div>
            </object>
          )}
          {state.status === "ready" && kind === "audio" && (
            <audio controls src={state.url} className="w-full max-w-md">
              <track kind="captions" />
            </audio>
          )}
          {state.status === "ready" && kind === "video" && (
            <video controls playsInline src={state.url} className="max-h-full max-w-full rounded bg-black">
              <track kind="captions" />
            </video>
          )}
          {state.status === "ready" && kind === "other" && (
            <div className="max-w-sm space-y-3 text-center text-sm text-ink/70">
              <p>There is no preview for this type of file (for example Word or Pages documents).</p>
              <button type="button" onClick={download} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-medium text-white hover:bg-gold-900">
                Save a copy
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A list of files, each opening in the in-app viewer. */
export function FileLinks({
  files,
  bucket,
  extra,
}: {
  files: HomeworkFileRef[];
  bucket: HomeworkBucket;
  /** Optional extra action beside each file (e.g. "Annotate"). */
  extra?: (file: HomeworkFileRef) => React.ReactNode;
}) {
  const [open, setOpen] = useState<ViewerFile | null>(null);
  if (files.length === 0) return null;
  return (
    <>
      <ul className="space-y-1">
        {files.map((f) => (
          <li key={f.path} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <button type="button" onClick={() => setOpen({ ...f, bucket })} className="min-w-0 truncate text-left font-semibold text-gold-700 underline">
              {f.name}
            </button>
            {f.size > 0 && <span className="text-xs text-ink/65">{formatBytes(f.size)}</span>}
            {extra?.(f)}
          </li>
        ))}
      </ul>
      {open && <FileViewer file={open} onClose={() => setOpen(null)} />}
    </>
  );
}
