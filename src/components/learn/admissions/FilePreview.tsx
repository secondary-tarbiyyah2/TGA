"use client";

import { useEffect, useState } from "react";

const MIME_BY_EXT: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

export function mimeFromName(name: string, fallback = "application/pdf"): string {
  const ext = (name.split(".").pop() || "").toLowerCase();
  return MIME_BY_EXT[ext] || fallback;
}

/**
 * Inline preview of a private file. Browsers refuse to frame a cross-origin
 * Supabase signed URL under the portal's CSP, so the file is fetched (connect-src
 * allows Supabase), wrapped in a same-origin blob: URL and shown from that.
 * The object URL is revoked when the preview closes or the file changes.
 */
export function FilePreview({ url, type, name, heightClass = "h-[28rem]" }: { url: string; type: string; name: string; heightClass?: string }) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; blobUrl?: string }>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset while a new file loads
    setState({ status: "loading" });
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((b) => {
        if (cancelled) return;
        // Signed URLs may come back as octet-stream; force the type so the viewer knows what to render.
        made = URL.createObjectURL(new Blob([b], { type }));
        setState({ status: "ready", blobUrl: made });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [url, type]);

  const box = `${heightClass} w-full rounded-lg border border-gold-light/60 bg-white`;
  if (state.status === "loading") return <p role="status" className={`${box} flex items-center justify-center text-sm text-ink/65`}>Loading preview…</p>;
  if (state.status === "error" || !state.blobUrl) {
    return (
      <p role="alert" className={`${box} flex items-center justify-center p-4 text-center text-sm text-ink/70`}>
        The preview couldn&apos;t be loaded here. Please use <strong className="mx-1">Open in new tab</strong> or Download above.
      </p>
    );
  }
  if (type.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element -- local blob: URL
    return <img src={state.blobUrl} alt={name} className={`${heightClass} w-full rounded-lg border border-gold-light/60 bg-white object-contain`} />;
  }
  return (
    <object data={state.blobUrl} type={type} aria-label={name} className={box}>
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-ink/70">
        <p>This browser can&apos;t show the PDF inline.</p>
        <p className="font-semibold">Use Open in new tab or Download above.</p>
      </div>
    </object>
  );
}
