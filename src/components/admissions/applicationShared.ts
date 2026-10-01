// Shared by the public application form (/admissions/apply) and the admin
// Admissions pipeline, so the two can never disagree on stages or fields.

export const APPLICATION_STATUSES = ["new", "assessment", "interview", "offered", "accepted", "waitlisted", "declined", "withdrawn"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: "New",
  assessment: "Assessment",
  interview: "Interview",
  offered: "Offered",
  accepted: "Accepted",
  waitlisted: "Waitlisted",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export const PIPELINE_STATUSES: ApplicationStatus[] = ["new", "assessment", "interview", "offered", "accepted"];
export const SIDELINE_STATUSES: ApplicationStatus[] = ["waitlisted", "declined", "withdrawn"];

// Same names as public.year_groups (migration 0018) and the existing
// application form; the label adds the age band shown elsewhere on the site.
export const YEAR_GROUP_OPTIONS: { value: string; label: string }[] = [
  { value: "Reception", label: "Reception (age 4–5)" },
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
  address: string | null;
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
  consent_contact: boolean;
  consent_data: boolean;
  declaration_name: string;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

export const APPLICATION_COLUMNS =
  "id, reference, status, parent_name, parent_email, parent_phone, relationship, address, child_first_name, child_last_name, child_dob, child_gender, year_group_applying, preferred_start, current_school, current_school_year, previous_islamic_education, send_or_medical_notes, how_heard, sibling_at_tarbiyyah, sibling_details, consent_contact, consent_data, declaration_name, notes, assigned_to, created_at, updated_at";

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
