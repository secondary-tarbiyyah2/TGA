// The Portal guide: one entry per page each role can open (see types.ts).
// Runtime imports carry a .ts extension so the node unit tests can load this
// file directly (tsconfig: allowImportingTsExtensions).
import type { GuideEntry, GuideRole } from "./types";
import { HEAD_GUIDE } from "./head/index.ts";
import { ADMISSIONS_GUIDE } from "./admissions/index.ts";
import { TEACHER_GUIDE } from "./teacher/index.ts";
import { SENCO_GUIDE } from "./senco/index.ts";
import { PARENT_GUIDE } from "./parent/index.ts";
import { PUPIL_GUIDE } from "./pupil/index.ts";
import { sharedEntries } from "./shared.ts";

export type { GuideEntry, GuideRole, GuideTarget, Journey, JourneyStep } from "./types";
export { GUIDE_ROLE_LABEL } from "./types.ts";

export const GUIDE: Record<GuideRole, GuideEntry[]> = {
  head: [...HEAD_GUIDE, ...sharedEntries("head")],
  admissions: [...ADMISSIONS_GUIDE, ...sharedEntries("admissions")],
  teacher: [...TEACHER_GUIDE, ...sharedEntries("teacher")],
  senco: [...SENCO_GUIDE, ...sharedEntries("senco")],
  parent: [...PARENT_GUIDE, ...sharedEntries("parent")],
  pupil: [...PUPIL_GUIDE, ...sharedEntries("pupil")],
};

type Area = "admin" | "teach" | "family" | "student";

/** Which guide a person reads in an area. */
export function guideRoleFor(area: Area, roles: string[]): GuideRole {
  if (area === "admin") return roles.some((r) => r === "head_teacher" || r === "admin") ? "head" : "admissions";
  if (area === "teach") {
    const teaches = roles.some((r) => ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover"].includes(r));
    return roles.includes("senco") && !teaches ? "senco" : "teacher";
  }
  return area === "family" ? "parent" : "pupil";
}

/** The guide's chapters (menu categories) in order, each with its pages. */
export function guideChapters(role: GuideRole): { label: string; entries: GuideEntry[] }[] {
  const out: { label: string; entries: GuideEntry[] }[] = [];
  for (const e of GUIDE[role]) {
    const c = out.find((x) => x.label === e.category);
    if (c) c.entries.push(e);
    else out.push({ label: e.category, entries: [e] });
  }
  return out;
}

const strip = (p: string) => (p.replace(/^\/learn(?=\/|$)/, "").replace(/\/+$/, "") || "/");

/** The entry for the page at this address: the exact page, else the longest
 * entry the address sits under (a sub-page such as /teach/class/...). */
export function guideEntryFor(role: GuideRole, pathname: string): GuideEntry | null {
  const p = strip(pathname);
  let best: GuideEntry | null = null;
  for (const e of GUIDE[role]) {
    if (p === e.href) return e;
    if (p.startsWith(e.href + "/") && (!best || e.href.length > best.href.length)) best = e;
  }
  return best;
}
