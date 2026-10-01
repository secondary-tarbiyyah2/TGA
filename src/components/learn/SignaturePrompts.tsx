"use client";

import { absoluteFileUrl } from "@/lib/learn/fileLinks";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { openSignedPdf } from "@/app/learn/documents/signedPdf";
import { SignatureCapture, type SignatureCaptureHandle } from "@/components/learn/documents/SignatureCapture";
import { saveDefaultSignature, uploadSignatureImage } from "@/components/learn/documents/signatureImage";

type OutstandingDoc = {
  document_id: string;
  title: string;
  current_asset_id: string | null;
  file_url: string | null;
  body: string | null;
};

/**
 * "Pending your signature" — reads my_outstanding_signatures (0014/0028),
 * which is already scoped to the caller (auth.uid()) inside the view itself.
 * The signer can read the document (text and/or a file link) before
 * signing. Signing is a direct insert into document_signatures: RLS
 * (signer_id = auth.uid(), affirmed = true, asset_id_signed = the document's
 * CURRENT version) is the real enforcement.
 *
 * Renders nothing when there is nothing to sign; pass onLoaded to show an
 * empty state, and onSigned to refresh a history list.
 */
export function SignaturePrompts({ onLoaded, onSigned }: { onLoaded?: (outstanding: number) => void; onSigned?: () => void }) {
  const supabase = getSupabaseClient();
  const [docs, setDocs] = useState<OutstandingDoc[] | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const [typedName, setTypedName] = useState("");
  const [affirmed, setAffirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const deepLinkHandled = useRef(false);
  const capture = useRef<SignatureCaptureHandle>(null);
  const [sigReady, setSigReady] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("my_outstanding_signatures").select("document_id, title, current_asset_id, file_url, body");
    const list = (data as OutstandingDoc[] | null) || [];
    setDocs(list);
    onLoaded?.(list.length);
    // Email links look like /documents?sign=<document id>: open that one.
    if (!deepLinkHandled.current) {
      deepLinkHandled.current = true;
      try {
        const wanted = new URLSearchParams(window.location.search).get("sign");
        if (wanted && list.some((d) => d.document_id === wanted)) {
          setSigning(wanted);
          setTimeout(() => document.getElementById(`sign-${wanted}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
        }
      } catch {
        /* no URL access: ignore */
      }
    }
  }, [supabase, onLoaded]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  const open = (id: string) => {
    setSigning(id);
    setTypedName("");
    setAffirmed(false);
    setError(null);
    setSuccess(false);
    setReceiptId(null);
    setSigReady(false);
  };

  const sign = async (doc: OutstandingDoc) => {
    if (!supabase || !doc.current_asset_id || !typedName.trim() || !affirmed) return;
    setBusy(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const cap = await capture.current?.getCapture();
      if (!cap) {
        setError("Please draw your signature in the box first.");
        return;
      }
      // The id is chosen here so the drawn image can be stored at
      // <user>/<signature id>.png before the signature row that points at it.
      const signatureId = crypto.randomUUID();
      let image: { path: string; sha256: string } | null = null;
      if (cap.blob) {
        image = await uploadSignatureImage(supabase, user.id, signatureId, cap.blob);
        if (!image) {
          setError("Could not save your drawn signature — please try again.");
          return;
        }
      }
      const { data: inserted, error: insertErr } = await supabase
        .from("document_signatures")
        .insert({
          id: signatureId,
          signature_image_path: image?.path ?? null,
          signature_image_sha256: image?.sha256 ?? null,
          document_id: doc.document_id,
          asset_id_signed: doc.current_asset_id,
          signer_id: user.id,
          typed_full_name: typedName.trim(),
          affirmed: true,
        })
        .select("id")
        .maybeSingle();
      if (insertErr) {
        setError("Could not record your signature — please try again.");
        return;
      }
      if (cap.saveDefault && cap.blob) void saveDefaultSignature(supabase, user.id, cap.blob);
      setSigning(null);
      setTypedName("");
      setAffirmed(false);
      setSuccess(true);
      const newId = (inserted as { id: string } | null)?.id ?? null;
      setReceiptId(newId);
      if (newId) {
        // Build the signed PDF, then email a confirmation copy (which attaches
        // it). Fire-and-forget: the signature is already saved, so a PDF or
        // email problem must never surface as a failure.
        void supabase.functions
          .invoke("document-signed-pdf", { body: { signature_id: newId } })
          .catch(() => {})
          .then(() => supabase.functions.invoke("document-signed-copy", { body: { signature_id: newId } }))
          .catch(() => {});
      }
      await load();
      onSigned?.();
    } finally {
      setBusy(false);
    }
  };

  const hasDocs = docs !== null && docs.length > 0;
  if (!hasDocs && !success) return null;

  return (
    <div className="space-y-3">
      {success && (
        <p role="status" className="rounded-2xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-800">
          Signed. Thank you.
          {receiptId && (
            <>
              {" "}
              <button type="button" onClick={() => void openSignedPdf(receiptId)} className="underline">Open your signed PDF</button>
              <span className="font-normal"> (we are also emailing you a copy).</span>
            </>
          )}
        </p>
      )}
      {hasDocs && (
        <div className="rounded-2xl border border-gold-light bg-white p-5">
          <h2 className="text-lg font-semibold text-ink">Pending your signature</h2>
          <p className="mt-0.5 text-sm text-ink/60">Please read each document, then sign it by typing your full name and drawing your signature.</p>
          <ul className="mt-4 space-y-3">
            {docs.map((d) => {
              const isOpen = signing === d.document_id;
              return (
                <li key={d.document_id} id={`sign-${d.document_id}`} className="rounded-2xl border border-gold-light bg-cream/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="min-w-0 font-medium text-ink">{d.title}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {d.file_url && (
                        <a href={absoluteFileUrl(d.file_url)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-cream">
                          Open document
                        </a>
                      )}
                      {!isOpen && (
                        <button type="button" onClick={() => open(d.document_id)} className="rounded-lg bg-gold-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-gold-900">
                          Review &amp; sign
                        </button>
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="mt-4 space-y-3 border-t border-gold-light pt-4">
                      {d.body && (
                        <div tabIndex={0} aria-label={`${d.title} text`} className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-gold-light bg-white p-4 text-sm leading-relaxed text-ink/85">
                          {d.body}
                        </div>
                      )}
                      {!d.body && !d.file_url && <p className="text-sm text-ink/60">This document has no text attached — please check with the school office if you need a copy.</p>}
                      <label className="block text-sm text-ink">
                        Type your full name
                        <input
                          type="text"
                          value={typedName}
                          onChange={(e) => setTypedName(e.target.value)}
                          autoComplete="name"
                          className="mt-1 w-full rounded-lg border border-gold-light bg-white px-3 py-2 text-sm"
                          placeholder="Full name"
                        />
                      </label>
                      <div>
                        <p className="mb-1 text-sm text-ink">Draw your signature</p>
                        <SignatureCapture ref={capture} disabled={busy} onReadyChange={setSigReady} />
                      </div>
                      <label className="flex items-start gap-2 text-sm text-ink">
                        <input type="checkbox" checked={affirmed} onChange={(e) => setAffirmed(e.target.checked)} className="mt-0.5 h-4 w-4" />
                        <span>I confirm I have read and understood this document.</span>
                      </label>
                      {error && <p className="text-sm text-red-700">{error}</p>}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={!typedName.trim() || !affirmed || !sigReady || busy}
                          onClick={() => sign(d)}
                          className="rounded-lg bg-gold-700 px-5 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50"
                        >
                          {busy ? "Signing…" : "Sign"}
                        </button>
                        <button type="button" onClick={() => setSigning(null)} className="text-sm text-ink/60 underline">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
