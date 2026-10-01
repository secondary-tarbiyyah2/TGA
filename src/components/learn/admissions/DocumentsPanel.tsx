"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DOCUMENTS_BUCKET } from "@/components/admissions/applicationShared";

type Doc = { path: string; name: string; size: number | null; created: string | null };

export function DocumentsPanel({ applicationId }: { applicationId: string }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ path: string; label: string; url: string; downloadUrl: string } | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return setError("The portal isn't connected to the server yet.");
    const { data, error: err } = await supabase.storage.from(DOCUMENTS_BUCKET).list(applicationId, { limit: 50, sortBy: { column: "created_at", order: "asc" } });
    if (err) return setError("Couldn't load the documents. If this keeps happening, the storage migration may not be applied yet.");
    setError(null);
    setDocs(
      (data || [])
        .filter((o) => o.name && !o.name.startsWith("."))
        .map((o) => ({
          path: `${applicationId}/${o.name}`,
          name: o.name,
          size: (o.metadata as { size?: number } | null)?.size ?? null,
          created: o.created_at ?? null,
        })),
    );
  }, [applicationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load]);

  async function open(doc: Doc, label: string) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyPath(doc.path);
    setError(null);
    // Audit first (staff-only RPC), then mint short-lived signed URLs.
    await supabase.rpc("admissions_log_document_access", { p_application_id: applicationId, p_path: doc.path, p_action: "view" });
    const [view, dl] = await Promise.all([
      supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(doc.path, 300),
      supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(doc.path, 300, { download: `${label}.pdf` }),
    ]);
    setBusyPath(null);
    if (view.error || !view.data || dl.error || !dl.data) return setError("Couldn't open that document. Please try again.");
    setViewing({ path: doc.path, label, url: view.data.signedUrl, downloadUrl: dl.data.signedUrl });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink/60">Uploaded by the family on the application form. Viewing a document is recorded in the audit log. Links expire after a few minutes.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {docs === null && !error && <p role="status" className="text-sm text-ink/60">Loading…</p>}
      {docs && docs.length === 0 && <p className="text-sm text-ink/60">No documents uploaded. The family may have emailed the report instead.</p>}
      {docs && docs.length > 0 && (
        <ul className="space-y-2">
          {docs.map((d, i) => {
            const label = `School report ${i + 1}`;
            return (
              <li key={d.path} className="flex items-center justify-between gap-3 rounded-lg border border-gold-light/50 px-3 py-2">
                <span className="min-w-0 text-sm text-ink">
                  {label}
                  <span className="block text-xs text-ink/50">
                    PDF{d.size ? ` · ${(d.size / 1048576).toFixed(1)} MB` : ""}
                    {d.created ? ` · ${new Date(d.created).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" })}` : ""}
                  </span>
                </span>
                <button type="button" onClick={() => open(d, label)} disabled={busyPath === d.path} className="shrink-0 rounded-lg border border-gold-light px-3 py-1 text-xs font-semibold text-ink/80 hover:bg-cream disabled:opacity-50">
                  {busyPath === d.path ? "Opening…" : viewing?.path === d.path ? "Reload" : "View"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {viewing && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink">{viewing.label}</p>
            <div className="flex gap-2 text-xs font-semibold">
              <a href={viewing.url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-gold-light px-3 py-1 text-ink/80 hover:bg-cream">Open in new tab</a>
              <a href={viewing.downloadUrl} className="rounded-lg bg-teal-700 px-3 py-1 text-white hover:brightness-110">Download</a>
              <button type="button" onClick={() => setViewing(null)} className="px-2 py-1 text-ink/70 underline">Close</button>
            </div>
          </div>
          <iframe src={viewing.url} title={viewing.label} className="h-[28rem] w-full rounded-lg border border-gold-light/60 bg-white" />
        </div>
      )}
    </div>
  );
}
