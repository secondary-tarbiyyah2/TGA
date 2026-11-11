// Run with: node --test --experimental-strip-types src/lib/learn/guide.test.ts
// (CI runs it in the lint job.) Guards the Portal guide: every page each role
// can reach has an entry, entries keep house style, and every "Show me"
// target really is a data-guide="..." attribute in that page's own code.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SUB_PAGES, allPages, guideFilterFor, visiblePages, type PortalArea } from "./nav.ts";
import { DEFAULT_FEATURES, type FeatureMap } from "./features.ts";
import { GUIDE, JOURNEYS, filterGuide, filterJourneys, guideEntryFor, guideRoleFor, type GuideEntry, type GuideRole } from "../../content/portal-guide/index.ts";

const ROOT = process.cwd();
const ROLES: Record<string, [PortalArea, string[]]> = {
  head_teacher: ["admin", ["head_teacher"]],
  admin: ["admin", ["admin"]],
  admissions: ["admin", ["admissions"]],
  teacher: ["teach", ["teacher"]],
  teaching_assistant_cover: ["teach", ["teaching_assistant_cover"]],
  senco: ["teach", ["senco"]],
  parent: ["family", ["parent"]],
  student: ["student", ["student"]],
};

// Pages opened from a list rather than the menu, per guide.
const DETAIL: Record<GuideRole, string[]> = {
  head: ["/admin/class", "/admin/lessons/view", "/admin/curriculum/lesson", "/admin/site"],
  admissions: ["/admin/site", "/admin/academic/meeting-links"],
  teacher: ["/teach/class", "/teach/lessons/view", "/teach/curriculum/lesson", "/teach/enrichment"],
  senco: [],
  parent: ["/family/class", "/family/lessons/view", "/family/homework"],
  pupil: ["/student/class", "/student/lessons/view", "/student/homework"],
};
// Pages everyone has, outside the areas.
const SHARED = ["/account", "/feedback", "/install"];

// Things on every page (top bar, menu, guide panel) may be pointed at too.
const SHELL_FILES = [
  "src/components/learn/LearnLayoutShell.tsx",
  "src/components/learn/PortalSidebar.tsx",
  "src/components/learn/MobileTabBar.tsx",
  "src/components/learn/CommandPalette.tsx",
  "src/components/learn/guide/GuideButton.tsx",
];

function resolveImport(spec: string, from: string): string | null {
  let p: string;
  if (spec.startsWith("@/")) p = path.join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) p = path.resolve(path.dirname(from), spec);
  else return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const f = p + ext;
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

/** All source text a page renders from: its page.tsx and everything it imports under src/components and src/app. */
const closureCache = new Map<string, string>();
function pageSource(href: string): string {
  const cached = closureCache.get(href);
  if (cached !== undefined) return cached;
  const page = path.join(ROOT, "src/app/learn", href, "page.tsx");
  const seen = new Set<string>();
  const parts: string[] = [];
  const visit = (f: string) => {
    if (seen.has(f)) return;
    seen.add(f);
    const src = fs.readFileSync(f, "utf8");
    parts.push(src);
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)) {
      const t = resolveImport(m[1], f);
      if (t && /src\/(components|app)\//.test(t) && /\.tsx?$/.test(t)) visit(t);
    }
  };
  if (fs.existsSync(page)) visit(page);
  const text = parts.join("\n");
  closureCache.set(href, text);
  return text;
}
const shellSource = SHELL_FILES.filter((f) => fs.existsSync(path.join(ROOT, f)))
  .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8"))
  .join("\n");

const hasTarget = (src: string, t: string) => src.includes(`data-guide="${t}"`) || src.includes(`data-guide={"${t}"}`) || src.includes(`guide="${t}"`);

function guideFor(role: string): GuideRole {
  const [area, roles] = ROLES[role];
  return guideRoleFor(area, roles);
}

test("every role has a guide entry for every page it can reach", () => {
  for (const role of Object.keys(ROLES)) {
    const [area, roles] = ROLES[role];
    const g = guideFor(role);
    const have = new Set(GUIDE[g].map((e) => e.href));
    const reach = [...visiblePages(area, roles).map((p) => p.href), ...DETAIL[g], ...SHARED];
    const missing = [...new Set(reach)].filter((h) => !have.has(h));
    assert.deepEqual(missing, [], `${role} (${g} guide) has no entry for these pages`);
  }
});

