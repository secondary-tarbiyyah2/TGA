"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  PIPELINE_STATUSES,
  SIDELINE_STATUSES,
  STATUS_LABELS,
  ageFromDob,
  type ApplicationPatch,
  type ApplicationRow,
  type ApplicationStatus,
} from "@/components/admissions/applicationShared";

export type StaffOption = { profile_id: string; display_name: string };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}

/** ISO timestamp -> value for <input type="datetime-local"> in the browser's zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[11rem_1fr] sm:gap-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink/50">{label}</dt>
      <dd className="whitespace-pre-wrap break-words text-sm text-ink">{children || <span className="text-ink/40">Not given</span>}</dd>
    </div>
  );
}

export function ApplicationDrawer({
  app,
  staff,
  onClose,
  onMove,
  onPatch,
}: {
  app: ApplicationRow;
  staff: StaffOption[];
  onClose: () => void;
  onMove: (id: string, status: ApplicationStatus) => Promise<void>;
  onPatch: (id: string, patch: ApplicationPatch) => Promise<boolean>;
}) {
  const [notes, setNotes] = useState(app.notes || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [assessmentAt, setAssessmentAt] = useState(toLocalInput(app.assessment_at));
  const [interviewAt, setInterviewAt] = useState(toLocalInput(app.interview_at));
  const [decisionNote, setDecisionNote] = useState(app.decision_note || "");
  const [savingProcess, setSavingProcess] = useState(false);
  const [processMsg, setProcessMsg] = useState<string | null>(null);
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

  const processDirty =
    assessmentAt !== toLocalInput(app.assessment_at) ||
    interviewAt !== toLocalInput(app.interview_at) ||
    decisionNote !== (app.decision_note || "");

  async function saveProcess() {
    setSavingProcess(true);
    setProcessMsg(null);
    const ok = await onPatch(app.id, {
      assessment_at: fromLocalInput(assessmentAt),
      interview_at: fromLocalInput(interviewAt),
      decision_note: decisionNote.trim() === "" ? null : decisionNote,
    });
    setSavingProcess(false);
    setProcessMsg(ok ? "Saved." : "Couldn't save. Please try again.");
  }

  async function toggleFlag(key: "report_received" | "deposit_received" | "id_documents_received", value: boolean) {
    setProcessMsg(null);
    const ok = await onPatch(app.id, { [key]: value } as ApplicationPatch);
    if (!ok) setProcessMsg("Couldn't update that. Please try again.");
  }

  async function assign(profileId: string) {
    setMsg(null);
    const ok = await onPatch(app.id, { assigned_to: profileId === "" ? null : profileId });
    if (!ok) setMsg("Couldn't change the assignee. Please try again.");
  }

  const childName = `${app.child_first_name} ${app.child_last_name}`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-modal="true" aria-labelledby="app-drawer-title" className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gold-light/50 bg-white p-5">
          <div>
            <h2 id="app-drawer-title" className="font-serif text-xl font-semibold text-ink">{childName}</h2>
            <p className="text-xs text-ink/60">
              {app.reference || "No reference"} · received {fmtDate(app.created_at)} · {STATUS_LABELS[app.status]}
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="rounded-lg border border-gold-light px-3 py-1.5 text-sm text-ink/80 hover:bg-cream">
            Close
          </button>
        </div>

        <div className="space-y-6 p-5">
          <section aria-label="Stage">
            <p className="mb-2 text-sm font-medium text-ink">Stage</p>
            <div className="flex flex-wrap gap-2">
              {[...PIPELINE_STATUSES, ...SIDELINE_STATUSES].map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={app.status === s}
                  onClick={() => onMove(app.id, s)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${app.status === s ? "bg-teal-700 text-white" : "border border-gold-light/60 text-ink/70 hover:bg-cream"}`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </section>

          <section aria-label="Admissions process" className="rounded-xl border border-gold-light/50 bg-cream/40 p-4">
            <h3 className="mb-3 font-serif text-lg font-semibold text-ink">Admissions process</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-ink">
                Assessment
                <input type="datetime-local" value={assessmentAt} onChange={(e) => setAssessmentAt(e.target.value)} className="mt-1 block w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="block text-sm font-medium text-ink">
                Parent and student conversation
                <input type="datetime-local" value={interviewAt} onChange={(e) => setInterviewAt(e.target.value)} className="mt-1 block w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="mt-3 space-y-2">
              {([
                ["report_received", "Latest school report received", app.report_received],
                ["id_documents_received", "ID documents received", app.id_documents_received],
                ["deposit_received", "Deposit received", app.deposit_received],
              ] as const).map(([key, label, checked]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={checked} onChange={(e) => toggleFlag(key, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
            <label className="mt-3 block text-sm font-medium text-ink">
              Decision note
              <span className="ml-1 text-xs font-normal text-ink/50">(staff only)</span>
              <textarea value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} rows={3} maxLength={5000} className="mt-1 block w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2 text-sm" />
            </label>
            <div className="mt-2 flex items-center gap-3">
              <button type="button" onClick={saveProcess} disabled={savingProcess || !processDirty} className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">
                {savingProcess ? "Saving…" : "Save process"}
              </button>
              {processMsg && <span role="status" className="text-xs text-ink/70">{processMsg}</span>}
            </div>
          </section>

          <section aria-label="Assigned to">
            <label className="block text-sm font-medium text-ink">
              Assigned to
              <select
                value={app.assigned_to || ""}
                onChange={(e) => assign(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {staff.map((s) => (
                  <option key={s.profile_id} value={s.profile_id}>{s.display_name}</option>
                ))}
              </select>
            </label>
          </section>

          <section aria-label="Internal notes">
            <label className="block text-sm font-medium text-ink">
              Internal notes
              <span className="ml-1 text-xs font-normal text-ink/50">(staff only, never shown to families)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                maxLength={10000}
                className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={saveNotes}
                disabled={saving || notes === (app.notes || "")}
                className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
              >
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
              <Row label="Parent or guardian">{app.parent_name}</Row>
              <Row label="Relationship">{app.relationship}</Row>
              <Row label="Email"><a href={`mailto:${app.parent_email}`} className="text-teal-700 underline">{app.parent_email}</a></Row>
              <Row label="Phone">{app.parent_phone}</Row>
              <Row label="Address">{app.address}</Row>
              <Row label="Current school">{app.current_school}</Row>
              <Row label="Current year">{app.current_school_year}</Row>
              <Row label="Previous Islamic education">{app.previous_islamic_education}</Row>
              <Row label="SEND / medical / other">{app.send_or_medical_notes}</Row>
              <Row label="How they heard of us">{app.how_heard}</Row>
              <Row label="Sibling at a Tarbiyyah school">{app.sibling_at_tarbiyyah ? "Yes" : "No"}</Row>
              <Row label="Sibling details">{app.sibling_details}</Row>
              <Row label="Consent to contact">{app.consent_contact ? "Yes" : "No"}</Row>
              <Row label="Consent to data processing">{app.consent_data ? "Yes" : "No"}</Row>
              <Row label="Declaration signed by">{app.declaration_name}</Row>
              <Row label="Received">{new Date(app.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })}</Row>
            </dl>
          </section>
        </div>
      </aside>
    </div>
  );
}
