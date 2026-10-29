"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Card } from "@/components/learn/Card";
import { triggerPublish } from "@/lib/learn/publishSiteContent";
import { siteSettingsDefaults as D, withDefault, toStored } from "@/content/defaults";
import { DefaultBadge, ResetLink } from "./DefaultField";
import { LoadProblem, SaveBar } from "./SaveBar";
import { ui } from "@/components/learn/ui";

type Row = {
  launch_date: string | null;
  cta_primary_label: string | null;
  cta_primary_href: string | null;
  application_fee: number | null;
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
  policies_intro: string | null;
  policies_accessible_formats_note: string | null;
  sample_lesson_video_url: string | null;
  sample_lesson_note: string | null;
};

const DEFAULT_KEYS = ["cta_primary_label", "cta_primary_href", "admissions_email"] as const;
type DefaultKey = (typeof DEFAULT_KEYS)[number];
const hasDefault = (k: keyof Row): k is DefaultKey => (DEFAULT_KEYS as readonly string[]).includes(k);

type FieldDef = { key: keyof Row; label: string; type?: "text" | "number" | "textarea" | "email" | "url"; hint?: string };

// Grouped so the form reads as a few short sections instead of 26 fields in
// one grid. Fee figures live in the Fees tab only (they used to be editable
// here too, and the two copies could overwrite each other).
const SECTIONS: { title: string; hint?: string; open?: boolean; fields: FieldDef[] }[] = [
  {
    title: "Contact details",
    open: true,
    fields: [
      { key: "admissions_email", label: "Admissions email", type: "email" },
      { key: "contact_phone", label: "Contact phone" },
      { key: "opening_hours", label: "Opening hours" },
      { key: "portal_url", label: "Portal URL", type: "url" },
      { key: "contact_address", label: "Contact address", type: "textarea" },
    ],
  },
  {
    title: "Homepage button and headteacher",
    fields: [
      { key: "cta_primary_label", label: "Homepage primary button label" },
      { key: "cta_primary_href", label: "Homepage primary button link" },
      { key: "headteacher_name", label: "Headteacher name" },
      { key: "headteacher_welcome_quote", label: "Headteacher welcome quote (homepage + About)", type: "textarea", hint: "Only shown publicly once this is filled in." },
    ],
  },
  {
    title: "Open evening and sample lesson",
    fields: [
      { key: "booking_widget_url", label: "Open evening booking widget URL", type: "url" },
      { key: "open_evening_recording_url", label: "Open evening recording URL", type: "url" },
      { key: "sample_lesson_video_url", label: "Sample lesson video URL (hidden /sample-lesson page)", type: "url", hint: "Upload the recording to YouTube as Unlisted and paste the watch or embed link. The page is not in the menu, sitemap or search engines; the link goes in open evening confirmation emails." },
      { key: "sample_lesson_note", label: "Sample lesson caption", hint: "e.g. Year 5 Mathematics with Ustadh …, recorded October 2026." },
    ],
  },
  {
    title: "Safeguarding and regulation",
    fields: [
      { key: "safeguarding_lead_name", label: "Safeguarding Lead name" },
      { key: "safeguarding_lead_contact", label: "Safeguarding Lead contact" },
      { key: "registration_body", label: "Registration body" },
      { key: "registration_number", label: "Registration number" },
      { key: "complaints_last_year", label: "Formal complaints last academic year", type: "number" },
      { key: "regulatory_status_note", label: "Regulatory status note", type: "textarea" },
    ],
  },
  {
    title: "Policies page",
    hint: "Live immediately, no rebuild.",
    fields: [
      { key: "policies_intro", label: "Intro sentence", type: "textarea", hint: "Shown under the Policies heading." },
      { key: "policies_accessible_formats_note", label: "Accessible formats note", type: "textarea", hint: "Shown at the foot of the Policies page, e.g. how to request large print or a Word version." },
    ],
  },
];
const EDITABLE_KEYS = SECTIONS.flatMap((sec) => sec.fields.map((f) => f.key));

export function SiteSettingsEditor() {
  const supabase = getSupabaseClient();
  const [row, setRow] = useState<Row | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("site_settings").select("*").eq("id", true).maybeSingle().then(({ data }) => {
      const r = (data as Row) || null;
      if (!r) return setLoadFailed(true);
      const filled = { ...r };
      for (const k of DEFAULT_KEYS) filled[k] = withDefault(r[k], D[k]);
      setRow(filled);
      setSavedJson(JSON.stringify(filled));
    });
  }, [supabase]);

  async function save() {
    if (!supabase || !row) return;
    setSaving(true);
    setMessage(null);
    // Only the fields on this form: sending the whole row (as before) could
    // put back stale fee figures that had just been changed in the Fees tab.
    const payload: Record<string, unknown> = {};
    for (const k of EDITABLE_KEYS) payload[k] = row[k];
    for (const k of DEFAULT_KEYS) payload[k] = toStored(row[k], D[k]);
    const { error } = await supabase.from("site_settings").update(payload).eq("id", true);
    if (error) {
      setSaving(false);
      setMessage({ text: `Could not save. Please try again.`, error: true });
      return;
    }
    setSavedJson(JSON.stringify(row));
    const publishMessage = await triggerPublish();
    setSaving(false);
    setMessage({ text: publishMessage });
  }

  if (loadFailed) return <LoadProblem what="site settings" />;
  if (!row) return <p className="text-sm text-ink/65">Loading…</p>;
  const dirty = JSON.stringify(row) !== savedJson;

  const field = (f: FieldDef) => (
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
          className={`${ui.textarea} mt-1`}
        />
      ) : (
        <input
          type={f.type === "number" ? "text" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text"}
          inputMode={f.type === "number" ? "numeric" : undefined}
          value={(row[f.key] as string | number) ?? ""}
          onChange={(e) => setRow({ ...row, [f.key]: f.type === "number" ? (e.target.value.trim() === "" || !Number.isFinite(Number(e.target.value)) ? null : Number(e.target.value)) : e.target.value })}
          className={`${ui.input} mt-1`}
        />
      )}
      {f.hint && <span className="mt-0.5 block text-xs text-ink/65">{f.hint}</span>}
    </label>
  );

  return (
    <Card title="Site settings" description="Contact details, links and key public-facing details. Fields that already show text on the website are filled with that text. Fees, discounts and the application fee are in the Fees section.">
      <div className="space-y-3">
        {SECTIONS.map((sec) => (
          <details key={sec.title} open={sec.open} className="group rounded-xl border border-gold-light/60 bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink">
              <span>
                {sec.title}
                {sec.hint && <span className="ml-2 text-xs font-normal text-ink/65">{sec.hint}</span>}
              </span>
              <span aria-hidden="true" className="text-ink/50 transition-transform group-open:rotate-90">›</span>
            </summary>
            <div className="grid gap-4 border-t border-gold-light/50 px-4 py-4 sm:grid-cols-2">{sec.fields.map(field)}</div>
          </details>
        ))}
      </div>
      <SaveBar onSave={save} saving={saving} dirty={dirty} message={message?.text} error={message?.error} />
    </Card>
  );
}
