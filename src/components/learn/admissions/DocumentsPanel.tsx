"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { FilePreview, mimeFromName } from "@/components/learn/admissions/FilePreview";
import { DOCUMENTS_BUCKET } from "@/components/admissions/applicationShared";
import { btn } from "@/components/learn/ui";

type Doc = { path: string; name: string; size: number | null; created: string | null; appId: string; shared?: boolean };

const KIND_LABELS: Record<string, string> = {
  report: "School report",
  parent_id: "Parent/guardian ID",
  child_id: "Child ID",
  guardian_id: "Legal guardian ID",
  address_proof: "Proof of address",
  results: "Assessment results",
};

/** "<kind>-<uuid>.<ext>" (or legacy "<uuid>.pdf" = school report) -> label + extension. */
function describeFile(name: string, index: number): { label: string; ext: string; kind: string } {
  const ext = (name.split(".").pop() || "pdf").toLowerCase();
  const kind = /^(report|parent_id|child_id|guardian_id|address_proof|results)-/.exec(name)?.[1] || "report";
  return { label: `${KIND_LABELS[kind]} ${index}`, ext, kind };
}

/**
 * `sharedIdFrom`: for a sibling who is not the first child on the family form,
 * the application that holds the parent's photo ID (uploaded once). Its parent
 * ID files are listed here too, marked as shared.
 */
export function DocumentsPanel({ applicationId, sharedIdFrom }: { applicationId: string; sharedIdFrom?: { id: string; childName: string } | null }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ path: string; label: string; url: string; downloadUrl: string } | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);

  const sharedId = sharedIdFrom?.id;
  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return setError("The portal isn't connected to the server yet.");
    const { data, error: err } = await supabase.storage.from(DOCUMENTS_BUCKET).list(applicationId, { limit: 50, sortBy: { column: "created_at", order: "asc" } });
    if (err) return setError("Couldn't load the documents. If this keeps happening, the storage migration may not be applied yet.");
    setError(null);
    const own: Doc[] = (data || [])
      .filter((o) => o.name && !o.name.startsWith("."))
      .map((o) => ({
        path: `${applicationId}/${o.name}`,
        name: o.name,
        size: (o.metadata as { size?: number } | null)?.size ?? null,
        created: o.created_at ?? null,
        appId: applicationId,
      }));
    let shared: Doc[] = [];
    if (sharedId && sharedId !== applicationId) {
      const { data: leadFiles } = await supabase.storage.from(DOCUMENTS_BUCKET).list(sharedId, { limit: 50, sortBy: { column: "created_at", order: "asc" } });
      shared = (leadFiles || [])
        .filter((o) => o.name && (o.name.startsWith("parent_id-") || o.name.startsWith("address_proof-")))
        .map((o) => ({
          path: `${sharedId}/${o.name}`,
          name: o.name,
          size: (o.metadata as { size?: number } | null)?.size ?? null,
          created: o.created_at ?? null,
          appId: sharedId,
          shared: true,
        }));
    }
    setDocs([...own, ...shared]);
  }, [applicationId, sharedId]);

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
    await supabase.rpc("admissions_log_document_access", { p_application_id: doc.appId, p_path: doc.path, p_action: "view" });
    const [view, dl] = await Promise.all([
      supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(doc.path, 300),
      supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(doc.path, 300, { download: `${label}.${describeFile(doc.name, 1).ext}` }),
    ]);
    setBusyPath(null);
    if (view.error || !view.data || dl.error || !dl.data) return setError("Couldn't open that document. Please try again.");
    setViewing({ path: doc.path, label, url: view.data.signedUrl, downloadUrl: dl.data.signedUrl });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink/65">Uploaded by the family on the application form, plus assessment results added by staff. Viewing a document is recorded in the audit log. Links expire after a few minutes.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {docs === null && !error && <p role="status" className="text-sm text-ink/65">Loading…</p>}
      {docs && docs.length === 0 && <p className="text-sm text-ink/65">No documents uploaded. The family may have emailed the report instead.</p>}
      {docs && docs.length > 0 && (
        <ul className="space-y-2">
          {docs.map((d, i) => {
            const kind = describeFile(d.name, 0).kind;
            const nth = docs.slice(0, i + 1).filter((x) => describeFile(x.name, 0).kind === kind).length;
            const described = describeFile(d.name, nth);
            const { ext } = described;
            const label = d.shared && sharedIdFrom ? `${described.label} (shared with ${sharedIdFrom.childName}'s application)` : described.label;
            return (
              <li key={d.path} className="flex items-center justify-between gap-3 rounded-lg border border-gold-light/50 px-3 py-2">
                <span className="min-w-0 text-sm text-ink">
                  {label}
                  <span className="block text-xs text-ink/65">
                    {ext.toUpperCase()}{d.size ? ` · ${(d.size / 1048576).toFixed(1)} MB` : ""}
                    {d.created ? ` · ${new Date(d.created).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" })}` : ""}
                  </span>
                </span>
                <button type="button" onClick={() => open(d, label)} disabled={busyPath === d.path} className={`${btn("secondary", "sm")} shrink-0`}>
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
              <a href={viewing.url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-gold-500 px-3 py-1 text-ink-900 hover:brightness-105">Open in new tab</a>
              <a href={viewing.downloadUrl} className={btn("primary", "sm")}>Download</a>
              <button type="button" onClick={() => setViewing(null)} className="px-2 py-1 text-ink/70 underline">Close</button>
            </div>
          </div>
          <FilePreview key={viewing.url} url={viewing.url} type={mimeFromName(viewing.path)} name={viewing.label} />
        </div>
      )}
    </div>
  );
}
