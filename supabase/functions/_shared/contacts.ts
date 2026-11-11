// One place for the school's email addresses, by role (owner, 11 Nov 2026,
// Tafweed 3: "compile list of emails that need to be made for different roles
// so not every team is globalacademy@tarbiyyah.co.uk").
//
// Shared by the website and portal (re-exported from src/content/contacts.ts)
// and by the Edge Functions. Plain TypeScript with no imports, so Deno and
// Next.js can both load it.
//
// HOW THIS WORKS UNTIL THE MAILBOXES EXIST
// Each role's VALUE is the address that works today (almost always
// globalacademy@tarbiyyah.co.uk). The address the role should move to is in
// PLANNED_ROLE_EMAILS and in the comment beside it. Nothing public changes and
// no email bounces until the owner has created a mailbox, checked it receives
// mail and asked for the switch: then change that one value here (and, for
// admissions, the "Admissions email" in Settings and the ADMISSIONS_EMAIL
// secret). The full list, with where each address is used, is in
// docs/role-email-addresses.md.
//
// Edge Functions keep reading their environment variables first
// (ADMISSIONS_EMAIL, ABSENCE_INBOX_EMAIL, MAIL_FROM_EMAIL), so a deployed
// setting always wins over these defaults.

export const ROLE_EMAILS = {
  /** General enquiries. Planned: keep, or info@globalacademy.tarbiyyah.co.uk. */
  general: "globalacademy@tarbiyyah.co.uk",
  /** Applications, offers, admissions calls, open evenings. Planned: admissions@globalacademy.tarbiyyah.co.uk. */
  admissions: "globalacademy@tarbiyyah.co.uk",
  /** Fees, payments, late payment, withdrawal notices. Planned: finance@globalacademy.tarbiyyah.co.uk. */
  finance: "globalacademy@tarbiyyah.co.uk",
  /** Formal complaints (Concerns and Complaints Policy). Planned: complaints@globalacademy.tarbiyyah.co.uk. */
  complaints: "globalacademy@tarbiyyah.co.uk",
  /** Designated Safeguarding Lead and deputies (backlog T23). Planned: safeguarding@globalacademy.tarbiyyah.co.uk. */
  safeguarding: "globalacademy@tarbiyyah.co.uk",
  /** Absence reports: already live, read by the portal (inbound-absence). Planned: no change. */
  attendance: "absence@globalacademy.tarbiyyah.co.uk",
  /** Examination entries, access arrangements, private candidates. Planned: exams@globalacademy.tarbiyyah.co.uk. */
  exams: "globalacademy@tarbiyyah.co.uk",
  /** Job applications and recruitment. Planned: careers@globalacademy.tarbiyyah.co.uk. */
  careers: "globalacademy@tarbiyyah.co.uk",
  /** Staff matters (contracts, staff absence, safer recruitment checks). Planned: hr@globalacademy.tarbiyyah.co.uk. */
  hr: "globalacademy@tarbiyyah.co.uk",
  /** Data protection officer: subject access requests, data breaches. Planned: dpo@globalacademy.tarbiyyah.co.uk. */
  dataProtection: "globalacademy@tarbiyyah.co.uk",
  /** Portal sign-in, devices, Teams and website problems. Planned: support@globalacademy.tarbiyyah.co.uk. */
  itSupport: "globalacademy@tarbiyyah.co.uk",
  /** SEND and the SENCo. Planned: senco@globalacademy.tarbiyyah.co.uk. */
  senco: "globalacademy@tarbiyyah.co.uk",
  /** Chair of Trustees (complaints panel, allegations about the Headteacher). Planned: no change. */
  chair: "gbchair@tarbiyyah.co.uk",
} as const;

export type EmailRole = keyof typeof ROLE_EMAILS;

/** The address each role should move to once its mailbox exists. Not shown anywhere yet. */
export const PLANNED_ROLE_EMAILS: Record<EmailRole, string> = {
  general: "globalacademy@tarbiyyah.co.uk",
  admissions: "admissions@globalacademy.tarbiyyah.co.uk",
  finance: "finance@globalacademy.tarbiyyah.co.uk",
  complaints: "complaints@globalacademy.tarbiyyah.co.uk",
  safeguarding: "safeguarding@globalacademy.tarbiyyah.co.uk",
  attendance: "absence@globalacademy.tarbiyyah.co.uk",
  exams: "exams@globalacademy.tarbiyyah.co.uk",
  careers: "careers@globalacademy.tarbiyyah.co.uk",
  hr: "hr@globalacademy.tarbiyyah.co.uk",
  dataProtection: "dpo@globalacademy.tarbiyyah.co.uk",
  itSupport: "support@globalacademy.tarbiyyah.co.uk",
  senco: "senco@globalacademy.tarbiyyah.co.uk",
  chair: "gbchair@tarbiyyah.co.uk",
};

/** Address automated email is sent FROM (send-only, via Resend or Amazon SES). Not a mailbox. */
export const NOREPLY_EMAIL = "noreply@globalacademy.tarbiyyah.co.uk";
