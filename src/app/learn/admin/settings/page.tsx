"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { learnRoleLabel, STAFF_ROLES, useLearnSession } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { FormSection, LoadingState, Switch, ui } from "@/components/learn/ui";
import { Microsoft365Connection } from "@/components/learn/settings/Microsoft365Connection";
import { AiUsage } from "@/components/learn/settings/AiUsage";
import { SchoolFeatures } from "@/components/learn/settings/SchoolFeatures";
import { triggerPublish } from "@/lib/learn/publishSiteContent";

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

/** One settings group. Each opens in place (only School details starts
 * open), so the page is a short list of headings rather than one long form. */
function Section({ title, hint, children, onSave, busy, message, defaultOpen = false, guide }: { title: string; hint: string; children: React.ReactNode; onSave?: () => void; busy?: boolean; message?: string | null; defaultOpen?: boolean; guide?: string }) {
  const bad = !!message && message !== "Saved." && !message.startsWith("Saved");
  return (
    <details open={defaultOpen} data-guide={guide} className="group rounded-2xl border border-gold-light bg-white">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-5 py-4">
        <span>
          <span className="block text-base font-semibold text-ink">{title}</span>
          <span className="mt-0.5 block text-sm text-ink/65">{hint}</span>
        </span>
        <span aria-hidden="true" className="mt-1 text-lg leading-none text-ink/50 transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-gold-light px-5 py-5">{children}</div>
      {onSave && (
        <div className="flex flex-wrap items-center gap-3 border-t border-gold-light px-5 py-3">
          <button type="button" disabled={busy} onClick={onSave} className={ui.btnPrimary}>
            {busy ? "Saving…" : "Save changes"}
          </button>
          {message && <p role={bad ? "alert" : "status"} className={`text-sm ${bad ? "text-red-700" : "text-ink/70"}`}>{message}</p>}
        </div>
      )}
    </details>
  );
}

/** A whole number from a text box, or null when it isn't one in range. */
function wholeNumber(v: string | number, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
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
  const [loadFailed, setLoadFailed] = useState(false);
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
      .then(({ data }) => {
        // No row (or no access) used to leave a grey placeholder for ever.
        if (!data) setLoadFailed(true);
        else setS(data as SchoolSettings);
      });
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
    if (error) {
      setBusy(false);
      return setMsg("Couldn't save. Only a full Admin can change the school details.");
    }
    // These details are printed on the public website, which is a static
    // build: without a rebuild the change never reached the site.
    setMsg(await triggerPublish());
    setBusy(false);
  };

  if (loadFailed) return <Section title="School details" hint="Couldn't load these. Only a Headteacher or Admin can see them.">{null}</Section>;
  if (!s) return <LoadingState rows={3} />;
  const set = (k: keyof SchoolSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS({ ...s, [k]: e.target.value || null });
  return (
    <Section title="School details" hint="Shown on the website and in emails to families. Also editable under Website content, Site settings." onSave={save} busy={busy} message={msg} defaultOpen guide="settings-form">
      <FormSection title="Contact" description="How families reach the school.">
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
        </div>
      </FormSection>
      <FormSection title="Safeguarding" description="Shown on the website's safeguarding page and in emails, so families know who to contact with a concern.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Safeguarding lead (name)">
            <input className={inputCls} value={s.safeguarding_lead_name || ""} onChange={set("safeguarding_lead_name")} />
          </Field>
          <Field label="Safeguarding lead (contact)">
            <input className={inputCls} value={s.safeguarding_lead_contact || ""} onChange={set("safeguarding_lead_contact")} />
          </Field>
        </div>
      </FormSection>
    </Section>
  );
}

function LessonSettings() {
  const [s, setS] = useState<Record<keyof LmsSettings, string> | null>(null);
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
        if (data) {
          const d = data as LmsSettings;
          setS({
            recording_retention_days: String(d.recording_retention_days),
            absence_alert_delay_minutes: String(d.absence_alert_delay_minutes),
            unexplained_absence_threshold: String(d.unexplained_absence_threshold),
            unexplained_absence_period_days: String(d.unexplained_absence_period_days),
          });
        }
        else setLoadError(error ? "Couldn't load these settings. Please refresh the page." : "You don't have access to these settings.");
      });
  }, []);

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !s) return;
    // Text boxes used to be saved as Number(...), so a cleared box became 0
    // (delete recordings after 0 days) and letters became NaN.
    const values = {
      recording_retention_days: wholeNumber(s.recording_retention_days, 1, 3650),
      absence_alert_delay_minutes: wholeNumber(s.absence_alert_delay_minutes, 0, 1440),
      unexplained_absence_threshold: wholeNumber(s.unexplained_absence_threshold, 1, 100),
      unexplained_absence_period_days: wholeNumber(s.unexplained_absence_period_days, 1, 365),
    };
    if (values.recording_retention_days === null) return setMsg("Recording retention must be a whole number of days, at least 1.");
    if (values.absence_alert_delay_minutes === null) return setMsg("Absence alert delay must be a whole number of minutes, 0 to 1440.");
    if (values.unexplained_absence_threshold === null) return setMsg("The number of unexplained absences must be a whole number, at least 1.");
    if (values.unexplained_absence_period_days === null) return setMsg("The number of days must be a whole number, 1 to 365.");
    setBusy(true);
    setMsg(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("lms_settings").update({ ...values, updated_by: user?.id, updated_at: new Date().toISOString() }).eq("id", true);
    setBusy(false);
    setMsg(error ? "Couldn't save. Only a Headteacher or Admin can change this." : "Saved.");
  };

  if (loadError) return <Section title="Lessons and attendance" hint={loadError}>{null}</Section>;
  if (!s) return <LoadingState rows={3} />;
  const num = (k: keyof LmsSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: e.target.value });
  return (
    <Section title="Lessons and attendance" hint="When parents are told about absences, and how long recordings are kept." onSave={save} busy={busy} message={msg}>
      <FormSection title="Recordings">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Recording retention (days)" help="Older recordings are deleted automatically each night.">
            <input type="text" inputMode="numeric" className={inputCls} value={s.recording_retention_days} onChange={num("recording_retention_days")} />
          </Field>
        </div>
      </FormSection>
      <FormSection title="Absence alerts" description="When families are emailed about a missed lesson, and when the Safeguarding Lead is told about a pattern.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Absence alert delay (minutes)" help="After a lesson ends with no register, parents are emailed.">
            <input type="text" inputMode="numeric" className={inputCls} value={s.absence_alert_delay_minutes} onChange={num("absence_alert_delay_minutes")} />
          </Field>
          <div className="hidden sm:block" aria-hidden="true" />
          <Field label="Unexplained absences before an alert" help="The Safeguarding Lead is alerted at this number…">
            <input type="text" inputMode="numeric" className={inputCls} value={s.unexplained_absence_threshold} onChange={num("unexplained_absence_threshold")} />
          </Field>
          <Field label="…within this many days">
            <input type="text" inputMode="numeric" className={inputCls} value={s.unexplained_absence_period_days} onChange={num("unexplained_absence_period_days")} />
          </Field>
        </div>
      </FormSection>
    </Section>
  );
}

