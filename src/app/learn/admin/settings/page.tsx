"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { learnRoleLabel, STAFF_ROLES } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ui } from "@/components/learn/ui";

type LmsSettings = {
  recording_retention_days: number;
  absence_alert_delay_minutes: number;
  unexplained_absence_threshold: number;
  unexplained_absence_period_days: number;
};

type SchoolSettings = {
  headteacher_name: string | null;
  admissions_email: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  opening_hours: string | null;
  safeguarding_lead_name: string | null;
  safeguarding_lead_contact: string | null;
  portal_url: string | null;
};

const SCHOOL_COLUMNS = "headteacher_name, admissions_email, contact_phone, contact_address, opening_hours, safeguarding_lead_name, safeguarding_lead_contact, portal_url";

function Section({ title, hint, children, onSave, busy, message }: { title: string; hint: string; children: React.ReactNode; onSave?: () => void; busy?: boolean; message?: string | null }) {
  return (
    <section className="rounded-2xl border border-gold-light bg-white">
      <div className="border-b border-gold-light px-5 py-4">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-sm text-ink/60">{hint}</p>
      </div>
      <div className="px-5 py-5">{children}</div>
      {onSave && (
        <div className="flex items-center gap-3 border-t border-gold-light px-5 py-3">
          <button type="button" disabled={busy} onClick={onSave} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
            {busy ? "Saving…" : "Save changes"}
          </button>
          {message && <p className="text-sm text-ink/70">{message}</p>}
        </div>
      )}
    </section>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="block font-medium text-ink">{label}</span>
      {help && <span className="block text-xs text-ink/65">{help}</span>}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

const inputCls = ui.input;

function SchoolDetails() {
  const [s, setS] = useState<SchoolSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("site_settings")
      .select(SCHOOL_COLUMNS)
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => setS((data as SchoolSettings | null) || null));
  }, []);

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !s) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase
      .from("site_settings")
      .update({ ...s, updated_at: new Date().toISOString() })
      .eq("id", true);
    setBusy(false);
    setMsg(error ? "Couldn't save. Only a full Admin can change the school details." : "Saved.");
  };

  if (!s) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  const set = (k: keyof SchoolSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS({ ...s, [k]: e.target.value || null });
  return (
    <Section title="School details" hint="Shown on the website and in emails to families." onSave={save} busy={busy} message={msg}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Headteacher name">
          <input className={inputCls} value={s.headteacher_name || ""} onChange={set("headteacher_name")} />
        </Field>
        <Field label="Admissions email">
          <input type="email" className={inputCls} value={s.admissions_email || ""} onChange={set("admissions_email")} />
        </Field>
        <Field label="Phone">
          <input className={inputCls} value={s.contact_phone || ""} onChange={set("contact_phone")} />
        </Field>
        <Field label="Office hours">
          <input className={inputCls} value={s.opening_hours || ""} onChange={set("opening_hours")} />
        </Field>
        <Field label="Address">
          <textarea rows={2} className={inputCls} value={s.contact_address || ""} onChange={set("contact_address")} />
        </Field>
        <Field label="Portal web address" help="Where families sign in.">
          <input className={inputCls} value={s.portal_url || ""} onChange={set("portal_url")} />
        </Field>
        <Field label="Safeguarding lead (name)">
          <input className={inputCls} value={s.safeguarding_lead_name || ""} onChange={set("safeguarding_lead_name")} />
        </Field>
        <Field label="Safeguarding lead (contact)">
          <input className={inputCls} value={s.safeguarding_lead_contact || ""} onChange={set("safeguarding_lead_contact")} />
        </Field>
      </div>
    </Section>
  );
}

function LessonSettings() {
  const [s, setS] = useState<LmsSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("lms_settings")
      .select("recording_retention_days, absence_alert_delay_minutes, unexplained_absence_threshold, unexplained_absence_period_days")
      .eq("id", true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (data) setS(data as LmsSettings);
        else setLoadError(error?.message || "You don't have access to these settings.");
      });
  }, []);

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !s) return;
    setBusy(true);
    setMsg(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("lms_settings").update({ ...s, updated_by: user?.id, updated_at: new Date().toISOString() }).eq("id", true);
    setBusy(false);
    setMsg(error ? `Couldn't save: ${error.message}` : "Saved.");
  };

  if (loadError) return <Section title="Lessons & attendance" hint={loadError}>{null}</Section>;
  if (!s) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  const num = (k: keyof LmsSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) });
  return (
    <Section title="Lessons & attendance" hint="When parents are told about absences, and how long recordings are kept." onSave={save} busy={busy} message={msg}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Recording retention (days)" help="Older recordings are deleted automatically each night.">
          <input type="text" inputMode="decimal" min={1} className={inputCls} value={s.recording_retention_days} onChange={num("recording_retention_days")} />
        </Field>
        <Field label="Absence alert delay (minutes)" help="After a lesson ends with no register, parents are emailed.">
          <input type="text" inputMode="decimal" min={0} className={inputCls} value={s.absence_alert_delay_minutes} onChange={num("absence_alert_delay_minutes")} />
        </Field>
        <Field label="Unexplained absences before an alert" help="The Safeguarding Lead is alerted at this number…">
          <input type="text" inputMode="decimal" min={1} className={inputCls} value={s.unexplained_absence_threshold} onChange={num("unexplained_absence_threshold")} />
        </Field>
        <Field label="…within this many days">
          <input type="text" inputMode="decimal" min={1} className={inputCls} value={s.unexplained_absence_period_days} onChange={num("unexplained_absence_period_days")} />
        </Field>
      </div>
    </Section>
  );
}

