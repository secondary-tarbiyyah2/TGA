"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { safeHttpUrl } from "@/lib/learn/markup";

/**
 * Something attached to a post or piece of classwork: either a web link
 * ({label, url}) or a file stored in the private class-files bucket
 * ({label, path, mime}). Files are never opened by their storage address:
 * the portal downloads them as the signed-in user and shows them in a viewer
 * on our own page (a blob), so no storage host is ever shown.
 */
export type Attachment = { label: string; url?: string; path?: string; mime?: string };

export function cleanAttachments(v: unknown): Attachment[] {
  if (!Array.isArray(v)) return [];
  const out: Attachment[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (typeof o.path === "string" && o.path) {
      out.push({ label: label || "File", path: o.path, mime: typeof o.mime === "string" ? o.mime : undefined });
    } else {
      const url = safeHttpUrl(typeof o.url === "string" ? o.url : null);
      if (url) out.push({ label: label || url, url });
    }
  }
  return out;
}

export const CLASS_FILES_BUCKET = "class-files";

/** Upload one file for a class; returns the attachment to store, or an error message. */
export async function uploadClassFile(classId: string, file: File): Promise<{ attachment: Attachment } | { error: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Not connected." };
  if (file.size > 25 * 1024 * 1024) return { error: `${file.name} is over 25 MB.` };
  const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "file";
  const path = `${classId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from(CLASS_FILES_BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) return { error: `Could not upload ${file.name}. Check the file type and try again.` };
  return { attachment: { label: file.name, path, mime: file.type || undefined } };
}

type Viewing = { name: string; blobUrl: string; mime: string };

function FileViewer({ viewing, onClose }: { viewing: Viewing; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const { mime, blobUrl, name } = viewing;
  return (
    <div role="dialog" aria-modal="true" aria-label={name} className="fixed inset-0 z-50 flex flex-col bg-ink/70 p-3 sm:p-6">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-gold-light px-4 py-2.5">
          <p className="min-w-0 truncate text-sm font-semibold text-ink">{name}</p>
          <div className="flex shrink-0 items-center gap-2">
            <a href={blobUrl} download={name} className="rounded-lg border border-gold-light px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream">
              Download
            </a>
            <button type="button" onClick={onClose} className="rounded-lg bg-gold-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-gold-900">
              Close
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-cream/40">
          {mime.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element -- a blob URL, not an optimisable asset
            <img src={blobUrl} alt={name} className="mx-auto max-h-full max-w-full object-contain" />
          ) : mime === "application/pdf" ? (
            <iframe src={blobUrl} title={name} className="h-full w-full border-0" />
          ) : mime.startsWith("audio/") ? (
            <div className="p-8">
              <audio src={blobUrl} controls className="w-full" />
            </div>
          ) : mime.startsWith("video/") ? (
            <video src={blobUrl} controls className="mx-auto max-h-full max-w-full" />
          ) : (
            <p className="p-8 text-sm text-ink/70">This kind of file can&apos;t be previewed here. Use Download to open it on your device.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** A row of chips: links open in a new tab, files open in the in-page viewer. */
export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (viewing) URL.revokeObjectURL(viewing.blobUrl);
    };
  }, [viewing]);

  if (attachments.length === 0) return null;

  const openFile = async (a: Attachment) => {
    const supabase = getSupabaseClient();
    if (!supabase || !a.path) return;
    setBusy(a.path);
    setError(null);
    const { data, error: err } = await supabase.storage.from(CLASS_FILES_BUCKET).download(a.path);
    setBusy(null);
    if (err || !data) {
      setError("Could not open that file.");
      return;
    }
    setViewing({ name: a.label, blobUrl: URL.createObjectURL(data), mime: data.type || a.mime || "application/octet-stream" });
  };

  const chip = "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-gold-light bg-white px-2.5 py-1.5 text-sm text-teal-800 hover:bg-cream";
  return (
    <div className="mt-3">
      <ul className="flex flex-wrap gap-2">
        {attachments.map((a, i) => (
          <li key={`${a.path || a.url}-${i}`} className="min-w-0">
            {a.path ? (
              <button type="button" onClick={() => openFile(a)} disabled={busy === a.path} className={chip}>
                
                <span className="truncate">{busy === a.path ? "Opening…" : a.label}</span>
              </button>
            ) : (
              <a href={a.url} target="_blank" rel="noopener noreferrer" className={chip}>
                
                <span className="truncate">{a.label}</span>
              </a>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
      {viewing && <FileViewer viewing={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
