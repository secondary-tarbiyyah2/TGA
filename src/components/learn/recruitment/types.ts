import type { ApplicationStatus, EmploymentEntry, Referee } from "@/lib/careers";

export const RECRUITMENT_BUCKET = "recruitment-documents";

export type JobApplication = {
  id: string;
  reference: string;
  vacancy_id: string | null;
  vacancy_title: string;
  status: ApplicationStatus;
  status_changed_at: string;
  title: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  email: string;
  phone: string;
  country: string;
  town: string | null;
  right_to_work: string;
  teacher_status: string;
  highest_qualification: string;
  qualifications: string | null;
  islamic_qualifications: string | null;
  subjects: string[];
  year_groups: string[];
  languages: string | null;
  years_experience: string;
  online_experience: string;
  employment: EmploymentEntry[];
  employment_gaps: string | null;
  hours_preference: string;
  available_days: string[];
  earliest_start: string | null;
  notice_period: string | null;
  has_equipment: boolean;
  statement: string;
  why_tga: string | null;
  referees: Referee[];
  dbs_status: string;
  how_heard: string | null;
  declaration_name: string;
  cv_path: string | null;
  cv_filename: string | null;
  documents: { path: string; name: string; size: number; type: string }[];
  rating: number | null;
  interview_at: string | null;
  created_at: string;
};

export const APPLICATION_COLUMNS =
  "id, reference, vacancy_id, vacancy_title, status, status_changed_at, title, first_name, last_name, preferred_name, email, phone, country, town, right_to_work, teacher_status, highest_qualification, qualifications, islamic_qualifications, subjects, year_groups, languages, years_experience, online_experience, employment, employment_gaps, hours_preference, available_days, earliest_start, notice_period, has_equipment, statement, why_tga, referees, dbs_status, how_heard, declaration_name, cv_path, cv_filename, documents, rating, interview_at, created_at";

export type ApplicationEvent = {
  id: string;
  application_id: string;
  kind: "note" | "status" | "email";
  body: string | null;
  from_status: string | null;
  to_status: string | null;
  created_by: string | null;
  created_at: string;
};

export const ukDate = (iso: string): string => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
export const ukDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
