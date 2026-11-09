// Shared by the public Careers pages and the portal's Recruitment page.
// The allowed values must match migration 0182 and
// supabase/functions/careers-apply/index.ts.

export type VacancyStatus = "draft" | "open" | "closed";
export type ContractType = "full_time" | "part_time" | "sessional" | "flexible";

export type Vacancy = {
  id: string;
  slug: string;
  title: string;
  department: string;
  summary: string;
  description: string;
  responsibilities: string;
  requirements: string;
  desirable: string;
  contract_type: ContractType;
  hours_text: string | null;
  salary_text: string | null;
  location_text: string;
  start_text: string | null;
  closing_date: string | null;
  status: VacancyStatus;
  sort_order: number;
};

export const VACANCY_PUBLIC_COLUMNS =
  "id, slug, title, department, summary, description, responsibilities, requirements, desirable, contract_type, hours_text, salary_text, location_text, start_text, closing_date, status, sort_order";

export const DEPARTMENTS = ["Teaching", "Qur'an and Islamic Studies", "Pastoral and SEND", "Leadership", "Support staff"] as const;

export const CONTRACT_LABELS: Record<ContractType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  sessional: "Sessional (paid per lesson)",
  flexible: "Flexible hours",
};

export type Option = { value: string; label: string };

export const RIGHT_TO_WORK: Option[] = [
  { value: "uk_yes", label: "Yes, I have the right to work in the UK" },
  { value: "uk_sponsorship", label: "I live in the UK but would need visa sponsorship" },
  { value: "outside_uk", label: "I live outside the UK and would teach remotely from there" },
];

export const TEACHER_STATUS: Option[] = [
  { value: "qts", label: "Qualified Teacher Status (QTS)" },
  { value: "qtls", label: "QTLS" },
  { value: "overseas", label: "A teaching qualification from outside the UK" },
  { value: "training", label: "I am training to teach" },
  { value: "none", label: "No formal teaching qualification" },
];

export const YEARS_EXPERIENCE: Option[] = [
  { value: "none", label: "None yet" },
  { value: "under_2", label: "Less than 2 years" },
  { value: "2_5", label: "2 to 5 years" },
  { value: "5_10", label: "5 to 10 years" },
  { value: "over_10", label: "More than 10 years" },
];

export const ONLINE_EXPERIENCE: Option[] = [
  { value: "regular", label: "Yes, I teach online regularly" },
  { value: "some", label: "Some online teaching" },
  { value: "none", label: "Not yet" },
];

export const HOURS_PREFERENCE: Option[] = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "either", label: "Either" },
];

export const DBS_STATUS: Option[] = [
  { value: "enhanced_update_service", label: "I live in the UK and have an Enhanced DBS on the Update Service" },
  { value: "enhanced", label: "I live in the UK and have an Enhanced DBS (not on the Update Service)" },
  { value: "willing", label: "I live in the UK and don't have a DBS yet, but I'm happy to apply" },
  { value: "overseas_check", label: "I live outside the UK and have a police or criminal record certificate from my country" },
  { value: "overseas_willing", label: "I live outside the UK and can get a police or criminal record certificate" },
  { value: "not_available", label: "No such check is available where I live, or I'm not sure" },
];

export const SUBJECTS = [
  "Primary (all subjects)",
  "Qur'an and Tajweed",
  "Hifdh",
  "Arabic",
  "Islamic Studies",
  "English",
  "Maths",
  "Science",
  "Biology",
  "Chemistry",
  "Physics",
  "Computing",
  "History",
  "Geography",
  "Business",
  "Art and Design",
  "PSHE",
  "SEND support",
  "Pastoral",
  "Administration",
] as const;

export const YEAR_GROUPS = ["Years 1 to 2", "Years 3 to 6", "Years 7 to 9", "Years 10 to 11 (GCSE)"] as const;

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export const HOW_HEARD = ["Our website", "A flyer or poster", "Social media", "A job board", "A friend or colleague", "A masjid or community group", "Other"] as const;

export type AiRecommendation = "strong" | "possible" | "unlikely";

export const AI_RECOMMENDATIONS: { value: AiRecommendation; label: string; tone: "good" | "warn" | "bad" }[] = [
  { value: "strong", label: "Strong match", tone: "good" },
  { value: "possible", label: "Possible", tone: "warn" },
  { value: "unlikely", label: "Unlikely", tone: "bad" },
];

/** What the AI screening returns (stored in job_applications.ai_screening). */
export type AiScreening = {
  score: number;
  recommendation: AiRecommendation;
  summary: string;
  subjects_fit: string;
  requirements: { requirement: string; met: "yes" | "partly" | "no" | "unclear"; evidence: string }[];
  strengths: string[];
  concerns: string[];
  checks: string[];
  interview_questions: string[];
  cv_read: boolean;
  model: string;
};

export type ApplicationStatus = "new" | "reviewing" | "shortlisted" | "interview" | "offered" | "hired" | "unsuccessful" | "withdrawn";

export const APPLICATION_STATUSES: { value: ApplicationStatus; label: string; tone: "neutral" | "info" | "good" | "warn" | "bad" }[] = [
  { value: "new", label: "New", tone: "info" },
  { value: "reviewing", label: "Reviewing", tone: "neutral" },
  { value: "shortlisted", label: "Shortlisted", tone: "warn" },
  { value: "interview", label: "Interview", tone: "warn" },
  { value: "offered", label: "Offered", tone: "good" },
  { value: "hired", label: "Hired", tone: "good" },
  { value: "unsuccessful", label: "Unsuccessful", tone: "bad" },
  { value: "withdrawn", label: "Withdrawn", tone: "neutral" },
];

export function labelFor(options: Option[], value: string | null | undefined): string {
  return options.find((o) => o.value === value)?.label || value || "";
}

/** A text box's lines as list items (blank lines and leading bullets dropped). */
export function lines(text: string | null | undefined): string[] {
  return (text || "")
    .split(/\n+/)
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
}

/** "2026-12-18" -> "Friday 18 December 2026". */
export function longDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** "2024-09" -> "Sep 2024". */
export function monthLabel(ym: string | null | undefined): string {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || "";
  return new Date(`${ym}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

export type EmploymentEntry = { employer: string; role: string; from: string; to: string; current: boolean; reason: string };
export type Referee = { name: string; position: string; organisation: string; relationship: string; email: string; phone: string; contactBeforeInterview: boolean };
