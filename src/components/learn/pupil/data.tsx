// Shared types and helpers for the Pupil information module. Completeness
// rules mirror public.pupil_details_is_complete() in migration 0044; the
// database is the authority on completed_at, this is for showing "what's
// still missing" before and after saving.

export type PupilDetails = {
  id: string;
  child_id: string;
  gender: "male" | "female" | null;
  address_line1: string | null;
  address_line2: string | null;
  town: string | null;
  postcode: string | null;
  home_language: string | null;
  ethnicity: string | null;
  previous_school: string | null;
  siblings_at_school: string | null;
  gp_name: string | null;
  gp_phone: string | null;
  medical_conditions: string | null;
  allergies: string | null;
  medication: string | null;
  dietary_needs: string | null;
  sen_notes: string | null;
  health_confirmed: boolean;
  photo_consent: boolean | null;
  trip_consent: boolean | null;
  completed_at: string | null;
  completed_by: string | null;
  updated_at: string;
};

export type EmergencyContact = {
  id: string;
  child_id: string;
  name: string;
  relationship: string;
  phone: string;
  alt_phone: string | null;
  email: string | null;
  is_authorised_collector: boolean;
  parental_responsibility: boolean;
  priority: number;
};

export type Acknowledgement = {
  id: string;
  child_id: string;
  teacher_id: string;
  acknowledged_at: string;
  details_updated_at: string | null;
  profiles?: { full_name: string } | null;
};

export const DETAILS_SELECT =
  "id, child_id, gender, address_line1, address_line2, town, postcode, home_language, ethnicity, previous_school, siblings_at_school, gp_name, gp_phone, medical_conditions, allergies, medication, dietary_needs, sen_notes, health_confirmed, photo_consent, trip_consent, completed_at, completed_by, updated_at";
export const CONTACT_SELECT = "id, child_id, name, relationship, phone, alt_phone, email, is_authorised_collector, parental_responsibility, priority";

export type MissingKey = "basics" | "address" | "gp" | "health" | "contacts" | "consents";

export const MISSING_LABEL: Record<MissingKey, string> = {
  basics: "Gender missing",
  address: "No address",
  gp: "No GP",
  health: "Health not confirmed",
  contacts: "Needs 2 emergency contacts",
  consents: "Consents not given",
};

export const MISSING_CHIP: Record<MissingKey, string> = {
  basics: "Missing gender",
  address: "Missing address",
  gp: "Missing GP",
  health: "Health not confirmed",
  contacts: "Missing emergency contact",
  consents: "Missing consents",
};

const filled = (v: string | null | undefined) => !!v && v.trim() !== "";

type Check = { key: MissingKey; label: string; ok: boolean };

export function checks(d: PupilDetails | null, contactCount: number): Check[] {
  return [
    { key: "basics", label: "Gender", ok: !!d?.gender },
    { key: "address", label: "Home address", ok: filled(d?.address_line1) },
    { key: "address", label: "Postcode", ok: filled(d?.postcode) },
    { key: "gp", label: "GP name", ok: filled(d?.gp_name) },
    { key: "gp", label: "GP phone", ok: filled(d?.gp_phone) },
    { key: "health", label: "Health section checked", ok: !!d?.health_confirmed },
    { key: "contacts", label: "At least 2 emergency contacts", ok: contactCount >= 2 },
    { key: "consents", label: "Photo consent answered", ok: d?.photo_consent != null },
    { key: "consents", label: "Trip consent answered", ok: d?.trip_consent != null },
  ];
}

export function completeness(d: PupilDetails | null, contactCount: number): { percent: number; missing: MissingKey[]; items: Check[] } {
  const items = checks(d, contactCount);
  const done = items.filter((c) => c.ok).length;
  const missing = Array.from(new Set(items.filter((c) => !c.ok).map((c) => c.key)));
  return { percent: Math.round((done / items.length) * 100), missing, items };
}

const NONE = /^(none|nil|no|n\/a|na|not applicable|nothing|-)\.?$/i;

/** True when a free-text health answer says something other than "none". */
export function meaningful(v: string | null | undefined): boolean {
  return filled(v) && !NONE.test(v!.trim());
}

export function medicalAlerts(d: PupilDetails | null): string[] {
  if (!d) return [];
  const out: string[] = [];
  if (meaningful(d.allergies)) out.push("Allergies");
  if (meaningful(d.medical_conditions)) out.push("Medical");
  if (meaningful(d.medication)) out.push("Medication");
  return out;
}

export function formatStamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDob(key: string | null | undefined): string {
  if (!key) return "";
  const d = new Date(`${key}T12:00:00`);
  return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function ageFromDob(key: string | null | undefined): number | null {
  if (!key) return null;
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age;
}

export const fieldCls =
  "mt-1 w-full rounded-lg border border-gold-light bg-white px-3 py-2 text-sm text-ink focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500";

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-cream" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${percent === 100 ? "bg-green-600" : "bg-teal-600"}`} style={{ width: `${percent}%` }} />
    </div>
  );
}