test("guide entries only describe pages that exist and that the role can reach", () => {
  for (const role of Object.keys(ROLES)) {
    const [area, roles] = ROLES[role];
    const g = guideFor(role);
    const reach = new Set([...visiblePages(area, roles).map((p) => p.href), ...DETAIL[g], ...SHARED, "/report-concern", "/documents"]);
    for (const e of GUIDE[g]) {
      assert.ok(fs.existsSync(path.join(ROOT, "src/app/learn", e.href, "page.tsx")), `${g}: ${e.href} has no page`);
      assert.ok(reach.has(e.href), `${role}: the ${g} guide describes ${e.href}, which this role cannot open`);
    }
  }
});

test("menu pages keep their menu name", () => {
  const menu = new Map<string, string>();
  for (const area of ["admin", "teach", "family", "student"] as PortalArea[]) for (const p of allPages(area)) menu.set(p.href, p.label);
  for (const sp of Object.values(SUB_PAGES).flat()) menu.set(sp.href, sp.label);
  for (const [g, entries] of Object.entries(GUIDE)) {
    for (const e of entries) {
      const label = menu.get(e.href);
      if (label && !e.detail) assert.equal(e.name, label, `${g}: ${e.href} should be called "${label}" as in the menu`);
    }
  }
});

function checkText(where: string, text: string, pupil: boolean) {
  assert.ok(!/[—–]/.test(text), `${where}: no dashes ("${text}")`);
  assert.ok(!/\b(color|center|organize|favorite|behavior|program|enroll|license|catalog|analyze|practice coach is)\b/i.test(text.replace(/Practice coach/g, "")), `${where}: British spelling ("${text}")`);
  assert.ok(!/\bpathways?\b/i.test(text), `${where}: house words ("${text}")`);
  if (pupil) for (const s of text.split(/(?<=[.!?])\s+/)) assert.ok(s.split(/\s+/).length <= 22, `${where}: keep pupil sentences short ("${s}")`);
}

test("entries keep house style: plain English, British spelling, the right length", () => {
  for (const [g, entries] of Object.entries(GUIDE) as [GuideRole, GuideEntry[]][]) {
    const hrefs = new Set(entries.map((e) => e.href));
    assert.equal(hrefs.size, entries.length, `${g}: a page has two entries`);
    for (const e of entries) {
      const w = `${g} ${e.href}`;
      assert.ok(e.steps.length >= 3 && e.steps.length <= 7, `${w}: 3 to 7 steps`);
      assert.ok(e.tips.length >= 1 && e.tips.length <= 3, `${w}: 1 to 3 tips`);
      assert.ok(e.showMe.length >= 1 && e.showMe.length <= 4, `${w}: 1 to 4 show me targets`);
      assert.ok(e.purpose && e.when && e.privacy, `${w}: purpose, when and privacy are filled in`);
      for (const r of e.related) assert.ok(hrefs.has(r), `${w}: related page ${r} has no entry in the ${g} guide`);
      for (const t of [e.name, e.purpose, e.when, e.privacy, ...e.steps, ...e.tips, ...e.showMe.map((s) => s.say), ...(e.tasks || [])]) checkText(w, t, g === "pupil");
    }
  }
});

test("every Show me target is on its page", () => {
  const missing: string[] = [];
  for (const [g, entries] of Object.entries(GUIDE)) {
    for (const e of entries) {
      const src = pageSource(e.href);
      for (const s of e.showMe) if (!hasTarget(src, s.target) && !hasTarget(shellSource, s.target)) missing.push(`${g} ${e.href}: data-guide="${s.target}"`);
    }
  }
  assert.deepEqual(missing, [], "Show me targets not found in the page's code");
});

test("the guide finds the entry for an address", () => {
  assert.equal(guideEntryFor("teacher", "/teach/class")?.name, "A class");
  assert.equal(guideEntryFor("head", "/learn/admin/lessons/generate/")?.name, "Make the timetable");
  assert.equal(guideEntryFor("parent", "/family/todo")?.name, "Homework");
  assert.equal(guideRoleFor("teach", ["senco"]), "senco");
  assert.equal(guideRoleFor("admin", ["admissions"]), "admissions");
});

