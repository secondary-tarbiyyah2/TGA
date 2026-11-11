// Portal demo: clicks through every sidebar page for each role, the way a
// visitor would, and reports anything broken. Serves the built folder from a
// deep path (to prove every URL is relative) and blocks all network except
// localhost and Google Fonts.
//   node scripts/demo/verify.mjs <demoDir> [shotsDir] [role ...]
// Needs Playwright with Chromium installed (require("playwright")).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let playwright;
for (const base of [process.cwd() + "/", "/opt/npm-tools/node_modules/", import.meta.url]) {
  try {
    playwright = createRequire(base)("playwright");
    break;
  } catch {
    // try the next place
  }
}
if (!playwright) playwright = require("playwright");
const { chromium } = playwright;

const [demoDir, shotsDir, ...onlyRoles] = process.argv.slice(2);
const root = path.resolve(demoDir);
const shots = shotsDir ? path.resolve(shotsDir) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const PREFIX = "/some/deep/path/";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webp": "image/webp", ".jpg": "image/jpeg", ".txt": "text/plain", ".webmanifest": "application/manifest+json", ".pdf": "application/pdf" };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  if (!p.startsWith(PREFIX)) {
    res.writeHead(404);
    return res.end("not under the demo path");
  }
  let f = path.join(root, p.slice(PREFIX.length));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) {
    res.writeHead(404);
    return res.end("nf");
  }
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const BASE = `http://localhost:${port}${PREFIX}index.html`;

const ROLES = [
  ["head_teacher", "Head teacher"],
  ["teacher", "Teacher"],
  ["admin", "Office"],
  ["parent", "Parent"],
  ["student", "Pupil"],
].filter(([r]) => !onlyRoles.length || onlyRoles.includes(r));

const browser = await chromium.launch();
const report = { pages: 0, problems: [] };
const problem = (role, where, what) => {
  report.problems.push({ role, where, what });
  console.log(`  PROBLEM ${role} ${where}: ${what}`);
};

for (const [role, label] of ROLES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-GB", timezoneId: "Europe/London", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  let current = "sign-in";
  const errors = [];
  await ctx.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === "localhost" || u.protocol === "data:" || u.protocol === "blob:") return route.continue();
    if (u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com") return route.continue();
    errors.push(`blocked request to ${u.href.slice(0, 120)}`);
    return route.abort();
  });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on("requestfailed", (r) => {
    if (!r.url().startsWith("data:") && !r.url().startsWith("blob:")) errors.push(`failed: ${r.url().slice(0, 160)} ${r.failure()?.errorText || ""}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`);
  });
  const flush = (where) => {
    for (const e of errors.splice(0)) problem(role, where, e);
  };

  await page.goto(BASE, { waitUntil: "load" });
  await page.getByRole("button", { name: new RegExp(`^${label}`) }).first().click();
  await page.waitForLoadState("load");
  await page.waitForTimeout(2500);
  flush("sign-in");

  // Open every category in the sidebar, then collect its links.
  const nav = page.locator("nav[data-tour='menu']").first();
  await nav.waitFor({ timeout: 15000 }).catch(() => problem(role, "dashboard", "no sidebar"));
  for (let pass = 0; pass < 3; pass++) {
    const closed = nav.locator("button[aria-expanded='false']");
    const n = await closed.count();
    for (let i = 0; i < n; i++) await closed.nth(0).click().catch(() => {});
  }
  const links = await nav.locator("a[href^='#']").evaluateAll((as) => [...new Map(as.map((a) => [a.getAttribute("href"), (a.getAttribute("aria-label") || a.textContent || "").trim()])).entries()]);
  console.log(`${label}: ${links.length} sidebar pages`);
  for (const [href, name] of links) {
    current = `${href} (${name})`;
    await page.evaluate((h) => (window.location.hash = h), href);
    await page.waitForTimeout(400);
    // Settle: wait until nothing is loading, up to 8 seconds.
    let state = null;
    for (let i = 0; i < 16; i++) {
      state = await page.evaluate(() => {
        const main = document.querySelector("main") || document.body;
        const text = (main.innerText || "").trim();
        // Spinners and grey loading blocks (not live regions or small pulsing dots).
        const shown = (el) => el.getBoundingClientRect().height > 0 && !el.closest("[data-demo-bar]");
        const busy = [
          ...[...document.querySelectorAll("main .portal-progress")].filter(shown),
          ...[...document.querySelectorAll("main .motion-safe\\:animate-pulse, main .animate-pulse")].filter((el) => shown(el) && el.getBoundingClientRect().height >= 16 && !(el.innerText || "").trim()),
        ].map((el) => el.getAttribute("aria-label") || el.className.slice(0, 60));
        return { text: text.slice(0, 4000), len: text.length, busy };
      });
      if (!state.busy.length) break;
      await page.waitForTimeout(500);
    }
    report.pages++;
    if (state.busy.length) problem(role, current, `still loading after 8s: ${state.busy.join("; ")}`);
    if (state.len < 40) problem(role, current, `nearly blank page: "${state.text.slice(0, 80)}"`);
    if (shots && process.env.SHOT_ALL) {
      fs.mkdirSync(path.join(shots, role), { recursive: true });
      await page.screenshot({ path: path.join(shots, role, `${String(report.pages).padStart(3, "0")}-${href.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}.png`) });
    }
    for (const bad of ["Something went wrong", "could not be shown in the demo", "isn't connected yet", "Couldn't load", "Could not load", "doesn't have access", "Please sign in", "Enter your 6-digit PIN", "This page isn't in the portal"]) if (state.text.includes(bad)) problem(role, current, `shows "${bad}"`);
    flush(current);
  }
  if (shots) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(shots, `${role}-last.png`) });
  }
  await ctx.close();
}
await browser.close();
server.close();
console.log(`\nChecked ${report.pages} pages; ${report.problems.length} problem(s).`);
fs.writeFileSync(path.join(shots || root, "verify-report.json"), JSON.stringify(report, null, 2));
process.exit(report.problems.length ? 1 : 0);
