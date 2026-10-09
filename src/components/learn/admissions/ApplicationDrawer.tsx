"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CredentialsCard } from "@/components/learn/people/StudentCredentials";
import type { IssuedCredentials } from "@/components/learn/people/studentAccounts";
import type { CreateAccountsFn } from "@/components/learn/admissions/AcceptAccounts";
import { DocumentsPanel } from "@/components/learn/admissions/DocumentsPanel";
import { FamilyPanel, siblingBadgeText } from "@/components/learn/admissions/FamilyPanel";
import { MessagesPanel } from "@/components/learn/admissions/MessagesPanel";
import { PaymentsPanel } from "@/components/learn/admissions/PaymentsPanel";
import { ProcessPanel } from "@/components/learn/admissions/ProcessPanel";
import { useAdmissionsContext } from "@/components/learn/admissions/useAdmissionsContext";
import type { TemplateContext } from "@/components/learn/admissions/messageTemplates";
import {
  PIPELINE_STATUSES,
  SIDELINE_STATUSES,
  STATUS_LABELS,
  ageFromDob,
  type ApplicationPatch,
  type ApplicationRow,
  type ApplicationStatus,
} from "@/components/admissions/applicationShared";
import { Tabs } from "@/components/learn/Tabs";

export type MoveOptions = {
  /** Do not send the automatic email for this move (the caller has just sent it). */
  skipAutoEmail?: boolean;
  /** Do not create accounts automatically when this move is to Accepted (the caller does it itself). */
  skipAccounts?: boolean;
};

export type StaffOption = { profile_id: string; display_name: string };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[11rem_1fr] sm:gap-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink/65">{label}</dt>
      <dd className="whitespace-pre-wrap break-words text-sm text-ink">{children || <span className="text-ink/65">Not given</span>}</dd>
    </div>
  );
}

type Tab = "details" | "documents" | "process" | "payments" | "messages";
const TABS: { id: Tab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "documents", label: "Documents" },
  { id: "process", label: "Process" },
  { id: "payments", label: "Payments" },
  { id: "messages", label: "Messages" },
];

