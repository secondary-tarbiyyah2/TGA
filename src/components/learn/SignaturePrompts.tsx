"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type OutstandingDoc = { document_id: string; title: string; current_asset_id: string };

/**
 * "Pending your signature" — reads my_outstanding_signatures (0014), which
 * is already scoped to the caller (auth.uid()) inside the view itself, so
 * no extra client-side filtering is needed here. Signing is a direct
 * insert into document_signatures: RLS (signer_id = auth.uid(), affirmed
 * = true, asset_id_signed = the document's CURRENT version) is the real
 * enforcement — this form just can't submit anything that policy would
 * reject anyway.
 */
export function SignaturePrompts() {
  const supabase = getSupabaseClient();
  const [docs, setDocs] = useState<OutstandingDoc[] | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const [typedName, setTypedName] = useState("");
  const [affirmed, setAffirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("my_outstanding_signatures").select("document_id, title, current_asset_id");
    setDocs((data as OutstandingDoc[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const sign = async (doc: OutstandingDoc) => {
    if (!supabase || !typedName.trim() || !affirmed) return;
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
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (docs === null || docs.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Pending your signature</h2>
      <ul className="mt-3 space-y-3">
        {docs.map((d) => (
          <li key={d.document_id} className="rounded-lg border border-gold-light/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink">{d.title}</span>
              {signing !== d.document_id && (
                <button
                  type="button"
                  onClick={() => setSigning(d.document_id)}
                  className="rounded-full border border-gold-500 px-4 py-1.5 text-sm text-gold-700 hover:bg-cream"
                >
                  Review &amp; sign
                </button>
              )}
            </div>
            {signing === d.document_id && (
              <div className="mt-3 space-y-3 border-t border-gold-light/30 pt-3">
                <label className="block text-sm text-ink">
                  Type your full name
                  <input
                    type="text"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gold-light/60 px-3 py-2 text-sm"
                    placeholder="Full name"
                  />
                </label>
                <label className="flex items-start gap-2 text-sm text-ink">
                  <input type="checkbox" checked={affirmed} onChange={(e) => setAffirmed(e.target.checked)} className="mt-0.5" />
                  <span>I confirm I have read and understood this document.</span>
                </label>
                {error && <p className="text-sm text-red-700">{error}</p>}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!typedName.trim() || !affirmed || busy}
                    onClick={() => sign(d)}
                    className="rounded-full bg-gold-600 px-4 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    Sign
                  </button>
                  <button type="button" onClick={() => setSigning(null)} className="text-sm text-ink/60 underline">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
