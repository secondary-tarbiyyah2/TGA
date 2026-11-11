// Portal guide for admissions staff: the admin pages they can open (the same
// pages as the head teacher's guide), with what an admissions account sees
// differently written in.
import type { GuideEntry } from "../types";
import { HEAD_GUIDE } from "../head/index.ts";

export const ADMISSIONS_PAGES = [
  "/admin/dashboard",
  "/admin/admissions",
  "/admin/assessments",
  "/admin/open-evening",
  "/admin/compliance",
  "/admin/people",
  "/admin/content",
  "/admin/academic",
  "/admin/academic/years",
  "/admin/academic/year-groups",
  "/admin/academic/subjects",
  "/admin/academic/classes",
  "/admin/academic/meeting-links",
  "/admin/settings",
  "/admin/site",
];

const OVERRIDES: Record<string, Partial<GuideEntry>> = {
  "/admin/dashboard": {
    purpose: "Your starting point: shortcuts to Applications, Entry assessments, Open evenings and Accounts.",
    when: "When you sign in.",
    steps: [
      "Press Applications to work through new applications.",
      "Press Entry assessments to set or review an assessment.",
      "Press Open evenings to manage bookings.",
      "Press Accounts to add a family once a place is accepted.",
    ],
    tips: ["Search (Ctrl K) finds any page or job by plain words."],
    privacy: "Admissions staff see admissions pages and family accounts; pupil records stay with the head teacher and admin.",
    related: ["/admin/admissions", "/admin/assessments", "/admin/open-evening", "/admin/people"],
    showMe: [{ target: "admissions-shortcuts", label: "Shortcuts", say: "Your four everyday pages." }],
    tasks: ["start of the day"],
  },
  "/admin/compliance": {
    purpose: "Safeguarding alerts and policy signatures you are allowed to see.",
    steps: [
      "Read the alerts under Alerts and filter by type.",
      "Acknowledge an alert you are dealing with, then Resolve it with what was done.",
      "Use Signatures to see who still has to sign a policy.",
    ],
    tips: ["The safeguarding log and Single Central Record are kept to the head teacher, admin and safeguarding lead."],
    privacy: "Safeguarding information is never shown to families.",
  },
};

export const ADMISSIONS_GUIDE: GuideEntry[] = ADMISSIONS_PAGES.map((href) => {
  const base = HEAD_GUIDE.find((e) => e.href === href);
  if (!base) throw new Error(`admissions guide: no entry for ${href}`);
  const merged = { ...base, ...(OVERRIDES[href] || {}) };
  // Related pages an admissions account cannot open are left out.
  return { ...merged, related: merged.related.filter((h) => h === "/report-concern" || ADMISSIONS_PAGES.includes(h)) };
});
