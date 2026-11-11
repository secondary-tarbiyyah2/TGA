"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type EmailMode = "immediate" | "daily" | "off";
const EMAIL_MODES: { id: EmailMode; label: string; hint: string }[] = [
  { id: "immediate", label: "As they arrive", hint: "At most one email per conversation every 30 minutes, and only while it is unread." },
  { id: "daily", label: "Once a day", hint: "One summary after school of anything you have not read." },
  { id: "off", label: "No emails", hint: "Check Messages in the portal yourself." },
];

/** Account-page card: read receipts and message emails (message_prefs, 0058 and 0205). */
export function MessageSettings({ userId }: { userId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [emailMode, setEmailMode] = useState<EmailMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("message_prefs")
      .select("read_receipts_enabled, email_mode")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) {
          // Before 0205 is applied the email column does not exist yet.
          supabase
            .from("message_prefs")
            .select("read_receipts_enabled")
            .eq("user_id", userId)
            .maybeSingle()
            .then(({ data: d }) => setEnabled(d ? (d as { read_receipts_enabled: boolean }).read_receipts_enabled : true));
          return;
        }
        const row = data as { read_receipts_enabled: boolean; email_mode: EmailMode } | null;
        setEnabled(row ? row.read_receipts_enabled : true);
        setEmailMode(row?.email_mode || "immediate");
      });
  }, [userId]);

  const save = async (patch: { read_receipts_enabled?: boolean; email_mode?: EmailMode }) => {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("message_prefs").upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setBusy(false);
    if (err) {
      setError("Couldn't save that setting. Please try again.");
      return false;
    }
    return true;
  };

  const toggle = async () => {
    if (enabled === null) return;
    const next = !enabled;
    if (await save({ read_receipts_enabled: next })) setEnabled(next);
  };

  const chooseEmail = async (m: EmailMode) => {
    if (m === emailMode) return;
    const prev = emailMode;
    setEmailMode(m);
    if (!(await save({ email_mode: m }))) setEmailMode(prev);
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
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
      {emailMode !== null && (
        <fieldset className="mt-5 text-sm text-ink">
          <legend className="font-medium">Emails about new messages</legend>
          <p className="mt-1 text-ink/65">Sent to the email address on your account. They say who wrote, never what they wrote. A muted conversation is never emailed.</p>
          <div className="mt-2 space-y-1.5">
            {EMAIL_MODES.map((m) => (
              <label key={m.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-cream">
                <input type="radio" name="message-email-mode" value={m.id} checked={emailMode === m.id} disabled={busy} onChange={() => chooseEmail(m.id)} className="mt-1" />
                <span>
                  <span className="block font-medium">{m.label}</span>
                  <span className="block text-xs text-ink/65">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
