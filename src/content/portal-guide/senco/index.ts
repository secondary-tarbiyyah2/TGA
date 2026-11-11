// Portal guide for a SENCo-only account (no teaching or office role): the
// SEND register, Report a concern and the staff handbook.
import type { GuideEntry } from "../types";
import { TEACHER_GUIDE } from "../teacher/index.ts";

export const SENCO_PAGES = ["/teach/send", "/report-concern", "/teach/handbook"];

export const SENCO_GUIDE: GuideEntry[] = SENCO_PAGES.map((href) => {
  const base = TEACHER_GUIDE.find((e) => e.href === href);
  if (!base) throw new Error(`senco guide: no entry for ${href}`);
  const e = { ...base, related: base.related.filter((h) => SENCO_PAGES.includes(h)) };
  if (href !== "/teach/send") return e;
  return {
    ...e,
    name: "Support plans",
    purpose: "The SEND register: every pupil's support plan, reviews due, drafts and pupils with needs but no plan.",
    when: "Daily, and before each review.",
    privacy: "Staff see the plans of the pupils they teach; parents see their own child's plan and can comment, and you read every comment.",
    related: ["/report-concern"],
  };
});
