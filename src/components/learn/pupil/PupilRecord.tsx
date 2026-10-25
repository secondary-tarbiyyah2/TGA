"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  CONTACT_SELECT,
  DETAILS_SELECT,
  ProgressBar,
  ageFromDob,
  completeness,
  formatDob,
  formatStamp,
  medicalAlerts,
  meaningful,
  type Acknowledgement,
  type EmergencyContact,
  type PupilDetails,
} from "./data";
import { Tabs } from "@/components/learn/Tabs";

export type RecordChild = { id: string; name: string; dob: string | null; yearGroup: string | null; classes: string[] };
type Tab = "basics" | "health" | "contacts" | "consents" | "acks";

/**
 * Read-only pupil record for staff. Loads the child's details and contacts
 * (RLS decides what a teacher may see) and records the view in the audit
 * log. `showAcks` adds the teacher acknowledgements tab (Headteacher/admin).
 * Every section is also rendered when printing, whichever tab is open.
 */
export type RecordData = {
  details: PupilDetails | null;
  contacts: EmergencyContact[];
  acks: Acknowledgement[];
  loaded: boolean;
  error: string | null;
};

/** Loads one pupil's record (RLS decides what a teacher may see) and logs the view, once per pupil. */
export function usePupilRecordData(childId: string, { teacherView = false, showAcks = false }: { teacherView?: boolean; showAcks?: boolean } = {}, onLoaded?: (d: PupilDetails | null, contacts: EmergencyContact[]) => void): RecordData {
  const [state, setState] = useState<RecordData>({ details: null, contacts: [], acks: [], loaded: false, error: null });
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const [d, c, a] = await Promise.all([
        teacherView
          ? supabase
              .rpc("teacher_pupil_health")
              .then((r) => ({ data: ((r.data as unknown as PupilDetails[]) || []).find((x) => x.child_id === childId) || null, error: r.error }))
          : supabase.from("pupil_details").select(DETAILS_SELECT).eq("child_id", childId).maybeSingle(),
        supabase.from("pupil_emergency_contacts").select(CONTACT_SELECT).eq("child_id", childId).order("priority"),
        showAcks
          ? supabase.from("pupil_detail_acknowledgements").select("id, child_id, teacher_id, acknowledged_at, details_updated_at, profiles(full_name)").eq("child_id", childId).order("acknowledged_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (cancelled) return;
      const row = (d.data as unknown as PupilDetails | null) || null;
      const list = (c.data as unknown as EmergencyContact[]) || [];
      setState({ details: row, contacts: list, acks: (a.data as unknown as Acknowledgement[]) || [], loaded: true, error: d.error || c.error ? "Some of this record couldn't load." : null });
      onLoaded?.(row, list);
      // Medical information is sensitive: record that a staff member opened it.
      void supabase.rpc("log_pupil_detail_view", { p_child_id: childId });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per pupil
  }, [childId, showAcks, teacherView]);
  return state;
}

export type RecordSection = "basics" | "health" | "contacts" | "consents" | "acks";

export function PupilRecord({
  child,
  showAcks = false,
  teacherView = false,
  onLoaded,
}: {
  child: RecordChild;
  showAcks?: boolean;
  /** Teachers see health, needs and consents only (0098); the office holds the rest. */
  teacherView?: boolean;
  onLoaded?: (d: PupilDetails | null, contacts: EmergencyContact[]) => void;
}) {
  const data = usePupilRecordData(child.id, { teacherView, showAcks }, onLoaded);
  const { details, contacts, acks, loaded, error } = data;
  const [tab, setTab] = useState<Tab>(teacherView ? "health" : "basics");

  if (!loaded) return <p className="text-sm text-ink/65">Loading…</p>;

  const progress = completeness(details, contacts.length);
  const alerts = medicalAlerts(details);
  const tabs: { key: Tab; label: string }[] = [
    ...(teacherView ? [] : [{ key: "basics" as Tab, label: "Basics" }]),
    { key: "health", label: teacherView ? "Health and needs" : "Health" },
    { key: "contacts" as Tab, label: `Address and emergency contacts (${contacts.length})` },
    { key: "consents", label: "Consents" },
    ...(showAcks ? [{ key: "acks" as Tab, label: `Teacher acknowledgements (${acks.length})` }] : []),
  ];
  const vis = (k: Tab) => (tab === k ? "" : "hidden print:block");
  const age = ageFromDob(child.dob);

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <div className="rounded-xl border border-gold-light/60 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-lg font-semibold text-ink">{child.name}</p>
            <p className="text-sm text-ink/65">
              {[child.yearGroup, child.classes.join(", "), child.dob ? `Born ${formatDob(child.dob)}${age !== null ? ` (${age})` : ""}` : ""].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {alerts.map((a) => (
              <span key={a} className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800">
                {a}
              </span>
            ))}
          </div>
        </div>
        {teacherView ? (
          <p className="mt-2 text-xs text-ink/65">
            In an emergency during a lesson: stay with the pupil on screen, call the emergency services for their address (UK 999), ask a colleague to ring the parents, then tell the DSL. See the Supporting Pupils with Medical Conditions Policy.
          </p>
        ) : (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1">
            <ProgressBar percent={progress.percent} />
          </div>
          <p className="text-xs text-ink/65">{details?.completed_at ? `Complete · ${formatStamp(details.completed_at)}` : `${progress.percent}% complete`}</p>
        </div>
        )}
        {!details && <p className="mt-2 text-sm text-amber-800">The family hasn&apos;t started this record yet.</p>}
      </div>

      <Tabs items={tabs} value={tab} onChange={setTab} label="Pupil record sections" className="print:hidden" />

      <RecordSections data={data} teacherView={teacherView} showAcks={showAcks} visible={(k) => vis(k)} />
    </div>
  );
}

/** The record's sections. `visible` returns extra classes per section (e.g. "hidden print:block" for the tabs not open). */
export function RecordSections({
  data,
  teacherView = false,
  showAcks = false,
  only,
  visible = () => "",
}: {
  data: RecordData;
  teacherView?: boolean;
  showAcks?: boolean;
  /** Render just these sections. */
  only?: RecordSection[];
  visible?: (k: RecordSection) => string;
}) {
  const { details, contacts, acks } = data;
  const vis = (k: RecordSection) => (only && !only.includes(k) ? "hidden" : visible(k));
  return (
    <>
      {!teacherView && (
      <Section title="Basics" className={vis("basics")}>
        <Row label="Gender" value={details?.gender === "male" ? "Male" : details?.gender === "female" ? "Female" : ""} />
        <Row label="Home address" value={[details?.address_line1, details?.address_line2, details?.town, details?.postcode].filter(Boolean).join(", ")} />
        <Row label="Home language" value={details?.home_language} />
        <Row label="Ethnicity" value={details?.ethnicity} />
        <Row label="Previous school" value={details?.previous_school} />
        <Row label="Siblings at the school" value={details?.siblings_at_school} />
      </Section>
      )}

      <Section title="Health" className={vis("health")}>
        {!teacherView && <Row label="GP" value={[details?.gp_name, details?.gp_phone].filter(Boolean).join(" · ")} />}
        <Row label="Medical conditions" value={details?.medical_conditions} alert={meaningful(details?.medical_conditions)} />
        <Row label="Allergies" value={details?.allergies} alert={meaningful(details?.allergies)} />
        <Row label="Medication" value={details?.medication} alert={meaningful(details?.medication)} />
        <Row label="Dietary needs" value={details?.dietary_needs} />
        <Row label="Additional needs" value={details?.sen_notes} />
        <Row label="Parent confirmed" value={details?.health_confirmed ? "Yes" : "No"} />
      </Section>

      {(
      <Section title={teacherView ? "Address and emergency contacts" : "Emergency contacts"} className={vis("contacts")}>
        {teacherView && <Row label="Home address" value={[details?.address_line1, details?.address_line2, details?.town, details?.postcode].filter(Boolean).join(", ")} />}
        {contacts.length === 0 ? (
          <p className="text-sm text-amber-800">No emergency contacts yet.</p>
        ) : (
          <ol className="space-y-2">
            {contacts.map((c, i) => (
              <li key={c.id} className="rounded-lg border border-gold-light/60 p-3 text-sm">
                <p className="font-medium text-ink">
                  {i + 1}. {c.name} <span className="font-normal text-ink/65">· {c.relationship}</span>
                </p>
                <p className="text-ink/80">
                  <a href={`tel:${c.phone.replace(/\s+/g, "")}`} className="underline">
                    {c.phone}
                  </a>
                  {c.alt_phone ? ` · ${c.alt_phone}` : ""}
                  {c.email ? ` · ${c.email}` : ""}
                </p>
                <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
                  {c.is_authorised_collector && <span className="rounded-full bg-teal-50 px-2 py-0.5 font-medium text-teal-800">Can collect</span>}
                  {c.parental_responsibility && <span className="rounded-full bg-cream px-2 py-0.5 font-medium text-ink/70">Parental responsibility</span>}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Section>
      )}

      <Section title="Consents" className={vis("consents")}>
        <Row label="Photographs" value={details?.photo_consent == null ? "" : details.photo_consent ? "Yes" : "No"} />
        <Row label="Trips and visits" value={details?.trip_consent == null ? "" : details.trip_consent ? "Yes" : "No"} />
        <Row label="Last updated" value={formatStamp(details?.updated_at)} />
      </Section>

      {showAcks && (
        <Section title="Teacher acknowledgements" className={vis("acks")}>
          {acks.length === 0 ? (
            <p className="text-sm text-ink/65">No teacher has acknowledged this record yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm text-ink">
              {acks.map((a) => {
                const stale = details && a.details_updated_at && new Date(details.updated_at).getTime() > new Date(a.details_updated_at).getTime() + 1000;
                return (
                  <li key={a.id}>
                    {a.profiles?.full_name || "Teacher"} <span className="text-ink/65">· {formatStamp(a.acknowledged_at)}</span>
                    {stale ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">Record changed since</span> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}
    </>
  );
}

function Section({ title, className, children }: { title: string; className: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-xl border border-gold-light/60 bg-white p-4 print:break-inside-avoid ${className}`}>
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value, alert }: { label: string; value: string | null | undefined; alert?: boolean }) {
  return (
    <div className="grid gap-0.5 border-t border-gold-light/40 py-2 first:border-t-0 sm:grid-cols-[11rem_1fr]">
      <p className="text-xs font-medium uppercase tracking-wide text-ink/65">{label}</p>
      <p className={`whitespace-pre-wrap text-sm ${alert ? "font-semibold text-red-800" : "text-ink"}`}>{value && value.trim() ? value : <span className="font-normal text-ink/65">Not given</span>}</p>
    </div>
  );
}
