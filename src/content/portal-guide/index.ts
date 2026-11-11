// The Portal guide: one entry per page each role can open (see types.ts).
// Runtime imports carry a .ts extension so the node unit tests can load this
// file directly (tsconfig: allowImportingTsExtensions).
import type { GuideEntry, GuideRole, Journey } from "./types";
import { HEAD_GUIDE } from "./head/index.ts";
import { ADMISSIONS_GUIDE } from "./admissions/index.ts";
import { TEACHER_GUIDE } from "./teacher/index.ts";
import { SENCO_GUIDE } from "./senco/index.ts";
import { DIGITAL_GUIDE } from "./digital/index.ts";
import { PARENT_GUIDE } from "./parent/index.ts";
import { PUPIL_GUIDE } from "./pupil/index.ts";
import { sharedEntries } from "./shared.ts";
import { JOURNEYS } from "./journeys.ts";

export type { GuideEntry, GuideRole, GuideTarget, Journey, JourneyStep } from "./types";
export { GUIDE_ROLE_LABEL } from "./types.ts";
export { JOURNEYS };

export const GUIDE: Record<GuideRole, GuideEntry[]> = {
  head: [...HEAD_GUIDE, ...sharedEntries("head")],
  admissions: [...ADMISSIONS_GUIDE, ...sharedEntries("admissions")],
  teacher: [...TEACHER_GUIDE, ...sharedEntries("teacher")],
  senco: [...SENCO_GUIDE, ...sharedEntries("senco")],
  digital: [...DIGITAL_GUIDE, ...sharedEntries("digital")],
  parent: [...PARENT_GUIDE, ...sharedEntries("parent")],
  pupil: [...PUPIL_GUIDE, ...sharedEntries("pupil")],
};

type Area = "admin" | "teach" | "family" | "student";

/** Which guide a person reads in an area. */
export function guideRoleFor(area: Area, roles: string[]): GuideRole {
  if (area === "admin") {
    if (roles.some((r) => r === "head_teacher" || r === "admin")) return "head";
    return roles.includes("digital_lead") && !roles.includes("admissions") ? "digital" : "admissions";
  }
  if (area === "teach") {
    const teaches = roles.some((r) => ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover"].includes(r));
    return roles.includes("senco") && !teaches ? "senco" : "teacher";
  }
  return area === "family" ? "parent" : "pupil";
}

/** The guide's chapters (menu categories) in order, each with its pages. */
export function guideChapters(role: GuideRole, f?: GuideFilter): { label: string; entries: GuideEntry[] }[] {
  const out: { label: string; entries: GuideEntry[] }[] = [];
  for (const e of filterGuide(GUIDE[role], f)) {
    const c = out.find((x) => x.label === e.category);
    if (c) c.entries.push(e);
    else out.push({ label: e.category, entries: [e] });
  }
  return out;
}

const strip = (p: string) => (p.replace(/^\/learn(?=\/|$)/, "").replace(/\/+$/, "") || "/");

/** The entry for the page at this address: the exact page, else the longest
 * entry the address sits under (a sub-page such as /teach/class/...). */
export function guideEntryFor(role: GuideRole, pathname: string, f?: GuideFilter): GuideEntry | null {
  const p = strip(pathname);
  let best: GuideEntry | null = null;
  for (const e of filterGuide(GUIDE[role], f)) {
    if (p === e.href) return e;
    if (p.startsWith(e.href + "/") && (!best || e.href.length > best.href.length)) best = e;
  }
  return best;
}

/** What the Headteacher's School feature switches hide from the guide
 * (Settings, School features): the pages switched off, lines about them in
 * other entries, and the "Day in the life" journeys. */
export type GuideFilter = { hiddenHrefs: string[]; dropText?: RegExp[]; journeys?: boolean };

const hiddenBy = (f: GuideFilter | undefined, href: string) => !!f?.hiddenHrefs.some((h) => href === h || href.startsWith(h + "/"));
const keepLine = (f: GuideFilter | undefined) => (t: string) => !f?.dropText?.some((r) => r.test(t));

/** The entries left with these switches: switched-off pages skipped, lines about them dropped. */
export function filterGuide(entries: GuideEntry[], f?: GuideFilter): GuideEntry[] {
  if (!f || (!f.hiddenHrefs.length && !f.dropText?.length)) return entries;
  return entries
    .filter((e) => !hiddenBy(f, e.href))
    .map((e) => ({
      ...e,
      steps: e.steps.filter(keepLine(f)),
      tips: e.tips.filter(keepLine(f)),
      tasks: e.tasks?.filter(keepLine(f)),
      related: e.related.filter((h) => !hiddenBy(f, h)),
    }));
}

/** The journeys left: none when journeys are switched off; otherwise stops on switched-off pages are skipped. */
export function filterJourneys(journeys: Journey[], f?: GuideFilter): Journey[] {
  if (f?.journeys === false) return [];
  if (!f) return journeys;
  return journeys.map((j) => ({ ...j, steps: j.steps.filter((st) => !hiddenBy(f, st.href)) })).filter((j) => j.steps.length > 1);
}
