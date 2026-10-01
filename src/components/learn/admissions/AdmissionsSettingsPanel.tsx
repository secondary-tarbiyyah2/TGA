"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Group, fieldCls, primaryBtn } from "@/components/learn/admissions/ui";

type Draft = { payment_instructions: string; assessment_join_url: string; interview_join_url: string; assessment_duration_text: string };
const EMPTY: Draft = { payment_instructions: "", assessment_join_url: "", interview_join_url: "", assessment_duration_text: "" };

/** Owner-editable admissions text used in emails: bank details, default join links, assessment length. */
export function AdmissionsSettingsPanel() {
  const [d, setD] = useState<Draft>(EMPTY);
  const [saved, setSaved] = useState<Draft>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void supabase
      .from("site_settings")
      .select("payment_instructions, assessment_join_url, interview_join_url, assessment_duration_text")
      .eq("id", true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return setMsg({ ok: false, text: "Couldn't load the settings. Migration 0061 may not be applied yet." });
        const r = (data || {}) as Partial<Record<keyof Draft, string | null>>;
        const next: Draft = {
          payment_instructions: r.payment_instructions || "",
          assessment_join_url: r.assessment_join_url || "",
          interview_join_url: r.interview_join_url || "",
          assessment_duration_text: r.assessment_duration_text || "",
        };
        setD(next);
        setSaved(next);
        setLoaded(true);
      });
  }, []);

  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const set = (k: keyof Draft, v: string) => setD((c) => ({ ...c, [k]: v }));

  async function save() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSaving(true);
    setMsg(null);
    const nz = (s: string) => (s.trim() === "" ? null : s.trim());
    const { data, error } = await supabase
      .from("site_settings")
      .update({
        payment_instructions: d.payment_instructions.trim() || "Bank transfer details to follow.",
        assessment_join_url: nz(d.assessment_join_url),
        interview_join_url: nz(d.interview_join_url),
        assessment_duration_text: d.assessment_duration_text.trim() || "about 60 to 90 minutes",
      })
      .eq("id", true)
      .select("id");
    setSaving(false);
    if (error || !data?.length) return setMsg({ ok: false, text: "Couldn't save. Only an Admin can change these settings." });
    setSaved(d);
    setMsg({ ok: true, text: "Saved. New emails use these values." });
  }

  return (
    <div className="space-y-4">
      <Group
        title="Offer & assessment email settings"
        help="Used when staff write offer, assessment and interview emails. Fee amounts are not set here: change them in Content > Fees. The Fees Policy PDF is the source of truth for the bank details below. Note: these settings are stored in the public site settings table, so only put details here that you are happy to be in the Fees Policy."
      >
        <label className="block text-sm font-medium text-ink">
          Payment instructions (bank details)
          <textarea value={d.payment_instructions} onChange={(e) => set("payment_instructions", e.target.value)} rows={6} maxLength={2000} disabled={!loaded} className={`${fieldCls} font-mono text-xs`} />
          <span className="mt-1 block text-xs font-normal text-ink/55">Pasted into the offer email under &ldquo;How to pay&rdquo;. The offer also asks families to use the child&apos;s full name as the reference.</span>
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink">
            Default assessment join link
            <input type="url" value={d.assessment_join_url} onChange={(e) => set("assessment_join_url", e.target.value)} placeholder="https://teams.microsoft.com/…" maxLength={500} disabled={!loaded} className={fieldCls} />
          </label>
          <label className="block text-sm font-medium text-ink">
            Default interview join link
            <input type="url" value={d.interview_join_url} onChange={(e) => set("interview_join_url", e.target.value)} placeholder="https://…" maxLength={500} disabled={!loaded} className={fieldCls} />
          </label>
          <label className="block text-sm font-medium text-ink sm:col-span-2">
            Usual assessment length (wording)
            <input value={d.assessment_duration_text} onChange={(e) => set("assessment_duration_text", e.target.value)} maxLength={100} disabled={!loaded} className={fieldCls} />
          </label>
        </div>
      </Group>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving || !dirty || !loaded} className={primaryBtn}>{saving ? "Saving…" : "Save settings"}</button>
        {msg && <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-teal-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