test("Day in the life journeys: 6 to 12 steps, on pages the role has, pointing at real things", () => {
  for (const g of ["head", "teacher", "parent", "pupil"] as GuideRole[]) assert.ok(JOURNEYS[g].length >= 1, `${g} has a journey`);
  const missing: string[] = [];
  for (const [g, list] of Object.entries(JOURNEYS) as [GuideRole, (typeof JOURNEYS)[GuideRole]][]) {
    const hrefs = new Set(GUIDE[g].map((e) => e.href));
    for (const j of list) {
      assert.ok(j.steps.length >= 6 && j.steps.length <= 12, `${g} ${j.id}: 6 to 12 steps`);
      j.steps.forEach((s, i) => {
        const w = `${g} ${j.id} step ${i + 1}`;
        assert.ok(hrefs.has(s.href), `${w}: ${s.href} is not a page in the ${g} guide`);
        if (s.from) assert.ok(i > 0 && hasTarget(pageSource(j.steps[i - 1].href), s.from), `${w}: follows ${s.from}, which is not on the step before`);
        if (s.target && !hasTarget(pageSource(s.href), s.target) && !hasTarget(shellSource, s.target)) missing.push(`${w}: data-guide="${s.target}" on ${s.href}`);
        checkText(w, s.body, g === "pupil");
        assert.ok(s.title.length <= 40, `${w}: short title`);
      });
    }
  }
  assert.deepEqual(missing, [], "journey targets not found on their pages");
});

// School features (Settings, migration 0206): a switched-off feature's pages
// leave the menu, so their guide entries and journey stops are skipped, and
// every page still in the menu keeps its entry.
const ALL_OFF: FeatureMap = { revision_packs: false, subject_lesson_editing: false, ai_helpers: false, house_points: false, guide_journeys: false, lesson_feedback: false };

test("with School features switched off, their guide entries are skipped and every page left has one", () => {
  for (const features of [ALL_OFF, { ...ALL_OFF, guide_journeys: true }, DEFAULT_FEATURES]) {
    const f = guideFilterFor(features);
    for (const role of Object.keys(ROLES)) {
      const [area, roles] = ROLES[role];
      const g = guideFor(role);
      const visible = visiblePages(area, roles, features).map((p) => p.href);
      const entries = filterGuide(GUIDE[g], f);
      const have = new Set(entries.map((e) => e.href));
      const missing = [...new Set([...visible, ...DETAIL[g], ...SHARED])].filter((h) => !have.has(h));
      assert.deepEqual(missing, [], `${role}: no guide entry for these pages`);
      const reach = new Set([...visible, ...DETAIL[g], ...SHARED, "/report-concern", "/documents"]);
      for (const e of entries) {
        assert.ok(reach.has(e.href), `${role}: the guide still describes ${e.href}, which is switched off`);
        for (const r of e.related) assert.ok(have.has(r), `${role} ${e.href}: related page ${r} is switched off`);
        assert.ok(e.steps.length >= 2, `${role} ${e.href}: too few steps left`);
        if (!features.revision_packs) for (const t of [...e.steps, ...e.tips, ...(e.tasks || [])]) assert.ok(!/revision pack/i.test(t), `${role} ${e.href}: "${t}" is about revision packs`);
      }
      for (const j of filterJourneys(JOURNEYS[g] || [], f)) for (const s of j.steps) assert.ok(have.has(s.href), `${role} ${j.id}: stop on ${s.href}, which is switched off`);
    }
  }
  assert.deepEqual(filterJourneys(JOURNEYS.pupil, guideFilterFor(ALL_OFF)), [], "journeys switched off: none offered");
  assert.ok(filterJourneys(JOURNEYS.pupil, guideFilterFor({ ...ALL_OFF, guide_journeys: true }))[0].steps.every((s) => s.href !== "/student/revision"), "revision packs off: the pupil journey skips Revise");
  assert.equal(guideEntryFor("pupil", "/student/revision", guideFilterFor(ALL_OFF)), null, "no guide for a switched-off page");
  assert.ok(visiblePages("student", ["student"], ALL_OFF).every((p) => p.href !== "/student/revision"), "the menu and search leave it out");
  assert.ok(visiblePages("student", ["student"]).some((p) => p.href === "/student/revision"), "with no switches given, nothing is hidden");
});
