"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

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

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("my_outstanding_signatures").select("document_id, title, current_asset_id, file_url, body");
    const list = (data as OutstandingDoc[] | null) || [];
    setDocs(list);
    onLoaded?.(list.length);
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
      const { error: insertErr } = await supabase.from("document_signatures").insert({
        document_id: doc.document_id,
        asset_id_signed: doc.current_asset_id,
        signer_id: user.id,
        typed_full_name: typedName.trim(),
        affirmed: true,
      });
      if (insertErr) {
        setError("Could not record your signature — please try again.");
        return;
      }
      setSigning(null);
      setTypedName("");
      setAffirmed(false);
      setSuccess(true);
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
        </p>
      )}
      {hasDocs && (
        <div className="rounded-2xl border border-gold-light bg-white p-5">
          <h2 className="text-lg font-semibold text-ink">Pending your signature</h2>
          <p className="mt-0.5 text-sm text-ink/60">Please read each document, then sign it with your full name.</p>
          <ul className="mt-4 space-y-3">
            {docs.map((d) => {
              const isOpen = signing === d.document_id;
              return (
                <li key={d.document_id} className="rounded-2xl border border-gold-light bg-cream/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="min-w-0 font-medium text-ink">{d.title}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {d.file_url && (
                        <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-cream">
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
                      <label className="flex items-start gap-2 text-sm text-ink">
                        <input type="checkbox" checked={affirmed} onChange={(e) => setAffirmed(e.target.checked)} className="mt-0.5 h-4 w-4" />
                        <span>I confirm I have read and understood this document.</span>
                      </label>
                      {error && <p className="text-sm text-red-700">{error}</p>}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={!typedName.trim() || !affirmed || busy}
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
