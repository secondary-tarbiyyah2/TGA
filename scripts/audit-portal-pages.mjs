#!/usr/bin/env node
// Full-page screenshots of every Parent Portal page (phone and desktop),
// signed in as the demo parent, for reviewing layout and navigation.
// Output: audit/portal/<page>-<phone|desktop>.png. Env as capture-portal-screenshots.mjs.
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, LEARN_URL, PREVIEW_KEY } = process.env;
const ROLES = {
  family: { email: "demo-parent@tarbiyyah.co.uk", pages: "dashboard,actions,todo,homework,classes,messages,announcements,reports,quran,behaviour,revision,calendar,parent-evenings,teachers,child-details,absences,fees,support" },
  student: { email: "demo-student@tarbiyyah.co.uk", pages: "dashboard,actions,todo,homework,classes,announcements,reports,quran,behaviour,revision,calendar,teachers" },
  teach: { email: "demo-teacher@tarbiyyah.co.uk", pages: "dashboard,today,actions,classes,pupils,homework,review,assessment,reports,messages,announcements,quran,behaviour,stars,absences,calendar,clock,parent-evenings,syllabus,curriculum,revision,send,enrichment,handbook,profile" },
};
const OUT = "audit/portal";
mkdirSync(OUT, { recursive: true });
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function sessionFor(email) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: v, error: e2 } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (e2) throw e2;
  return v.session;
}
const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const browser = await chromium.launch();
for (const [role, cfg] of Object.entries(ROLES)) {
const session = await sessionFor(cfg.email).catch((e) => { console.log("no session", role, String(e).slice(0, 120)); return null; });
if (!session) continue;
const PAGES = cfg.pages.split(",");
for (const [kind, vp, mobile] of [["phone", { width: 390, height: 844 }, true], ["desktop", { width: 1440, height: 900 }, false]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, locale: "en-GB", timezoneId: "Europe/London" });
  const page = await ctx.newPage();
  await page.goto(`${LEARN_URL}/?key=${encodeURIComponent(PREVIEW_KEY)}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(([k, s]) => { localStorage.setItem(k, s); localStorage.setItem("tga-cookie-consent", "essential"); }, [storageKey, JSON.stringify(session)]);
  for (const p of PAGES) {
    try {
      await page.goto(`${LEARN_URL}/${role}/${p}/`, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(2000);
      await page.evaluate(() => document.querySelectorAll('[aria-label="Cookie consent"]').forEach((el) => el.remove()));
      await page.screenshot({ path: `${OUT}/${role}-${p}-${kind}.png`, fullPage: true });
      console.log("ok", p, kind);
    } catch (err) {
      console.log("fail", p, kind, String(err).slice(0, 200));
    }
  }
  await ctx.close();
}
}
await browser.close();
