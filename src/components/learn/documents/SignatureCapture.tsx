"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";
import { forgetDefaultSignature, loadSavedSignature } from "./signatureImage";
import { Tabs } from "@/components/learn/Tabs";

export type CapturedSignature = {
  /** The PNG to store, or null for a typed-name-only signature. */
  blob: Blob | null;
  kind: "drawn" | "saved" | "typed";
  /** Store the drawn PNG as this person's default (self mode only). */
  saveDefault: boolean;
};
export type SignatureCaptureHandle = {
  getCapture: () => Promise<CapturedSignature | null>;
  reset: () => void;
};

/**
 * "Draw" (default) / "Type" capture used when someone signs in the portal, and,
 * with mode="staff", when a parent signs on a staff tablet. In self mode a
 * previously saved signature can be reused with one tap. Typed-name-only is a
 * fallback for people who cannot draw; the typed full name is always required
 * by the caller either way.
 */
export const SignatureCapture = forwardRef<
  SignatureCaptureHandle,
  { mode?: "self" | "staff"; disabled?: boolean; onReadyChange?: (ready: boolean) => void }
>(function SignatureCapture({ mode = "self", disabled, onReadyChange }, ref) {
  const self = mode === "self";
  const pad = useRef<SignaturePadHandle>(null);
  const [tab, setTab] = useState<"draw" | "type">("draw");
  const [padValid, setPadValid] = useState(false);
  const [saved, setSaved] = useState<{ blob: Blob; url: string } | null>(null);
  const [useSaved, setUseSaved] = useState(false);
  const [saveDefault, setSaveDefault] = useState(false);
  const [padKey, setPadKey] = useState(0);

  // Look for a saved signature (self mode only).
  useEffect(() => {
    if (!self) return;
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const blob = await loadSavedSignature(supabase, user.id);
      if (!blob || cancelled) return;
      url = URL.createObjectURL(blob);
      setSaved({ blob, url });
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [self]);

  const ready = tab === "type" ? true : useSaved ? !!saved : padValid;
  useEffect(() => {
    onReadyChange?.(ready);
  }, [ready, onReadyChange]);

  useImperativeHandle(
    ref,
    () => ({
      async getCapture() {
        if (tab === "type") return { blob: null, kind: "typed", saveDefault: false };
        if (useSaved && saved) return { blob: saved.blob, kind: "saved", saveDefault: false };
        const blob = await pad.current?.toBlob();
        if (!blob || !pad.current?.getState().valid) return null;
        return { blob, kind: "drawn", saveDefault: self && saveDefault };
      },
      reset() {
        pad.current?.clear();
        setUseSaved(false);
        setSaveDefault(false);
        setTab("draw");
        setPadKey((k) => k + 1);
        setPadValid(false);
      },
    }),
    [tab, useSaved, saved, saveDefault, self],
  );

  return (
    <div className="space-y-2">
      {self && (
        <Tabs
          variant="switch"
          items={[
            { key: "draw", label: "Draw" },
            { key: "type", label: "Type it instead" },
          ]}
          value={tab}
          onChange={setTab}
          label="How to sign"
        />
      )}
      <div className={tab === "draw" ? "" : "hidden"}>
        {self && saved && useSaved ? (
          <div className="rounded-xl border border-gold-light bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img src={saved.url} alt="Your saved signature" className="mx-auto max-h-28 w-auto" />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-ink/60">Your saved signature. It will be used when you tick the box and sign.</span>
              <span className="flex gap-3">
                <button type="button" onClick={() => setUseSaved(false)} className="font-medium text-teal-700 underline">Draw a new one</button>
                <button
                  type="button"
                  onClick={async () => {
                    const supabase = getSupabaseClient();
                    const {
                      data: { user },
                    } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
                    if (supabase && user) await forgetDefaultSignature(supabase, user.id);
                    setSaved(null);
                    setUseSaved(false);
                  }}
                  className="text-ink/55 underline"
                >
                  Forget it
                </button>
              </span>
            </div>
          </div>
        ) : (
          <>
            {self && saved && (
              <div className="mb-2 flex flex-wrap items-center gap-3 rounded-xl border border-gold-light bg-cream/50 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                <img src={saved.url} alt="Your saved signature" className="max-h-10 w-auto rounded bg-white p-1" />
                <button type="button" onClick={() => setUseSaved(true)} className="rounded-lg bg-gold-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gold-900">
                  Use my saved signature
                </button>
              </div>
            )}
            <SignaturePad key={padKey} ref={pad} disabled={disabled} onChange={(s) => setPadValid(s.valid)} />
            {self && (
              <label className="mt-2 flex items-start gap-2 text-sm text-ink">
                <input type="checkbox" checked={saveDefault} onChange={(e) => setSaveDefault(e.target.checked)} className="mt-0.5 h-4 w-4" />
                <span>Save my signature for next time</span>
              </label>
            )}
          </>
        )}
      </div>
      {tab === "type" && (
        <p className="rounded-xl border border-gold-light bg-cream/50 px-3 py-2 text-sm text-ink/70">
          Your typed full name will be used as your signature. If you can, please go back and draw it: a handwritten signature is stronger evidence.
        </p>
      )}
    </div>
  );
});
