"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/learn/ui";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";
import { forgetDefaultSignature, loadSavedSignature, saveDefaultSignature } from "./signatureImage";

/**
 * "Your signature" on Your account (staff). The saved signature is the same one
 * offered when signing documents, and it is added automatically to the Star of
 * the Week certificates this person signs: the Headteacher's on every
 * certificate, a class teacher's on the certificates for the stars they
 * nominate (supabase/functions/star-certificate).
 */
export function MySignatureSettings({ userId }: { userId: string }) {
  const supabase = getSupabaseClient();
  const pad = useRef<SignaturePadHandle>(null);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let live = true;
    void (async () => {
      const blob = supabase ? await loadSavedSignature(supabase, userId) : null;
      if (!live) return;
      if (blob) {
        url = URL.createObjectURL(blob);
        setSavedUrl(url);
      }
      setLoaded(true);
    })();
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [supabase, userId]);

  async function save() {
    if (!supabase || !pad.current) return;
    setBusy(true);
    setMessage(null);
    const blob = await pad.current.toBlob();
    const ok = blob ? await saveDefaultSignature(supabase, userId, blob) : false;
    setBusy(false);
    if (!ok || !blob) return setMessage({ text: "Couldn't save your signature. Please try again.", error: true });
    if (savedUrl) URL.revokeObjectURL(savedUrl);
    setSavedUrl(URL.createObjectURL(blob));
    setEditing(false);
    setMessage({ text: "Signature saved. It will be added to the certificates you sign." });
  }

  async function remove() {
    if (!supabase) return;
    setBusy(true);
    await forgetDefaultSignature(supabase, userId);
    setBusy(false);
    if (savedUrl) URL.revokeObjectURL(savedUrl);
    setSavedUrl(null);
    setMessage({ text: "Signature removed. Certificates will show a blank line to sign by hand." });
  }

  return (
    <div>
      {!loaded ? null : editing || !savedUrl ? (
        <div className="mt-4">
          <SignaturePad ref={pad} disabled={busy} onChange={(s) => setValid(s.valid)} label="Draw your signature here" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void save()} disabled={busy || !valid}>
              {busy ? "Saving…" : "Save signature"}
            </Button>
            <Button onClick={() => pad.current?.clear()} disabled={busy}>
              Clear
            </Button>
            {savedUrl && (
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex h-28 items-center justify-center rounded-xl border border-gold-light/60 bg-cream px-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- a private object URL, not a static asset */}
            <img src={savedUrl} alt="Your saved signature" className="max-h-24 max-w-full object-contain" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => { setMessage(null); setEditing(true); }} disabled={busy}>
              Draw a new one
            </Button>
            <Button variant="ghost" onClick={() => void remove()} disabled={busy}>
              Remove
            </Button>
          </div>
        </div>
      )}
      {message && (
        <p role={message.error ? "alert" : "status"} className={`mt-3 text-sm ${message.error ? "text-red-700" : "text-teal-700"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