function MessagingSettings() {
  const [days, setDays] = useState<string | null>(null);
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
      .then(({ data }) => {
        const d = (data as { message_retention_days: number } | null)?.message_retention_days;
        setDays(d == null ? null : String(d));
      });
  }, []);

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || days === null) return;
    const n = wholeNumber(days, 30, 3650);
    if (n === null) return setMsg("Keep messages for at least 30 days (whole days, up to 3650).");
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("messaging_settings").update({ message_retention_days: n }).eq("id", true);
    setBusy(false);
    setMsg(error ? "Couldn't save. Only a Headteacher or Admin can change this." : "Saved.");
  };

  if (days === null) return null;
  return (
    <Section title="Messages" hint="Staff and parents can message each other. Students have no private messaging." onSave={save} busy={busy} message={msg}>
      <Field label="Keep messages for (days)" help="Conversations with no new messages for this long are deleted automatically. 730 days is about two school years.">
        <input type="text" inputMode="numeric" className={`${inputCls} max-w-xs`} value={days} onChange={(e) => setDays(e.target.value)} />
      </Field>
    </Section>
  );
}

type ClockInSettings = { require_clock_in: boolean; clock_in_roles: string[]; auto_clock_out_hours: number | string };

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
    const hours = wholeNumber(s.auto_clock_out_hours, 1, 48);
    if (hours === null) return setMsg("Automatic clock-out must be a whole number of hours, 1 to 48.");
    if (s.require_clock_in && s.clock_in_roles.length === 0) return setMsg("Choose at least one role that must clock in, or switch clock-in off.");
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("lms_settings").update({ ...s, auto_clock_out_hours: hours, updated_at: new Date().toISOString() }).eq("id", true);
    setBusy(false);
    setMsg(error ? "Couldn't save. Only a Headteacher or Admin can change this." : "Saved.");
  };

  if (!s) return null;
  return (
    <Section title="Staff clock-in" hint="Staff who must clock in see a clock-in screen instead of the portal until they do." onSave={save} busy={busy} message={msg}>
      <div className="space-y-4">
        <div className="-mx-3">
          <Switch checked={s.require_clock_in} onChange={(v) => setS({ ...s, require_clock_in: v })} label="Require staff to clock in before using the portal" />
        </div>
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
        <Field label="Clock out automatically after (hours)" help="A shift left open this long is closed automatically at that length, so a forgotten clock-out doesn't run on.">
          <input type="text" inputMode="numeric" className={`${inputCls} max-w-xs`} value={s.auto_clock_out_hours} onChange={(e) => setS({ ...s, auto_clock_out_hours: e.target.value })} />
        </Field>
      </div>
    </Section>
  );
}

/** School features: only the Headteacher and Admin can change them (admissions staff can see them). */
function SchoolFeaturesSection() {
  const { roles } = useLearnSession();
  return <SchoolFeatures canChange={roles.some((r) => r.role === "head_teacher" || r.role === "admin")} />;
}

function Shortcuts() {
  const links = [
    { href: "/admin/people", title: "Accounts", text: "Add students, parents, teachers and admins." },
    { href: "/admin/calendar", title: "Calendar and terms", text: "Term dates, half terms, INSET days and closures used by the portal." },
    { href: "/admin/documents", title: "Policies and signatures", text: "Policies and who needs to sign them." },
    { href: "/admin/compliance", title: "Safeguarding and compliance", text: "Keyword alerts, records and audit log." },
    { href: "/account", title: "Your account", text: "Change your password and sign-in details." },
  ];
  return (
    <Section title="Related pages" hint="Other places school-wide things are managed. Academic setup and the website are in the tabs above.">
      <ul className="grid gap-3 sm:grid-cols-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="block rounded-xl border border-gold-light p-4 hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
              <span className="block text-sm font-semibold text-ink">{l.title}</span>
              <span className="mt-0.5 block text-sm text-ink/65">{l.text}</span>
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
        <PageHeader title="Settings" subtitle="School features, school details, alerts, retention, staff clock-in and connections. Open a section to change it." />
        <div className="space-y-5">
          <SchoolFeaturesSection />
          <SchoolDetails />
          <LessonSettings />
          <MessagingSettings />
          <ClockInSettingsSection />
          <Microsoft365Connection />
          <AiUsage />
          <Shortcuts />
        </div>
      </LearnGate>
    </section>
  );
}