function MessagingSettings() {
  const [days, setDays] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("messaging_settings")
      .select("message_retention_days")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => setDays((data as { message_retention_days: number } | null)?.message_retention_days ?? null));
  }, []);

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || days === null) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("messaging_settings").update({ message_retention_days: days }).eq("id", true);
    setBusy(false);
    setMsg(error ? "Couldn't save." : "Saved.");
  };

  if (days === null) return null;
  return (
    <Section title="Messages" hint="Staff and parents can message each other. Students have no private messaging." onSave={save} busy={busy} message={msg}>
      <Field label="Keep messages for (days)" help="Conversations with no new messages for this long are deleted automatically. 730 days is about two school years.">
        <input type="text" inputMode="decimal" min={30} className={`${inputCls} max-w-xs`} value={days} onChange={(e) => setDays(Number(e.target.value))} />
      </Field>
    </Section>
  );
}

type ClockInSettings = { require_clock_in: boolean; clock_in_roles: string[]; auto_clock_out_hours: number };

function ClockInSettingsSection() {
  const [s, setS] = useState<ClockInSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("lms_settings")
      .select("require_clock_in, clock_in_roles, auto_clock_out_hours")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => setS((data as ClockInSettings | null) || null));
  }, []);

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !s) return;
    if (!Number.isInteger(s.auto_clock_out_hours) || s.auto_clock_out_hours < 1 || s.auto_clock_out_hours > 48) return setMsg("Auto clock-out must be 1 to 48 hours.");
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("lms_settings").update({ ...s, updated_at: new Date().toISOString() }).eq("id", true);
    setBusy(false);
    setMsg(error ? "Couldn't save. Only a Headteacher or Admin can change this." : "Saved.");
  };

  if (!s) return null;
  return (
    <Section title="Staff clock-in" hint="Staff who must clock in see a clock-in screen instead of the portal until they do." onSave={save} busy={busy} message={msg}>
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" checked={s.require_clock_in} onChange={(e) => setS({ ...s, require_clock_in: e.target.checked })} />
          Require staff to clock in before using the portal
        </label>
        <fieldset className="text-sm">
          <legend className="mb-1 font-medium text-ink">Who must clock in</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {STAFF_ROLES.map((r) => (
              <label key={r} className="flex items-center gap-2 text-ink/80">
                <input
                  type="checkbox"
                  checked={s.clock_in_roles.includes(r)}
                  onChange={(e) => setS({ ...s, clock_in_roles: e.target.checked ? [...s.clock_in_roles, r] : s.clock_in_roles.filter((x) => x !== r) })}
                />
                {learnRoleLabel(r)}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Auto clock-out after (hours)" help="A shift left open this long is closed automatically at that length, so a forgotten clock-out doesn't run on.">
          <input type="text" inputMode="decimal" min={1} max={48} className={`${inputCls} max-w-xs`} value={s.auto_clock_out_hours} onChange={(e) => setS({ ...s, auto_clock_out_hours: Number(e.target.value) })} />
        </Field>
      </div>
    </Section>
  );
}

function Shortcuts() {
  const links = [
    { href: "/admin/people", title: "People & accounts", text: "Add students, parents, teachers and admins." },
    { href: "/admin/academic", title: "Academic setup", text: "Years, terms, year groups, subjects and classes. Add a Teams link per class here." },
    { href: "/admin/documents", title: "Documents & signatures", text: "Policies and who needs to sign them." },
    { href: "/admin/compliance", title: "Safeguarding & compliance", text: "Keyword alerts, records and audit log." },
    { href: "/account", title: "Your account", text: "Change your password and sign-in details." },
  ];
  return (
    <Section title="Quick links" hint="Other places school-wide things are managed.">
      <ul className="grid gap-3 sm:grid-cols-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="block rounded-xl border border-gold-light p-4 hover:bg-cream">
              <span className="block text-sm font-semibold text-ink">{l.title}</span>
              <span className="mt-0.5 block text-sm text-ink/60">{l.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default function AdminSettingsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <PageHeader title="Settings" subtitle="School details, alerts, retention and shortcuts." />
        <div className="space-y-5">
          <SchoolDetails />
          <LessonSettings />
          <MessagingSettings />
          <ClockInSettingsSection />
          <Shortcuts />
        </div>
      </LearnGate>
    </section>
  );
}
