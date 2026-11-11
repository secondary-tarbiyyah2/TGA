// Portal guide for a Digital Lead-only account (no office role): the Audit
// log page, which holds the record of reviews, the audit log itself, accounts
// and access, and sign-in attempts (migration 0218). Policy 02 sets the job:
// review the audit log monthly and on any concern, check accounts and access,
// check settings each term, and keep a record of each review.
import type { GuideEntry } from "../types";
import { HEAD_GUIDE } from "../head/index.ts";

export const DIGITAL_PAGES = ["/admin/audit-log", "/admin/site"];

const AUDIT_LOG: GuideEntry = {
  href: "/admin/audit-log",
  name: "Audit log",
  category: "Safeguarding and SEND",
  purpose: "Your Digital Lead page: the record of reviews, who changed what, staff accounts and sign-in attempts.",
  when: "Each month, after any concern, and for the termly settings check.",
  steps: [
    "Filter the audit log by dates since your last review, then by Who or Table if something stands out.",
    "Under Accounts and access, look for roles nobody should still hold and accounts not used for 90 days.",
    "Under Sign-in attempts, look for many failures or failures from several networks.",
    "Press Record a review and write the date, what you checked, what you found and what was done.",
    "Tell the Headteacher about anything that needs a change; only they change roles.",
  ],
  tips: [
    "Everything here is read only apart from recording a review, and a review cannot be edited once saved.",
    "A worry about a child goes to the safeguarding team through Report a concern, not into a review.",
  ],
  privacy: "Headteacher, Admin and Digital Lead only. Restricted records show only that a change happened; families and pupils are counted, not listed. Exports and reviews are logged.",
  related: ["/report-concern"],
  showMe: [
    { target: "digital-reviews", label: "Record of reviews", say: "Each review you have recorded, newest first." },
    { target: "audit-filters", label: "Filters", say: "Narrow the log, then Apply filters." },
    { target: "access-accounts", label: "Accounts", say: "Staff accounts, their roles and last sign-in." },
    { target: "access-sign-ins", label: "Sign-ins", say: "Failed sign-ins per email address." },
  ],
  tasks: ["monthly review", "record a review", "who changed this", "failed sign-ins", "who has which role"],
};

export const DIGITAL_GUIDE: GuideEntry[] = [
  AUDIT_LOG,
  ...HEAD_GUIDE.filter((e) => e.href === "/admin/site").map((e) => ({ ...e, related: [] })),
];
