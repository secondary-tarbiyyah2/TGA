"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Card } from "@/components/learn/Card";
import { triggerPublish } from "@/lib/learn/publishSiteContent";
import { siteSettingsDefaults as D, withDefault, toStored } from "@/content/defaults";
import { DefaultBadge, ResetLink } from "./DefaultField";

type Row = {
  launch_date: string | null;
  cta_primary_label: string | null;
  cta_primary_href: string | null;
  application_fee: number | null;
  registration_fee: number | null;
  sibling_discount_percent: number | null;
  sibling_discount_note: string | null;
  booking_widget_url: string | null;
  open_evening_recording_url: string | null;
  portal_url: string | null;
  admissions_email: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  opening_hours: string | null;
  safeguarding_lead_name: string | null;
  safeguarding_lead_contact: string | null;
  complaints_last_year: number | null;
  registration_body: string | null;
  registration_number: string | null;
  regulatory_status_note: string | null;
  headteacher_welcome_quote: string | null;
  headteacher_name: string | null;
};

const DEFAULT_KEYS = ["cta_primary_label", "cta_primary_href", "admissions_email"] as const;
type DefaultKey = (typeof DEFAULT_KEYS)[number];
const hasDefault = (k: keyof Row): k is DefaultKey => (DEFAULT_KEYS as readonly string[]).includes(k);

const FIELDS: { key: keyof Row; label: string; type?: "text" | "number" | "textarea" | "email" | "url"; hint?: string }[] = [
  { key: "cta_primary_label", label: "Homepage primary button label" },
  { key: "cta_primary_href", label: "Homepage primary button link" },
  { key: "application_fee", label: "Application fee (£)", type: "number" },
  { key: "registration_fee", label: "Registration fee (£)", type: "number" },
  { key: "sibling_discount_percent", label: "Sibling discount (%)", type: "number" },
  { key: "sibling_discount_note", label: "Sibling discount note" },
  { key: "admissions_email", label: "Admissions email", type: "email" },
  { key: "contact_phone", label: "Contact phone" },
  { key: "contact_address", label: "Contact address", type: "textarea" },
  { key: "opening_hours", label: "Opening hours" },
  { key: "booking_widget_url", label: "Open Evening booking widget URL", type: "url" },
  { key: "open_evening_recording_url", label: "Open Evening recording URL", type: "url" },
  { key: "portal_url", label: "Portal URL", type: "url" },
  { key: "safeguarding_lead_name", label: "Safeguarding Lead name" },
  { key: "safeguarding_lead_contact", label: "Safeguarding Lead contact" },
  { key: "complaints_last_year", label: "Formal complaints last academic year", type: "number" },
  { key: "registration_body", label: "Registration body" },
  { key: "registration_number", label: "Registration number" },
  { key: "regulatory_status_note", label: "Regulatory status note", type: "textarea" },
  { key: "headteacher_name", label: "Headteacher name" },
  { key: "headteacher_welcome_quote", label: "Headteacher welcome quote (homepage + About)", type: "textarea", hint: "Only shown publicly once this is filled in." },
];

export function SiteSettingsEditor() {
  const supabase = getSupabaseClient();
  const [row, setRow] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("site_settings").select("*").eq("id", true).maybeSingle().then(({ data }) => {
      const r = (data as Row) || null;
      if (!r) return setRow(null);
      const filled = { ...r };
      for (const k of DEFAULT_KEYS) filled[k] = withDefault(r[k], D[k]);
      setRow(filled);
    });
  }, [supabase]);

  async function save() {
    if (!supabase || !row) return;
    setSaving(true);
    setMessage(null);
    const { id: _id, ...payload } = row as Row & { id?: unknown };
    void _id;
    for (const k of DEFAULT_KEYS) payload[k] = toStored(row[k], D[k]);
    const { error } = await supabase.from("site_settings").update(payload).eq("id", true);
    if (error) {
      setSaving(false);
      setMessage(`Could not save: ${error.message}`);
      return;
    }
    const publishMessage = await triggerPublish();
    setSaving(false);
    setMessage(publishMessage);
  }

  if (!row) return <p className="text-sm text-ink/65">Loading…</p>;

  return (
    <Card title="Site settings" description="Contact details, fees, Open Evening links and key public-facing figures. Fields that already show text on the website are filled with that text; edit it and Save to change the site.">
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className={`text-sm text-ink ${f.type === "textarea" ? "sm:col-span-2" : ""}`}>
            <span>
              {f.label}
              {hasDefault(f.key) && (() => {
                const k: DefaultKey = f.key as DefaultKey;
                const same = ((row[k] as string) || "").trim() === D[k];
                return (
                  <>
                    <DefaultBadge isDefault={same} />
                    <ResetLink show={!same} onReset={() => setRow({ ...row, [k]: D[k] })} />
                  </>
                );
              })()}
            </span>
            {f.type === "textarea" ? (
              <textarea
                value={(row[f.key] as string) || ""}
                onChange={(e) => setRow({ ...row, [f.key]: e.target.value })}
                rows={3}
                className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
              />
            ) : (
              <input
                type={f.type === "number" ? "number" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text"}
                value={(row[f.key] as string | number) ?? ""}
                onChange={(e) => setRow({ ...row, [f.key]: f.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value })}
                className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
              />
            )}
            {f.hint && <span className="mt-0.5 block text-xs text-ink/65">{f.hint}</span>}
          </label>
        ))}
      </div>
      <button type="button" onClick={save} disabled={saving} className="mt-6 rounded-full bg-gold-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-60">
        {saving ? "Saving…" : "Save"}
      </button>
      {message && <p className="mt-2 text-sm text-ink/70">{message}</p>}
    </Card>
  );
}
