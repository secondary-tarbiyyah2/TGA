"use client";

import { useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { SignatureCapture, type SignatureCaptureHandle } from "./SignatureCapture";
import { uploadSignatureImage } from "./signatureImage";
import { HAND_METHODS, METHOD_LABEL, type SignatureMethod } from "./signatureMethod";

export type SignTarget = { user_id: string; name: string };

const BUCKET = "signed-paper-copies";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Records signatures given by hand (paper / in person / phone) on behalf of
 * one or many people for ONE document. RLS + a DB trigger enforce that only a
 * Headteacher/Admin can do this; the current document version is always the
 * one recorded, so the content hash/version logic is unchanged. */
export function RecordSignatureModal({
  documentId,
  documentTitle,
  targets,
  onClose,
  onDone,
}: {
  documentId: string;
  documentTitle: string;
  targets: SignTarget[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const bulk = targets.length > 1;
  const [choice, setChoice] = useState<SignatureMethod | "capture">("paper");
  const capture = choice === "capture" && !bulk;
  const method: SignatureMethod = choice === "capture" ? "in_person" : choice;
  const pad = useRef<SignatureCaptureHandle>(null);
  const [padReady, setPadReady] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [seen, setSeen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = (f: File | null) => {
    setError(null);
    if (f && !ALLOWED.includes(f.type)) {
      setFile(null);
      return setError("The scan must be a PDF, JPG or PNG.");
    }
    if (f && f.size > MAX_BYTES) {
      setFile(null);
      return setError("The scan must be 10MB or smaller.");
    }
    setFile(f);
  };

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return setError("Not connected.");
    if (!seen) return setError("Please confirm you have seen the signed document.");
    if (!date || date > todayIso()) return setError("The date signed can't be in the future.");
    let drawn: Blob | null = null;
    if (capture) {
      const cap = await pad.current?.getCapture();
      if (!cap?.blob) return setError("Please ask them to sign in the box first.");
      drawn = cap.blob;
    }
    setBusy(true);
    setError(null);

    const { data: doc, error: docErr } = await supabase.from("signable_documents").select("id, current_asset_id").eq("id", documentId).maybeSingle();
    if (docErr || !doc) {
      setBusy(false);
      return setError("Couldn't load the document.");
    }
    const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", targets.map((t) => t.user_id));
    const nameOf = new Map(((profs as { id: string; full_name: string | null; email: string | null }[]) || []).map((p) => [p.id, p.full_name || p.email || ""]));

    // Today -> the actual time; an earlier day -> midday UTC on that day.
    const signedAt = date === todayIso() ? new Date().toISOString() : `${date}T12:00:00.000Z`;
    let done = 0;
    let already = 0;
    const newIds: string[] = [];
    const failed: string[] = [];
    for (const t of targets) {
      let evidence: string | null = null;
      if (file && !bulk) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
        const path = `${documentId}/${t.user_id}/${Date.now()}-${safe}`;
        const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) {
          failed.push(`${t.name} (scan upload failed)`);
          continue;
        }
        evidence = path;
      }
      const signatureId = crypto.randomUUID();
      let image: { path: string; sha256: string } | null = null;
      if (drawn) {
        image = await uploadSignatureImage(supabase, t.user_id, signatureId, drawn);
        if (!image) {
          failed.push(`${t.name} (signature image upload failed)`);
          continue;
        }
      }
      const { data: inserted, error: err } = await supabase.from("document_signatures").insert({
        id: signatureId,
        signature_image_path: image?.path ?? null,
        signature_image_sha256: image?.sha256 ?? null,
        document_id: documentId,
        asset_id_signed: doc.current_asset_id,
        signer_id: t.user_id,
        typed_full_name: nameOf.get(t.user_id) || t.name,
        affirmed: true,
        signed_at: signedAt,
        method,
        evidence_path: evidence,
        record_note: note.trim() || null,
      }).select("id").maybeSingle();
      if (!err) {
        done++;
        if (inserted?.id) newIds.push(inserted.id as string);
      }
      else if (err.code === "23505") already++;
      else failed.push(t.name);
    }
    setBusy(false);
    if (newIds.length) {
      // Build each person's signed PDF in the background, one at a time
      // (fire-and-forget; it is also generated on demand when first opened).
      void (async () => {
        for (const id of newIds) {
          try {
            await supabase.functions.invoke("document-signed-pdf", { body: { signature_id: id } });
          } catch {
            /* generated on demand later */
          }
        }
      })();
    }
    if (failed.length) {
      setError(`Couldn't record: ${failed.join(", ")}.${done ? ` ${done} recorded.` : ""} Only a Headteacher or Admin can do this.`);
      if (done) onDone(`Recorded ${done} signature${done === 1 ? "" : "s"}; some failed.`);
      return;
    }
    onDone(`Recorded ${done} signature${done === 1 ? "" : "s"}${already ? ` (${already} already signed)` : ""} for ${documentTitle}.`);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Record signature by hand">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gold-light px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">Record signature by hand</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-xl leading-none text-ink/65 hover:bg-cream">
            ×
          </button>
        </div>
        <div className="space-y-4 px-5 py-5 text-sm">
          <div>
            <p className="font-medium text-ink">{documentTitle}</p>
            <p className="text-ink/65">{bulk ? `${targets.length} people: ${targets.slice(0, 6).map((t) => t.name).join(", ")}${targets.length > 6 ? "…" : ""}` : targets[0]?.name}</p>
          </div>
          <fieldset>
            <legend className="mb-1 font-medium text-ink">How did they sign?</legend>
            <div className="space-y-1.5">
              {HAND_METHODS.map((m) => (
                <label key={m} className="flex items-center gap-2">
                  <input type="radio" name="sig-method" checked={choice === m} onChange={() => setChoice(m)} />
                  {METHOD_LABEL[m]}
                </label>
              ))}
              {!bulk && (
                <label className="flex items-center gap-2">
                  <input type="radio" name="sig-method" checked={choice === "capture"} onChange={() => setChoice("capture")} />
                  Capture signature now (they sign on this device)
                </label>
              )}
            </div>
          </fieldset>
          {capture && (
            <div>
              <p className="mb-1 font-medium text-ink">{targets[0]?.name}: sign here with a finger or stylus</p>
              <SignatureCapture ref={pad} mode="staff" disabled={busy} onReadyChange={setPadReady} />
              <p className="mt-1 text-xs text-ink/65">Recorded as signed in person, with the drawn signature kept on file.</p>
            </div>
          )}
          <label className="block">
            <span className="font-medium text-ink">Date signed</span>
            <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className="mt-1 block rounded-lg border border-gold-light px-3 py-2" />
          </label>
          <label className="block">
            <span className="font-medium text-ink">Note (optional)</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Handed in at the open evening" className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2" />
          </label>
          {bulk ? (
            <p className="text-xs text-ink/65">Scans can&apos;t be attached in bulk. To keep a scan for someone, record their signature on its own.</p>
          ) : (
            <label className="block">
              <span className="font-medium text-ink">Scan of the signed copy (optional)</span>
              <span className="block text-xs text-ink/65">PDF, JPG or PNG, up to 10MB. Only a Headteacher or Admin can open it.</span>
              <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => onFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-sm" />
            </label>
          )}
          <label className="flex items-start gap-2 rounded-lg bg-cream px-3 py-2">
            <input type="checkbox" checked={seen} onChange={(e) => setSeen(e.target.checked)} className="mt-0.5" />
            <span>I have seen the signed document{method === "verbal" ? " (or witnessed the confirmation)" : ""}.</span>
          </label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gold-light px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gold-light px-4 py-2 text-sm font-medium text-ink/75 hover:bg-cream">
            Cancel
          </button>
          <button type="button" disabled={busy || !seen || (capture && !padReady)} onClick={save} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
            {busy ? "Recording…" : bulk ? `Record ${targets.length} signatures` : "Record signature"}
          </button>
        </div>
      </div>
    </div>
  );
}
