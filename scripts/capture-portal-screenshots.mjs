#!/usr/bin/env node
// Captures real screenshots of the family dashboard for the homepage's
// "parent portal" section: one on a phone, one on a desktop.
//
// It signs in as the demo parent (demo-parent@tarbiyyah.co.uk, created by
// scripts/seed-demo-accounts.mjs) with a one-off magic-link token, so the demo
// password is never needed or changed. The pages are the live portal; the only
// change made on screen is tidying the demo labels ("Demo Student", "Demo:")
// into the names a family would see.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
//      LEARN_URL (e.g. https://learn.tarbiyyah.co.uk), PREVIEW_KEY (staff gate)
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, LEARN_URL, PREVIEW_KEY } = process.env;
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, LEARN_URL, PREVIEW_KEY })) {
  if (!v) {
    console.error(`${k} missing`);
    process.exit(1);
  }
}
const OUT = "public/portal";
mkdirSync(OUT, { recursive: true });

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = "demo-parent@tarbiyyah.co.uk";

// A realistic weekly note on the demo child, so the widget isn't empty.
const { data: prof } = await admin.from("profiles").select("id").eq("email", EMAIL).maybeSingle();
if (!prof) {
  console.error("The demo parent doesn't exist yet. Run the 'Seed demo portal accounts' workflow first.");
  process.exit(1);
}
const { data: child } = await admin.from("children").select("id").eq("parent_user_id", prof.id).limit(1).maybeSingle();
if (child) {
  const { data: enr } = await admin.from("enrolments").select("class_id").eq("child_id", child.id).limit(1).maybeSingle();
  if (enr) {
    const now = new Date();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
    await admin.from("weekly_tarbiyah_notes").upsert(
      {
        child_id: child.id,
        class_id: enr.class_id,
        week_of: monday.toISOString().slice(0, 10),
        note: "On time and ready for every lesson this week. He kept going with a tricky tajweed exercise until he had it right, and was kind and helpful to a classmate in group work.",
      },
      { onConflict: "child_id,class_id,week_of" },
    );
  }
}

// Keep the demo family's next fortnight looking like a normal school week:
// lessons on its timetable slots and one piece of homework coming up.
if (child) {
  const { data: enrs } = await admin.from("enrolments").select("class_id").eq("child_id", child.id);
  const classIds = (enrs || []).map((e) => e.class_id);
  if (classIds.length) {
    const { data: slots } = await admin.from("timetable_slots").select("id, weekday, class_id").in("class_id", classIds);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const rows = [];
    for (let d = 0; d <= 14; d++) {
      const date = new Date(today.getTime() + d * 86_400_000);
      for (const sl of slots || []) if (sl.weekday === date.getUTCDay()) rows.push({ timetable_slot_id: sl.id, date: date.toISOString().slice(0, 10), objectives: "Revision and new learning", bbb_status: "not_started", recording_enabled: false });
    }
    if (rows.length) await admin.from("lesson_instances").upsert(rows, { onConflict: "timetable_slot_id,date", ignoreDuplicates: true });
    const soon = new Date(today.getTime() + 3 * 86_400_000).toISOString();
    const { data: upcoming } = await admin.from("homework").select("id").in("class_id", classIds).gte("due_at", today.toISOString()).limit(1);
    if (!upcoming?.length) {
      const { data: t } = await admin.from("profiles").select("id").eq("email", "demo-teacher@tarbiyyah.co.uk").maybeSingle();
      if (t) await admin.from("homework").insert({ class_id: classIds[0], teacher_id: t.id, title: "Recite Surah Al-Mulk 11 to 20", instructions: "Recite to a parent twice and note any mistakes.", due_at: soon });
    }
  }
}

// Sign in with a one-off token (no password involved).
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
if (linkErr) throw linkErr;
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: verified, error: vErr } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
if (vErr) throw vErr;
const session = verified.session;
const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

const TIDY = `(() => {
  const swap = (s) => s
    .replace(/Demo Student/g, "Yusuf Khan")
    .replace(/Demo Parent/g, "Umm Yusuf")
    .replace(/Demo Teacher/g, "Ustadh Bilal")
    .replace(/Demo: /g, "")
    .replace(/Demo Year 5/g, "Year 5")
    .replace(/Demo (Qur'an|Arabic|quiz)/g, "$1");
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) { const v = swap(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
  document.querySelectorAll("[title],[aria-label]").forEach((el) => {
    for (const a of ["title", "aria-label"]) if (el.getAttribute(a)) el.setAttribute(a, swap(el.getAttribute(a)));
  });
  // The greeting and avatar use the demo account's name.
  const w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while ((n = w2.nextNode())) {
    const t = n.nodeValue.trim();
    const ctx = (n.parentElement && n.parentElement.textContent) || "";
    let v = n.nodeValue
      .replace(/(Up next for\\s*)Demo\\b/, "$1Yusuf")
      .replace(/((Good (morning|afternoon|evening)|Assalamu alaykum),\\s*)Demo\\b/, "$1Umm Yusuf");
    if (t === "Demo") v = /Up next/.test(ctx) ? v.replace("Demo", "Yusuf") : v.replace("Demo", "Umm Yusuf");
    if (t === "DP") v = v.replace("DP", "UY");
    if (v !== n.nodeValue) n.nodeValue = v;
  }
  // A settled family's view: drop the one-off onboarding prompts (sign the
  // policies, finish the child's details) and the cookie banner.
  document.querySelectorAll('[data-onboarding], [aria-label="Cookie consent"]').forEach((el) => el.remove());
  document.querySelectorAll("[data-staff-preview]").forEach((el) => el.remove());
})()`;

const browser = await chromium.launch();
const shots = [
  { name: "family-dashboard-phone", viewport: { width: 390, height: 844 }, scale: 3, mobile: true, height: 1500 },
  { name: "family-dashboard-desktop", viewport: { width: 1440, height: 960 }, scale: 2, mobile: false, height: 960 },
];
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: s.scale, isMobile: s.mobile, hasTouch: s.mobile, locale: "en-GB", timezoneId: "Europe/London" });
  const page = await ctx.newPage();
  // Pass the staff gate (sets the cookie), then hand the page the session.
  await page.goto(`${LEARN_URL}/?key=${encodeURIComponent(PREVIEW_KEY)}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [storageKey, JSON.stringify(session)]);
  await page.goto(`${LEARN_URL}/family/dashboard/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.evaluate(TIDY);
  await page.waitForTimeout(300);
  if (s.mobile) {
    await page.setViewportSize({ width: s.viewport.width, height: s.height });
    await page.waitForTimeout(500);
    await page.evaluate(TIDY);
  }
  await page.evaluate(TIDY);
  const path = `${OUT}/${s.name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log(`captured ${path} at ${page.url()}`);
  await ctx.close();
}
await browser.close();
