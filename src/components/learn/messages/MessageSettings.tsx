"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/** Account-page card: the per-user read-receipts switch (message_prefs). */
export function MessageSettings({ userId }: { userId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("message_prefs")
      .select("read_receipts_enabled")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setEnabled(data ? (data as { read_receipts_enabled: boolean }).read_receipts_enabled : true));
  }, [userId]);

  const toggle = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || enabled === null) return;
    const next = !enabled;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from("message_prefs")
      .upsert({ user_id: userId, read_receipts_enabled: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setBusy(false);
    if (err) {
      setError("Couldn't save that setting. Please try again.");
      return;
    }
    setEnabled(next);
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Messages</h2>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="text-sm text-ink">
          <p className="font-medium">Read receipts</p>
          <p className="mt-1 text-ink/65">
            When on, people you message can see when you have read their messages, and you can see when they read yours. If you turn this off, you won&apos;t send or see read receipts. Messages still show as sent, and school safeguarding oversight is unaffected.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled === true}
          aria-label="Read receipts"
          disabled={busy || enabled === null}
          onClick={toggle}
          className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${enabled ? "bg-teal-600" : "bg-ink/25"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