export function ApplicationDrawer({
  app,
  family,
  staff,
  credentials,
  onClose,
  onMove,
  onPatch,
  onOpenApplication,
  onCreateAccounts,
  onDismissCredentials,
}: {
  app: ApplicationRow;
  /** Every application in this child's family (including this one), first child first. Just this one when applying alone. */
  family: ApplicationRow[];
  staff: StaffOption[];
  /** Usernames and temporary passwords issued this session, shown once. */
  credentials: IssuedCredentials[];
  onClose: () => void;
  onMove: (id: string, status: ApplicationStatus, opts?: MoveOptions) => Promise<boolean>;
  onPatch: (id: string, patch: ApplicationPatch) => Promise<boolean>;
  onOpenApplication: (id: string) => void;
  onCreateAccounts: CreateAccountsFn;
  onDismissCredentials: (key: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("details");
  const [notes, setNotes] = useState(app.notes || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const admissions = useAdmissionsContext(app);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function saveNotes() {
    setSaving(true);
    setMsg(null);
    const ok = await onPatch(app.id, { notes: notes.trim() === "" ? null : notes });
    setSaving(false);
    setMsg(ok ? "Notes saved." : "Couldn't save the notes. Please try again.");
  }

  async function assign(profileId: string) {
    setMsg(null);
    const ok = await onPatch(app.id, { assigned_to: profileId === "" ? null : profileId });
    if (!ok) setMsg("Couldn't change the assignee. Please try again.");
  }

  const childName = `${app.child_first_name} ${app.child_last_name}`;
  const badge = siblingBadgeText(app, family);
  const leadApp = family.length > 1 && !app.guardian_is_other && family[0].id !== app.id ? family[0] : null;
  const staffNames = Object.fromEntries(staff.map((s) => [s.profile_id, s.display_name]));
  const templateCtx: TemplateContext = {
    details: admissions.details,
    settings: admissions.settings,
    fees: admissions.fees,
    templates: admissions.templates,
  };
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-modal="true" aria-labelledby="app-drawer-title" className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 z-10 bg-white px-5 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="app-drawer-title" className="font-serif text-xl font-semibold text-ink">{childName}</h2>
              <p className="text-xs text-ink/60">
                {app.reference || "No reference"} · received {fmtDate(app.created_at)} · {STATUS_LABELS[app.status]}
              </p>
              {badge && <span className="mt-1 inline-block rounded-full bg-gold-100 px-2.5 py-0.5 text-xs font-semibold text-gold-900">{badge}</span>}
            </div>
            <button ref={closeRef} type="button" onClick={onClose} className="rounded-lg border border-gold-light px-3 py-1.5 text-sm text-ink/80 hover:bg-cream">
              Close
            </button>
          </div>
          <div role="group" aria-label="Stage" className="mt-3 flex flex-wrap gap-1.5">
            {[...PIPELINE_STATUSES, ...SIDELINE_STATUSES].map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={app.status === s}
                onClick={() => void onMove(app.id, s)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${app.status === s ? "bg-teal-700 text-white" : "border border-gold-light/60 text-ink/70 hover:bg-cream"}`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <Tabs items={TABS.map((t) => ({ key: t.id, label: t.label }))} value={tab} onChange={setTab} label="Application sections" className="-mx-5 mt-3 px-5" />
        </div>

        <div className="p-5">
          {credentials.length > 0 && (
            <div className="mb-5 space-y-3">
              {credentials.map((c) => (
                <CredentialsCard key={c.key} creds={c} onDismiss={() => onDismissCredentials(c.key)} />
              ))}
            </div>
          )}
          {tab === "details" && (
            <div className="space-y-6">
              <section aria-label="Assigned to">
                <label className="block text-sm font-medium text-ink">
                  Assigned to
                  <select value={app.assigned_to || ""} onChange={(e) => assign(e.target.value)} className="mt-1 block w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2 text-sm">
                    <option value="">Unassigned</option>
                    {staff.map((s) => (
                      <option key={s.profile_id} value={s.profile_id}>{s.display_name}</option>
                    ))}
                  </select>
                </label>
              </section>

              {admissions.loading ? null : <FamilyPanel app={app} family={family} ctx={admissions} onOpen={onOpenApplication} />}

              <section aria-label="Internal notes">
                <label className="block text-sm font-medium text-ink">
                  Internal notes
                  <span className="ml-1 text-xs font-normal text-ink/65">(staff only, never shown to families)</span>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={10000} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
                </label>
                <div className="mt-2 flex items-center gap-3">
                  <button type="button" onClick={saveNotes} disabled={saving || notes === (app.notes || "")} className="rounded-lg bg-gold-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
                    {saving ? "Saving…" : "Save notes"}
                  </button>
                  {msg && <span role="status" className="text-xs text-ink/70">{msg}</span>}
                </div>
              </section>

              <section aria-label="Application details">
                <h3 className="mb-3 font-serif text-lg font-semibold text-ink">Application</h3>
                <dl className="space-y-3">
                  <Row label="Child">{childName}</Row>
                  <Row label="Date of birth">{`${new Date(app.child_dob).toLocaleDateString("en-GB", { timeZone: "UTC" })} (age ${ageFromDob(app.child_dob)})`}</Row>
                  <Row label="Gender">{app.child_gender}</Row>
                  <Row label="Year group applying">{app.year_group_applying}</Row>
                  <Row label="Preferred start">{app.preferred_start}</Row>
                  <Row label="Family contact">{app.parent_name}</Row>
                  <Row label="Legal parent or guardian">
                    {app.guardian_is_other
                      ? [app.guardian_name, app.guardian_relationship, app.guardian_email, app.guardian_phone, app.guardian_address].filter(Boolean).join("\n")
                      : "Same as the family contact"}
                  </Row>
                  <Row label="Relationship">{app.relationship}</Row>
                  <Row label="Email"><a href={`mailto:${app.parent_email}`} className="text-teal-700 underline">{app.parent_email}</a></Row>
                  <Row label="Phone">{app.parent_phone}</Row>
                  <Row label="Address">{app.address}</Row>
                  <Row label="Current school">{app.current_school}</Row>
                  <Row label="Current year">{app.current_school_year}</Row>
                  <Row label="Previous Islamic education">{app.previous_islamic_education}</Row>
                  <Row label="SEND / medical / other">{app.send_or_medical_notes}</Row>
                  <Row label="How they heard of us">{app.how_heard}</Row>
                  <Row label="Sibling already at a Tarbiyyah school">{app.sibling_at_tarbiyyah ? "Yes" : "No"}</Row>
                  <Row label="Sibling details">{app.sibling_details}</Row>
                  <Row label="Consent to contact">{app.consent_contact ? "Yes" : "No"}</Row>
                  <Row label="Consent to data processing">{app.consent_data ? "Yes" : "No"}</Row>
                  <Row label="Declaration signed by">{app.declaration_name}</Row>
                  <Row label="Received">{new Date(app.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })}</Row>
                </dl>
              </section>
            </div>
          )}

          {tab === "documents" && <DocumentsPanel applicationId={app.id} sharedIdFrom={leadApp ? { id: leadApp.id, childName: leadApp.child_first_name } : null} />}

          {tab === "process" &&
            (admissions.loading ? (
              <p role="status" className="text-sm text-ink/60">Loading…</p>
            ) : (
              <ProcessPanel key={app.id} app={app} ctx={admissions} staff={staff} baseCtx={templateCtx} onPatch={onPatch} onMove={onMove} onCreateAccounts={onCreateAccounts} />
            ))}

          {tab === "payments" &&
            (admissions.loading ? (
              <p role="status" className="text-sm text-ink/60">Loading…</p>
            ) : (
              <PaymentsPanel key={app.id} app={app} ctx={admissions} staffNames={staffNames} onPatch={onPatch} />
            ))}

          {tab === "messages" &&
            (admissions.loading ? (
              <p role="status" className="text-sm text-ink/60">Loading…</p>
            ) : (
              <MessagesPanel key={app.id} app={app} ctx={templateCtx} staffNames={staffNames} />
            ))}
        </div>
      </aside>
    </div>
  );
}
