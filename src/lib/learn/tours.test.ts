// Run with: node --test --experimental-strip-types src/lib/learn/tours.test.ts
// (CI runs it in the lint job.) Keeps the tours short and in house style.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGE_TIPS, tourFor, type TourStep } from "./tours.ts";

const ROLES: Record<string, ["admin" | "teach" | "family" | "student", string[]]> = {
  head_teacher: ["admin", ["head_teacher"]],
  admin: ["admin", ["admin"]],
  admissions: ["admin", ["admissions"]],
  teacher: ["teach", ["teacher"]],
  teaching_assistant_cover: ["teach", ["teaching_assistant_cover"]],
  senco: ["teach", ["senco"]],
  parent: ["family", ["parent"]],
  student: ["student", ["student"]],
};

function checkText(where: string, s: TourStep) {
  for (const text of [s.body, s.phoneBody].filter(Boolean) as string[]) {
    assert.ok(!/[—–]/.test(text), `${where}: no dashes`);
    // One sentence: a single full stop, question or exclamation mark, at the end.
    const ends = text.match(/[.!?](\s|$)/g) || [];
    assert.ok(ends.length <= 2 && /[.!?]$/.test(text), `${where}: one sentence ("${text}")`);
    assert.ok(text.split(/\s+/).length <= 26, `${where}: short ("${text}")`);
    assert.ok(!/\b(color|center|organize|favorite)\b/i.test(text), `${where}: British spelling`);
  }
  assert.ok(s.title.length <= 32, `${where}: short title`);
}

test("every role has a tour of 5 to 8 steps on desktop and on phones", () => {
  for (const [role, [area, roles]] of Object.entries(ROLES)) {
    const t = tourFor(area, roles);
    const desktop = t.steps.length;
    const phone = t.steps.filter((s) => !s.desktopOnly).length;
    assert.ok(desktop >= 5 && desktop <= 8, `${role}: ${desktop} desktop steps`);
    assert.ok(phone >= 4 && phone <= 8, `${role}: ${phone} phone steps`);
    t.steps.forEach((s, i) => checkText(`${role} step ${i + 1}`, s));
    // Each step points at something real.
    assert.ok(t.steps.every((s) => (s.target || []).length > 0), `${role}: a step has no target`);
  }
});

test("staff tours cover the menu categories, search, pins and the way back", () => {
  for (const [area, roles] of [["admin", ["head_teacher"]], ["teach", ["teacher"]]] as const) {
    const targets = tourFor(area, [...roles]).steps.flatMap((s) => s.target || []);
    for (const t of ["[data-tour=categories]", "[data-tour=search]", "[data-tour=pinned]", "[data-tour=help]"]) assert.ok(targets.includes(t), `${area}: ${t}`);
  }
  const head = tourFor("admin", ["head_teacher"]).steps.flatMap((s) => s.target || []);
  assert.ok(head.includes("[data-tour=notifications]"));
  assert.ok(head.some((t) => t.includes("/admin/actions")), "head tour shows Waiting for you");
});

test("page tips are 2 or 3 steps", () => {
  for (const [name, tips] of Object.entries(PAGE_TIPS)) {
    assert.ok(tips.steps.length >= 2 && tips.steps.length <= 3, name);
    assert.ok(tips.key.startsWith("tip:"), name);
    tips.steps.forEach((s, i) => checkText(`${name} tip ${i + 1}`, s));
  }
});

test("tour keys are per area, so a teacher who is also a parent sees both", () => {
  assert.notEqual(tourFor("teach", ["teacher"]).key, tourFor("family", ["parent"]).key);
});
