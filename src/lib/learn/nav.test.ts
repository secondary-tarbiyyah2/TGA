// Run with: node --test --experimental-strip-types src/lib/learn/nav.test.ts
// (CI runs it in the lint job.) Guards the portal menu: every page reachable,
// nothing listed twice, categories small, phone bar short.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { NAV_CATEGORIES, SUB_PAGES, allPages, hubFor, mobileTabsFor, navPageFor, sidebarLayout, visiblePages, type PortalArea } from "./nav.ts";

const AREAS: PortalArea[] = ["admin", "teach", "family", "student"];
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

// Detail pages opened from a list (a class, a lesson, one lesson in the
// library): reached by clicking a row, not from the menu.
const DETAIL_PAGES = new Set([
  "/admin/class",
  "/admin/lessons/view",
  "/admin/curriculum/lesson",
  "/admin/site",
  "/admin/register",
  "/teach/class",
  "/teach/register",
  "/teach/lessons/view",
  "/teach/curriculum/lesson",
  "/teach/enrichment",
  "/family/class",
  "/family/lessons/view",
  "/family/homework",
  "/student/class",
  "/student/lessons/view",
  "/student/homework",
]);

function routesFor(area: PortalArea): string[] {
  const root = path.join(process.cwd(), "src/app/learn", area);
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else if (e.name === "page.tsx") out.push("/" + path.relative(path.join(process.cwd(), "src/app/learn"), dir).split(path.sep).join("/"));
    }
  };
  walk(root);
  return out.filter((r) => r !== `/${area}`);
}

test("every portal page is in the menu, a sub-page, or a detail page", () => {
  for (const area of AREAS) {
    const menu = new Set(allPages(area).map((p) => p.href));
    const subs = new Set(Object.values(SUB_PAGES).flat().map((p) => p.href));
    const orphans = routesFor(area).filter((r) => !menu.has(r) && !subs.has(r) && !DETAIL_PAGES.has(r));
    assert.deepEqual(orphans, [], `${area}: pages missing from the menu`);
  }
});

test("menu links only go to pages that exist", () => {
  for (const area of AREAS) {
    const routes = new Set(routesFor(area));
    for (const p of allPages(area)) {
      if (!p.href.startsWith(`/${area}/`)) continue;
      assert.ok(routes.has(p.href), `${area}: ${p.href} has no page`);
    }
  }
});

test("no page is listed twice, and no two pages share a name in an area", () => {
  for (const area of AREAS) {
    const hrefs = allPages(area).map((p) => p.href);
    assert.equal(new Set(hrefs).size, hrefs.length, `${area}: a page is listed twice`);
    const labels = allPages(area).map((p) => p.label.toLowerCase());
    const dup = labels.filter((l, i) => labels.indexOf(l) !== i && !NAV_CATEGORIES[area].some((c) => c.pages.length === 1 && c.label.toLowerCase() === l));
    assert.deepEqual(dup, [], `${area}: two pages share a name`);
  }
});

test("staff have a handful of categories; families and pupils a short flat menu", () => {
  assert.ok(NAV_CATEGORIES.admin.length <= 11);
  assert.ok(NAV_CATEGORIES.teach.length <= 9);
  for (const area of ["admin", "teach"] as PortalArea[]) for (const c of NAV_CATEGORIES[area]) assert.ok(c.pages.length <= 6, `${area} ${c.label} has too many pages`);
  assert.ok(sidebarLayout("family", ["parent"]).length <= 7);
  assert.ok(sidebarLayout("student", ["student"]).length <= 6);
  assert.ok(sidebarLayout("family", ["parent"]).every((e) => e.kind === "link"));
});

test("every role sees some menu, a phone bar of at most four, and search finds every menu page", () => {
  for (const [role, [area, roles]] of Object.entries(ROLES)) {
    const layout = sidebarLayout(area, roles);
    assert.ok(layout.length > 0, `${role}: empty menu`);
    const tabs = mobileTabsFor(area, roles);
    assert.ok(tabs.length >= 2 && tabs.length <= 4, `${role}: ${tabs.length} phone tabs`);
    const found = new Set(visiblePages(area, roles).map((p) => p.href));
    for (const e of layout) {
      const items = e.kind === "link" ? [e.item] : e.section.items;
      for (const i of items) assert.ok(found.has(i.href), `${role}: search can't find ${i.href}`);
    }
  }
});

test("the most specific page wins", () => {
  assert.equal(navPageFor("/admin/lessons/generate")?.label, "Make the timetable");
  assert.equal(navPageFor("/admin/lessons/timetable")?.label, "Timetable");
  assert.equal(navPageFor("/teach/class")?.label, "My classes");
  assert.equal(navPageFor("/learn/admin/curriculum/map")?.label, "Curriculum map");
  assert.equal(hubFor("/admin/attendance", ["head_teacher"])?.item.label, "Attendance and behaviour");
  // Home pages stand alone: no tab strip.
  assert.equal(hubFor("/admin/dashboard", ["head_teacher"]), null);
  // Report a concern is in the teacher menu but never in a tab strip.
  assert.ok(!hubFor("/teach/send", ["teacher"])?.tabs.some((t) => t.href === "/report-concern"));
});

test("search words: plain words find the right page", () => {
  const pages = visiblePages("admin", ["head_teacher"]);
  const find = (w: string) => pages.filter((p) => `${p.label} ${p.hint} ${p.keywords}`.toLowerCase().includes(w)).map((p) => p.label);
  assert.ok(find("attendance").includes("Registers"));
  assert.ok(find("gdpr").includes("Data protection"));
  assert.ok(find("subjects").includes("Subjects"));
});

test("a Digital Lead opens the Audit log, and on their own nothing else in Admin", () => {
  const only = visiblePages("admin", ["digital_lead"]).map((p) => p.href).filter((h) => h !== "/admin/site");
  assert.deepEqual(only, ["/admin/audit-log"]);
  assert.deepEqual(mobileTabsFor("admin", ["digital_lead"]).map((t) => t.href), ["/admin/audit-log"]);
  // A teacher who is also the Digital Lead: the same one page in Admin, and the teaching menu as before.
  assert.ok(visiblePages("admin", ["teacher", "digital_lead"]).some((p) => p.href === "/admin/audit-log"));
  assert.equal(visiblePages("teach", ["teacher", "digital_lead"]).length, visiblePages("teach", ["teacher"]).length);
  // Admissions staff gain the Audit log only with the role.
  assert.ok(!visiblePages("admin", ["admissions"]).some((p) => p.href === "/admin/audit-log"));
  assert.ok(visiblePages("admin", ["admissions", "digital_lead"]).some((p) => p.href === "/admin/audit-log"));
  assert.ok(visiblePages("admin", ["admissions", "digital_lead"]).some((p) => p.href === "/admin/admissions"));
  // A Digital Lead never gets the head-only pages.
  assert.ok(!visiblePages("admin", ["digital_lead"]).some((p) => p.href === "/admin/fees" || p.href === "/admin/staff"));
});
