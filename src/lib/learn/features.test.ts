// Run with: node --test --experimental-strip-types src/lib/learn/features.test.ts
// (CI runs it in the lint job.) School features (migration 0206): the
// defaults, reading the switches once per session, and the useFeature hook.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  DEFAULT_FEATURES,
  FEATURES,
  createFeatureStore,
  featureMapFrom,
  lessonReadOnlyNote,
  setFeatureStore,
  useFeature,
  useFeatures,
  type FeatureKey,
} from "./features.ts";

function memoryStorage(seed?: Record<string, string>) {
  const m = new Map(Object.entries(seed || {}));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

test("revision packs start off and every other switch starts on", () => {
  assert.equal(DEFAULT_FEATURES.revision_packs, false);
  for (const f of FEATURES) if (f.key !== "revision_packs") assert.equal(DEFAULT_FEATURES[f.key], true, f.key);
});

test("every switch has a label and a one-line explanation in house style", () => {
  for (const f of FEATURES) {
    for (const text of [f.label, f.explain, f.on, f.off]) {
      assert.ok(text.length > 3, `${f.key}: empty text`);
      assert.ok(!/[—–]/.test(text), `${f.key}: no em or en dashes`);
    }
  }
});

test("rows from the database override the defaults; unknown rows are ignored", () => {
  const m = featureMapFrom([
    { key: "revision_packs", enabled: true },
    { key: "house_points", enabled: false },
    { key: "something_else", enabled: false },
  ]);
  assert.equal(m.revision_packs, true);
  assert.equal(m.house_points, false);
  assert.equal(m.ai_helpers, true);
  assert.equal("something_else" in m, false);
  assert.deepEqual(featureMapFrom(null), DEFAULT_FEATURES);
});

test("the store reads the database once and caches the answer for the session", async () => {
  let calls = 0;
  const storage = memoryStorage();
  const s = createFeatureStore(async () => {
    calls++;
    return [{ key: "ai_helpers", enabled: false }];
  }, storage);
  assert.equal(s.get().ai_helpers, true, "defaults until loaded");
  const [a, b] = await Promise.all([s.load(), s.load()]);
  assert.equal(a.ai_helpers, false);
  assert.equal(b.ai_helpers, false);
  await s.load();
  assert.equal(calls, 1, "one request, however many components ask");

  // A new page load in the same session reads the cache, not the database.
  const again = createFeatureStore(async () => {
    calls++;
    return [];
  }, storage);
  assert.equal(again.get().ai_helpers, false);
  await again.load();
  assert.equal(calls, 1);
});

test("a failed read keeps the defaults and is tried again", async () => {
  let calls = 0;
  const s = createFeatureStore(async () => {
    calls++;
    if (calls === 1) throw new Error("offline");
    if (calls === 2) return null; // table not deployed yet
    return [{ key: "revision_packs", enabled: true }];
  }, memoryStorage());
  assert.deepEqual(await s.load(), DEFAULT_FEATURES);
  assert.deepEqual(await s.load(), DEFAULT_FEATURES);
  assert.equal((await s.load()).revision_packs, true);
  assert.equal(calls, 3);
});

test("saving a switch updates every listener straight away", async () => {
  const s = createFeatureStore(async () => [], memoryStorage());
  await s.load();
  let heard = 0;
  const off = s.subscribe(() => heard++);
  s.set("lesson_feedback", false);
  assert.equal(s.get().lesson_feedback, false);
  assert.equal(heard, 1);
  off();
  s.set("lesson_feedback", true);
  assert.equal(heard, 1, "unsubscribed");
});

test("a broken cache is ignored", () => {
  const s = createFeatureStore(async () => [], memoryStorage({ "tga-school-features": "{not json" }));
  assert.deepEqual(s.get(), DEFAULT_FEATURES);
  assert.equal(s.isLoaded(), false);
});

test("useFeature and useFeatures read the store", async () => {
  const s = createFeatureStore(async () => [], memoryStorage({ "tga-school-features": JSON.stringify({ revision_packs: true, house_points: false }) }));
  setFeatureStore(s);
  try {
    const Probe = ({ name }: { name: FeatureKey }) => createElement("i", null, String(useFeature(name)));
    const All = () => createElement("i", null, JSON.stringify(useFeatures()));
    // renderToString uses the server snapshot (the defaults), as the static build does.
    assert.equal(renderToString(createElement(Probe, { name: "revision_packs" })), "<i>false</i>");
    assert.equal(JSON.parse(renderToString(createElement(All)).replace(/<\/?i>/g, "").replace(/&quot;/g, '"')).house_points, true);
    // In the browser the hook reads the store itself.
    assert.equal(s.get().revision_packs, true);
    assert.equal(s.get().house_points, false);
  } finally {
    setFeatureStore(null);
  }
});

// In a browser (jsdom, a dependency of the Sanity studio): the hook shows the
// cached switches, asks the database once, and re-renders when a switch is saved.
test("useFeature in the browser: loads once, then follows saved switches", async (t) => {
  let JSDOM: typeof import("jsdom").JSDOM;
  try {
    ({ JSDOM } = await import("jsdom"));
  } catch {
    t.skip("jsdom is not installed");
    return;
  }
  const dom = new JSDOM("<!doctype html><div id=root></div>");
  const g = globalThis as Record<string, unknown>;
  const saved = { window: g.window, document: g.document, act: g.IS_REACT_ACT_ENVIRONMENT };
  g.window = dom.window;
  g.document = dom.window.document;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  let calls = 0;
  const s = createFeatureStore(async () => {
    calls++;
    return [{ key: "revision_packs", enabled: true }];
  }, memoryStorage());
  setFeatureStore(s);
  try {
    const { act } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const Probe = () => createElement("p", null, `${useFeature("revision_packs")} ${useFeature("house_points")}`);
    const el = dom.window.document.getElementById("root")!;
    const root = createRoot(el);
    await act(async () => {
      root.render(createElement("div", null, createElement(Probe), createElement(Probe)));
    });
    assert.equal(el.textContent, "true truetrue true", "both components show the database's answer");
    assert.equal(calls, 1, "two components, one request");
    await act(async () => s.set("house_points", false));
    assert.equal(el.textContent, "true falsetrue false", "a saved switch shows straight away");
    await act(async () => root.unmount());
  } finally {
    setFeatureStore(null);
    g.window = saved.window;
    g.document = saved.document;
    g.IS_REACT_ACT_ENVIRONMENT = saved.act;
  }
});

test("the read-only lesson banner follows the switches", () => {
  assert.equal(lessonReadOnlyNote({ subject_lesson_editing: true, lesson_feedback: true }), "You can read this lesson and leave feedback. Editing is for teachers of this subject and the Headteacher.");
  assert.equal(lessonReadOnlyNote({ subject_lesson_editing: false, lesson_feedback: true }), "You can read this lesson and leave feedback. Editing is for teachers and the Headteacher.");
  assert.equal(lessonReadOnlyNote({ subject_lesson_editing: true, lesson_feedback: false }), "You can read this lesson. Editing is for teachers of this subject and the Headteacher.");
});
