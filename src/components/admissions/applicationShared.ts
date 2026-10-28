// Shared by the public application form (/admissions/apply) and the admin
// Admissions pipeline, so the two can never disagree on stages or fields.

export const APPLICATION_STATUSES = ["new", "reviewing", "assessment", "interview", "offered", "accepted", "waitlisted", "declined", "withdrawn"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  assessment: "Assessment",
  interview: "Interview",
  offered: "Offered",
  accepted: "Accepted",
  waitlisted: "Waitlisted",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export const PIPELINE_STATUSES: ApplicationStatus[] = ["new", "reviewing", "assessment", "interview", "offered", "accepted"];
export const SIDELINE_STATUSES: ApplicationStatus[] = ["waitlisted", "declined", "withdrawn"];

// Same names as public.year_groups (migration 0018) and the existing
// application form; the label adds the age band shown elsewhere on the site.
export const YEAR_GROUP_OPTIONS: { value: string; label: string }[] = [
  { value: "Year 1", label: "Year 1 (age 5–6)" },
  { value: "Year 2", label: "Year 2 (age 6–7)" },
  { value: "Year 3", label: "Year 3 (age 7–8)" },
  { value: "Year 4", label: "Year 4 (age 8–9)" },
  { value: "Year 5", label: "Year 5 (age 9–10)" },
  { value: "Year 6", label: "Year 6 (age 10–11)" },
  { value: "Year 7", label: "Year 7 (age 11–12)" },
  { value: "Year 8", label: "Year 8 (age 12–13)" },
  { value: "Year 9", label: "Year 9 (age 13–14)" },
  { value: "Year 10", label: "Year 10 (age 14–15)" },
  { value: "Year 11", label: "Year 11 (age 15–16)" },
  { value: "Not sure yet", label: "Not sure yet" },
];

export const FALLBACK_ADMISSIONS_EMAIL = "globalacademy@tarbiyyah.co.uk";

export type ApplicationRow = {
  id: string;
  reference: string | null;
  status: ApplicationStatus;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  relationship: string | null;
  /** Whole address on one line (older rows only have this; since 0151 the form fills it from the parts below). */
  address: string | null;
  /** 0151: the pupil's home address, in parts. */
  address_line1?: string | null;
  address_line2?: string | null;
  address_town?: string | null;
  address_postcode?: string | null;
  address_country?: string | null;
  child_first_name: string;
  child_last_name: string;
  child_dob: string;
  child_gender: string | null;
  year_group_applying: string;
  preferred_start: string | null;
  current_school: string | null;
  current_school_year: string | null;
  previous_islamic_education: string | null;
  send_or_medical_notes: string | null;
  how_heard: string | null;
  sibling_at_tarbiyyah: boolean | null;
  sibling_details: string | null;
  /** 0060: intended plan, children applying together, and the others' names/year groups. */
  payment_plan_intent?: string | null;
  children_applying?: number | null;
  sibling_applicants?: { name: string; year_group: string }[] | null;
  consent_contact: boolean;
  consent_data: boolean;
  declaration_name: string;
  notes: string | null;
  assigned_to: string | null;
  assessment_at: string | null;
  interview_at: string | null;
  report_received: boolean;
  deposit_received: boolean;
  id_documents_received: boolean;
  decision_note: string | null;
  offer_made_at: string | null;
  offer_deadline: string | null;
  admin_fee_amount: number | null;
  admin_fee_received: boolean;
  admin_fee_received_at: string | null;
  deposit_amount: number | null;
  deposit_received_at: string | null;
  parent_profile_id: string | null;
  child_id: string | null;
  student_profile_id: string | null;
  accounts_created_at: string | null;
  /** 0081: sibling group (applications submitted together), this child's place in it, and an optional different legal guardian. */
  family_id?: string | null;
  sibling_index?: number | null;
  guardian_is_other?: boolean | null;
  guardian_name?: string | null;
  guardian_relationship?: string | null;
  guardian_email?: string | null;
  guardian_phone?: string | null;
  guardian_address?: string | null;
  created_at: string;
  updated_at: string;
};

/** admissions_families (0081): the shared contact record for a sibling group. */
export type FamilyRow = {
  id: string;
  lead_application_id: string | null;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  children_count: number;
  fee_snapshot: unknown;
  created_at: string;
};
export const FAMILY_COLUMNS = "id, lead_application_id, parent_name, parent_email, parent_phone, children_count, fee_snapshot, created_at";

/** Fields staff may change from the drawer (0032 notes/assignee + 0037 process tracking). */
export type ApplicationPatch = Partial<
  Pick<
    ApplicationRow,
    | "notes" | "assigned_to" | "assessment_at" | "interview_at" | "report_received" | "deposit_received" | "id_documents_received" | "decision_note"
    | "offer_made_at" | "offer_deadline" | "admin_fee_amount" | "admin_fee_received" | "admin_fee_received_at" | "deposit_amount" | "deposit_received_at"
    | "parent_profile_id" | "child_id" | "student_profile_id" | "accounts_created_at"
  >
>;

export type PipState = "none" | "scheduled" | "done";

/** Three progress pips for pipeline cards: assessment, interview, documents. */
export function processPips(a: Pick<ApplicationRow, "assessment_at" | "interview_at" | "report_received" | "id_documents_received">): { label: string; state: PipState }[] {
  const now = Date.now();
  const byDate = (iso: string | null): PipState => (!iso ? "none" : new Date(iso).getTime() <= now ? "done" : "scheduled");
  const docs: PipState = a.report_received && a.id_documents_received ? "done" : a.report_received || a.id_documents_received ? "scheduled" : "none";
  return [
    { label: "Assessment", state: byDate(a.assessment_at) },
    { label: "Interview", state: byDate(a.interview_at) },
    { label: "Documents", state: docs },
  ];
}

export const APPLICATION_COLUMNS =
  "id, reference, status, parent_name, parent_email, parent_phone, relationship, address, address_line1, address_line2, address_town, address_postcode, address_country, child_first_name, child_last_name, child_dob, child_gender, year_group_applying, preferred_start, current_school, current_school_year, previous_islamic_education, send_or_medical_notes, how_heard, sibling_at_tarbiyyah, sibling_details, payment_plan_intent, children_applying, sibling_applicants, consent_contact, consent_data, declaration_name, notes, assigned_to, assessment_at, interview_at, report_received, deposit_received, id_documents_received, decision_note, offer_made_at, offer_deadline, admin_fee_amount, admin_fee_received, admin_fee_received_at, deposit_amount, deposit_received_at, parent_profile_id, child_id, student_profile_id, accounts_created_at, family_id, sibling_index, guardian_is_other, guardian_name, guardian_relationship, guardian_email, guardian_phone, guardian_address, created_at, updated_at";

/** Age in whole years from an ISO date (yyyy-mm-dd), e.g. "7". Empty if invalid. */
export function ageFromDob(dob: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  if (!m) return "";
  const now = new Date();
  let age = now.getFullYear() - Number(m[1]);
  const beforeBirthday = now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]));
  if (beforeBirthday) age -= 1;
  return age >= 0 ? String(age) : "";
}

