#!/usr/bin/env node
// Screenshots of the live portal for the owner to review a redesign: the
// family and teacher screens, desktop and phone, signed in as the demo
// accounts (scripts/seed-demo-accounts.mjs) with one-off magic-link tokens.
// Read-only apart from the sign-in itself: no demo data is changed.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, LEARN_URL, PREVIEW_KEY, OUT
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, LEARN_URL, PREVIEW_KEY } = process.env;
const OUT = process.env.OUT || "portal-tour";
mkdirSync(OUT, { recursive: true });
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function sessionFor(email) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error: vErr } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (vErr) throw vErr;
  return data.session;
}
const sessions = {};
for (const [who, email] of [["parent", "demo-parent@tarbiyyah.co.uk"], ["teacher", "demo-teacher@tarbiyyah.co.uk"], ["student", "demo-student@tarbiyyah.co.uk"]]) {
  try {
    sessions[who] = await sessionFor(email);
  } catch (e) {
    console.log(`no session for ${who}: ${e.message}`);
  }
}

// One of the demo teacher's classes, for the class settings screen.
let classId = null;
if (sessions.teacher) {
  const { data } = await admin.from("timetable_slots").select("class_id").eq("teacher_user_id", sessions.teacher.user.id).limit(1);
  classId = data?.[0]?.class_id || null;
}

const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const DESK = { viewport: { width: 1440, height: 1000 }, scale: 1, mobile: false };
const PHONE = { viewport: { width: 390, height: 844 }, scale: 2, mobile: true };
const shots = [
  { name: "01-family-today-desktop", who: "parent", path: "/family/dashboard/", ...DESK },
  { name: "02-family-today-phone", who: "parent", path: "/family/dashboard/", ...PHONE },
  { name: "03-teacher-today-desktop", who: "teacher", path: "/teach/dashboard/", ...DESK },
  { name: "04-teacher-classes-desktop", who: "teacher", path: "/teach/classes/", ...DESK },
  classId && { name: "05-class-settings-teams-desktop", who: "teacher", path: `/teach/class/?id=${classId}&tab=settings`, ...DESK },
  { name: "06-curriculum-map-desktop", who: "teacher", path: "/teach/curriculum/map/", ...DESK },
  { name: "07-pupil-today-phone", who: "student", path: "/student/dashboard/", ...PHONE },
].filter(Boolean);

const browser = await chromium.launch();
for (const s of shots) {
  const session = sessions[s.who];
  if (!session) continue;
  const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: s.scale, isMobile: s.mobile, hasTouch: s.mobile, locale: "en-GB", timezoneId: "Europe/London" });
  const page = await ctx.newPage();
  await page.goto(`${LEARN_URL}/?key=${encodeURIComponent(PREVIEW_KEY)}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [storageKey, JSON.stringify(session)]);
  await page.goto(`${LEARN_URL}${s.path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelectorAll('[aria-label="Cookie consent"]').forEach((el) => el.remove()));
  await page.screenshot({ path: `${OUT}/${s.name}.png`, fullPage: true });
  console.log(`captured ${s.name} at ${page.url()}`);
  await ctx.close();
}
await browser.close();
