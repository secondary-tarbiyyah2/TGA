// Run with: node --test --experimental-strip-types src/lib/learn/guide.test.ts
// (CI runs it in the lint job.) Guards the Portal guide: every page each role
// can reach has an entry, entries keep house style, and every "Show me"
// target really is a data-guide="..." attribute in that page's own code.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SUB_PAGES, allPages, visiblePages, type PortalArea } from "./nav.ts";
import { GUIDE, guideEntryFor, guideRoleFor, type GuideEntry, type GuideRole } from "../../content/portal-guide/index.ts";

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
