"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Button, Switch, ui } from "@/components/learn/ui";

type Settings = { notify_email: string; attach_cv: boolean; auto_acknowledge: boolean; auto_screen: boolean; screening_criteria: string };

export function RecruitmentSettingsPanel() {
  const supabase = getSupabaseClient();
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("recruitment_settings").select("notify_email, attach_cv, auto_acknowledge, auto_screen, screening_criteria").eq("id", true).maybeSingle();
    if (error) setMessage({ text: "Couldn't load the settings.", error: true });
    setS((data as Settings | null) || { notify_email: "globalacademy@tarbiyyah.co.uk", attach_cv: true, auto_acknowledge: true, auto_screen: true, screening_criteria: "" });
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load]);

  async function save() {
    if (!supabase || !s) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.notify_email.trim())) return setMessage({ text: "Please enter a valid email address.", error: true });
    setBusy(true);
    const { error } = await supabase.from("recruitment_settings").update({ ...s, notify_email: s.notify_email.trim() }).eq("id", true);
    setBusy(false);
    setMessage(error ? { text: "Couldn't save. Please try again.", error: true } : { text: "Saved." });
  }

  if (!s) return <div className="h-40 animate-pulse rounded-2xl border border-gold-light bg-white" />;

  return (
    <div className={`${ui.card} max-w-2xl space-y-4`}>
      <label className="block text-sm text-ink">
        Send new applications to
        <input type="email" value={s.notify_email} onChange={(e) => setS({ ...s, notify_email: e.target.value })} className={`mt-1 ${ui.input}`} />
        <span className={ui.hint}>Each application arrives here as one email, laid out section by section, with a button that opens it in the portal.</span>
      </label>
      <div className="-mx-3">
        <Switch checked={s.attach_cv} onChange={(v) => setS({ ...s, attach_cv: v })} label="Attach the CV to the email" hint="CVs over 6 MB are never attached; they are always in the portal." />
        <Switch checked={s.auto_acknowledge} onChange={(v) => setS({ ...s, auto_acknowledge: v })} label="Email candidates a confirmation with their reference" />
        <Switch checked={s.auto_screen} onChange={(v) => setS({ ...s, auto_screen: v })} label="Ask the AI for a first read of every new application" hint="Its score and summary go in the email and the portal. Advisory only: it never changes a status or contacts a candidate." />
      </div>
      <label className="block text-sm text-ink">
        What the AI should look for
        <textarea rows={7} maxLength={4000} value={s.screening_criteria} onChange={(e) => setS({ ...s, screening_criteria: e.target.value })} className={`mt-1 ${ui.textarea}`} />
        <span className={ui.hint}>Plain guidance in your own words, one point per line. The AI also reads each role&apos;s essential and desirable points. It never sees names, contact details, location or check answers.</span>
      </label>
      {message && <p role={message.error ? "alert" : "status"} className={`rounded-lg border px-4 py-2 text-sm ${message.error ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-900"}`}>{message.text}</p>}
      <Button variant="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save settings"}</Button>
    </div>
  );
}