export const PAYMENT_PLAN_OPTIONS = [
  { value: "annual", label: "Annual (pay in full)" },
  { value: "termly", label: "2 payments" },
  { value: "monthly", label: "Monthly" },
] as const;
export type PaymentPlanIntent = (typeof PAYMENT_PLAN_OPTIONS)[number]["value"];

/** Kinds of uploaded document, tagged in the storage file name: <application_id>/<kind>-<uuid>.<ext> (migration 0060). */
export type DocumentKind = "report" | "parent_id" | "child_id" | "guardian_id" | "address_proof";
export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  report: "School report",
  parent_id: "Parent or guardian photo ID",
  child_id: "Child's passport or birth certificate",
  guardian_id: "Legal guardian's photo ID",
  address_proof: "Proof of the pupil's home address",
};
export const DOCUMENT_ACCEPT = "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";
export const MAX_ID_FILES = 3;
/** Returns the storage extension for an allowed upload, or null when the type is not allowed. */
export function documentExtension(f: { name: string; type: string }): "pdf" | "jpg" | "png" | null {
  const n = f.name.toLowerCase();
  if (f.type === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (f.type === "image/jpeg" || n.endsWith(".jpg") || n.endsWith(".jpeg")) return "jpg";
  if (f.type === "image/png" || n.endsWith(".png")) return "png";
  return null;
}
export const DOCUMENT_CONTENT_TYPES = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png" } as const;

const money = (n: number | undefined, fallback: string) => (n == null ? fallback : Number.isInteger(n) ? `£${n}` : `£${n.toFixed(2)}`);

export type ProcessOwner = "you" | "us" | "together";
export type ProcessStep = { title: string; short: string; body: string; owner: ProcessOwner };
export const PROCESS_OWNER_LABELS: Record<ProcessOwner, string> = { you: "Your part", us: "Our part", together: "Together" };

/**
 * The admissions process, in one place, so the admissions page, the apply page,
 * the success state and the strip on other pages can never disagree.
 * Fee figures come from site_settings (never hard-coded in copy).
 * Titles are in sentence case and every sentence ends with a full stop.
 */
export function admissionsProcessSteps(fees: { applicationFee?: number }): ProcessStep[] {
  const app = money(fees.applicationFee, "£50");
  return [
    {
      title: "Apply",
      owner: "you",
      short: "Complete the online form and upload your documents.",
      body: "Complete the online application form, including your child's home address, and upload photo ID for a parent or guardian, your child's passport or birth certificate, proof of your child's home address and, if you have one, a recent school report or homeschool progress record. Applying for more than one child? Add them all in the same form.",
    },
    {
      title: "We review your application",
      owner: "us",
      short: "We check your details and documents.",
      body: "The admissions team reviews your application and documents, asks your child's current school for a confidential report, and tells you if anything else is needed.",
    },
    {
      title: "Remote assessment",
      owner: "together",
      short: "A supervised online assessment. We email the details.",
      body: "Your child sits an age-appropriate assessment online, supervised with the camera on. We email you the date, time and what to prepare.",
    },
    {
      title: "Family video call",
      owner: "together",
      short: "A conversation with you and your child. Offers are normally made within three working days.",
      body: "A video call with the Headteacher or a member of the leadership team, you (the parent or guardian) and your child, about learning goals, values and any support needs. Offers are made in writing, normally within three working days of the meeting (and within ten working days of a complete application).",
    },
    {
      title: "Offer and securing your place",
      owner: "you",
      short: "We email the offer. Accept within five working days and pay your first fee payment to secure your place.",
      body: `We email you a conditional offer. To accept, reply within five working days and pay your first fee payment (the whole year, the first of two payments, or the first monthly payment) by Friday 8 January 2027, plus the application fee (${app}) if not already paid. You can cancel within 14 days of accepting, as the Fees Policy explains.`,
    },
    {
      title: "Welcome",
      owner: "us",
      short: "We create your accounts; induction week runs 4 to 8 January.",
      body: "We create your parent and pupil accounts, email you the sign-in details, and welcome your child to induction week (4 to 8 January 2027) to set up accounts, test devices and meet teachers, ahead of the first live lessons on Monday 11 January 2027.",
    },
  ];
}

export const GENDER_OPTIONS = ["Male", "Female"] as const;

export const MAX_REPORT_FILES = 5;
export const MAX_REPORT_BYTES = 10 * 1024 * 1024;
export const DOCUMENTS_BUCKET = "admissions-documents";

// ── date of birth and year group ─────────────────────────────────────────

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

/**
 * The academic year families are applying for, by its starting year: 2026
 * means 2026/27 (1 September 2026 to 31 August 2027; the Academy opens in
 * January 2027 part way through it). Change this one number for the next intake.
 */
export const ENTRY_ACADEMIC_YEAR = 2026;

/**
 * "YYYY-MM-DD" for a real calendar date typed as day, month (1 to 12) and a
 * four-digit year, or "" if any part is missing or the date does not exist
 * (31 February, say). Built by hand, never with Date parsing, so the result
 * never shifts with the browser's time zone or locale.
 */
export function isoFromDayMonthYear(day: string, month: string, year: string): string {
  const d = Number(day.trim());
  const m = Number(month.trim());
  const y = year.trim();
  if (!/^\d{1,2}$/.test(day.trim()) || !Number.isInteger(m) || m < 1 || m > 12 || !/^\d{4}$/.test(y)) return "";
  const daysInMonth = new Date(Date.UTC(Number(y), m, 0)).getUTCDate();
  if (d < 1 || d > daysInMonth) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "2018-03-14" as "14 March 2018" (British order, month by name). Empty if not a date. */
export function formatDateLong(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  return `${Number(m[3])} ${MONTH_NAMES[Number(m[2]) - 1] ?? ""} ${m[1]}`.trim();
}

/** The earliest and latest dates of birth for Year 11 and Year 1 in the entry year. */
export function yearGroupBirthRange(entryYear: number = ENTRY_ACADEMIC_YEAR): { oldest: string; youngest: string } {
  // Year N in academic year E/E+1: born 1 Sep (E-5-N) to 31 Aug (E-4-N).
  return { oldest: `${entryYear - 16}-09-01`, youngest: `${entryYear - 5}-08-31` };
}

export type YearGroupSuggestion =
  | { kind: "ok"; yearGroup: string; entryYear: number }
  | { kind: "too_young"; entryYear: number }
  | { kind: "too_old"; entryYear: number };

/**
 * The English school year for a date of birth (yyyy-mm-dd), using the
 * 1 September cut-off: a child is in Year N in academic year E/E+1 when born
 * between 1 September (E-5-N) and 31 August (E-4-N). For 2026/27 that makes
 * Year 1 born 1 Sep 2020 to 31 Aug 2021 and Year 11 born 1 Sep 2010 to
 * 31 Aug 2011 (the same rule state schools in England use). Equivalently, the
 * child's age on 31 August E, minus 4. The Academy teaches Year 1 to Year 11
 * only, so anything outside that comes back as too_young or too_old.
 * Returns null when the date is not valid.
 */
export function suggestYearGroup(dob: string, entryYear: number = ENTRY_ACADEMIC_YEAR): YearGroupSuggestion | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const [by, bm] = [Number(m[1]), Number(m[2])];
  if (bm < 1 || bm > 12) return null;
  // Born 1 September or later: one year younger on the 31 August cut-off.
  const ageOn31Aug = entryYear - by - (bm >= 9 ? 1 : 0);
  const year = ageOn31Aug - 4;
  if (year < 1) return { kind: "too_young", entryYear };
  if (year > 11) return { kind: "too_old", entryYear };
  return { kind: "ok", yearGroup: `Year ${year}`, entryYear };
}

/** Why an application should not yet move to Accepted (empty = fine). */
export function acceptanceBlockers(a: Pick<ApplicationRow, "deposit_received">): string[] {
  // There is no registration fee: the first fee payment is the only condition of acceptance.
  // (admin_fee_* columns are legacy and no longer checked.)
  const out: string[] = [];
  if (!a.deposit_received) out.push("first fee payment");
  return out;
}

export function formatMoney(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : `\u00a3${Number(n).toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2 })}`;
}

// ── the pupil's home address (0151) ──────────────────────────────────────

export type AddressParts = {
  address_line1?: string | null;
  address_line2?: string | null;
  address_town?: string | null;
  address_postcode?: string | null;
  address_country?: string | null;
};

/**
 * Countries (as spelled in src/lib/countries.ts) with no postcode system in
 * general use, so the form does not insist on one. Everywhere else the
 * postcode or ZIP is required.
 */
export const COUNTRIES_WITHOUT_POSTCODES: readonly string[] = [
  "Angola", "Bahamas", "Belize", "Benin", "Botswana", "Burkina Faso", "Burundi", "Cameroon", "Central African Republic", "Chad",
  "Comoros", "Congo", "Djibouti", "Dominica", "Equatorial Guinea", "Eritrea", "Fiji", "Gambia", "Ghana", "Grenada", "Guyana",
  "Hong Kong", "Kiribati", "Libya", "Mali", "Mauritania", "Palau", "Qatar", "Rwanda", "Samoa", "Seychelles",
  "Sierra Leone", "Solomon Islands", "Somalia", "South Sudan", "Suriname", "Syria", "Timor-Leste", "Togo", "Tonga",
  "Trinidad and Tobago", "Tuvalu", "Uganda", "United Arab Emirates", "Vanuatu", "Yemen", "Zimbabwe",
];

/** True when the postcode may be left blank for this country (case-insensitive). */
export function postcodeOptionalFor(country: string): boolean {
  const c = country.trim().toLowerCase();
  if (!c) return false;
  return COUNTRIES_WITHOUT_POSTCODES.some((x) => x.toLowerCase() === c) || c === "uae";
}

/** The address parts on one line, e.g. "1 High St, Flat 2, London, N1 1AA, United Kingdom". Empty when none given. */
export function addressOneLine(a: AddressParts): string {
  return [a.address_line1, a.address_line2, a.address_town, a.address_postcode, a.address_country]
    .map((x) => (x || "").trim())
    .filter(Boolean)
    .join(", ");
}

/** The address for display: the parts one per line, or the older free-text address when there are no parts. */
export function addressBlock(a: AddressParts & { address?: string | null }): string {
  const lines = [a.address_line1, a.address_line2, a.address_town, a.address_postcode, a.address_country].map((x) => (x || "").trim()).filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : (a.address || "").trim();
}
