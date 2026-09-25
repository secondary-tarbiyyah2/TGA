"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { getSupabaseClient } from "@/lib/supabase/client";

type Settings = {
  recording_retention_days: number;
  absence_alert_delay_minutes: number;
  unexplained_absence_threshold: number;
  unexplained_absence_period_days: number;
};

function LmsSettingsForm() {
  const supabase = getSupabaseClient();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("lms_settings")
      .select("recording_retention_days, absence_alert_delay_minutes, unexplained_absence_threshold, unexplained_absence_period_days")
      .eq("id", true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (data) setSettings(data as Settings);
        else setLoadError(error?.message || "You don't have access to these settings.");
      });
  }, [supabase]);

  const save = async () => {
    if (!supabase || !settings) return;
    setBusy(true);
    setMessage(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("lms_settings").update({ ...settings, updated_by: user?.id, updated_at: new Date().toISOString() }).eq("id", true);
      setMessage(error ? `Could not save: ${error.message}` : "Saved.");
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <div className="rounded-2xl border border-gold-light/50 bg-white p-6"><p className="text-sm text-ink/60">{loadError}</p></div>;
  if (!settings) return <p className="text-sm text-ink/60">Loading…</p>;

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Lessons, attendance &amp; recordings</h2>
      <p className="mt-1 text-sm text-ink/60">Only Head Teacher/Admin can change these.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="block font-medium text-ink">Recording retention (days)</span>
          <span className="block text-xs text-ink/50">Recordings older than this are automatically deleted, nightly.</span>
          <input
            type="number"
            min={1}
            value={settings.recording_retention_days}
            onChange={(e) => setSettings({ ...settings, recording_retention_days: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="block font-medium text-ink">Absence alert delay (minutes)</span>
          <span className="block text-xs text-ink/50">How long after a lesson ends, with no attendance recorded, before parents are emailed.</span>
          <input
            type="number"
            min={0}
            value={settings.absence_alert_delay_minutes}
            onChange={(e) => setSettings({ ...settings, absence_alert_delay_minutes: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="block font-medium text-ink">Unexplained absence threshold</span>
          <span className="block text-xs text-ink/50">Unexplained absences within the period below before the Safeguarding Lead is alerted.</span>
          <input
            type="number"
            min={1}
            value={settings.unexplained_absence_threshold}
            onChange={(e) => setSettings({ ...settings, unexplained_absence_threshold: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="block font-medium text-ink">Rolling period (days)</span>
          <input
            type="number"
            min={1}
            value={settings.unexplained_absence_period_days}
            onChange={(e) => setSettings({ ...settings, unexplained_absence_period_days: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <button type="button" disabled={busy} onClick={save} className="mt-4 rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900 disabled:opacity-50">
        Save
      </button>
      {message && <p className="mt-2 text-xs text-ink/70">{message}</p>}
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <AdminShell>
          <LmsSettingsForm />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
