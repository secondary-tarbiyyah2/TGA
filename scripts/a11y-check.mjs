#!/usr/bin/env node
// Accessibility check for the static export (WCAG 2.2 AA, via axe-core).
//
// Serves ./out locally, opens every public page (every index.html outside
// /learn and /studio — the portal needs a login, Studio is Sanity's own UI)
// in headless Chromium at desktop and 360px phone width, and runs axe on it.
// Fails if any page has a violation, or if the page scrolls sideways at 360px.
//
// Used by .github/workflows/ci.yml on every pull request. Needs `playwright`
// and `@axe-core/playwright`, which CI installs on the fly (`npm i --no-save`)
// so they don't weigh down the normal install.
//
// Run locally:  npm run build && npm i --no-save playwright @axe-core/playwright
//               && npx playwright install chromium && node scripts/a11y-check.mjs
//
// Rules switched off below are known, tracked issues from the
// "TGA Portal: Accessibility & Structure Audit" (Oct 2026). Each one must be
// switched back on by the pull request that fixes it — never add a rule here
// to make a new failure go away.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const OUT_DIR = path.resolve(process.argv[2] || "out");
const SKIP_PREFIXES = ["/learn", "/studio"];

// Audit priority 1 (muted grey text at 4.3:1). Re-enable in step 2 of the
// audit, when the muted-text token moves to ink/70.
const KNOWN_DISABLED_RULES = ["color-contrast"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".ics": "text/calendar",
};

function findPages(dir, base = "") {
  const pages = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = `${base}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIP_PREFIXES.some((p) => rel === p || rel.startsWith(`${p}/`))) continue;
      if (entry.name.startsWith("_")) continue; // _next assets
      pages.push(...findPages(path.join(dir, entry.name), rel));
    } else if (entry.name === "index.html") {
      pages.push(`${base}/`);
    }
  }
  return pages.sort();
}

function serve(root) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(root, urlPath);
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

if (!fs.existsSync(path.join(OUT_DIR, "index.html"))) {
  console.error(`No build found at ${OUT_DIR} — run \`npm run build\` first.`);
  process.exit(2);
}

const pages = findPages(OUT_DIR);
const server = await serve(OUT_DIR);
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

// Block anything off-site (analytics, Supabase, embeds) so results don't
// depend on the network.
async function newPage(width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.route("**/*", (route) =>
    route.request().url().startsWith(origin) ? route.continue() : route.abort(),
  );
  return context.newPage();
}

let failures = 0;
const desktop = await newPage(1280, 900);
const phone = await newPage(360, 740);
const tablet = await newPage(820, 1000);

for (const p of pages) {
  const url = origin + p;
  const problems = [];

  await desktop.goto(url, { waitUntil: "load" });
  const { violations } = await new AxeBuilder({ page: desktop })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .disableRules(KNOWN_DISABLED_RULES)
    .analyze();
  for (const v of violations) {
    problems.push(`${v.id} (${v.impact}, ${v.nodes.length}×): ${v.help}`);
    for (const n of v.nodes.slice(0, 3)) problems.push(`    ${n.target.join(" ")}`);
  }

  // Phone (360px) and small-laptop/tablet (820px) widths: nothing may stick
  // out past the right edge. The page clips sideways overflow (globals.css),
  // so check the elements themselves rather than the scroll width.
  for (const [pg, w] of [[phone, 360], [tablet, 820]]) {
    await pg.goto(url, { waitUntil: "load" });
    const wide = await pg.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const out = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(el);
        if (cs.position === "fixed" || cs.visibility === "hidden") continue;
        // Inside a horizontal scroller (e.g. a wide table) is fine.
        let p = el.parentElement;
        let scrolls = false;
        while (p && p !== document.body) {
          const o = getComputedStyle(p).overflowX;
          if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") {
            scrolls = true;
            break;
          }
          p = p.parentElement;
        }
        if (scrolls) continue;
        if (r.right > vw + 1 || r.left < -1) {
          const id = el.id ? `#${el.id}` : "";
          const cls = typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}` : "";
          out.push(`${el.tagName.toLowerCase()}${id}${cls} (${Math.round(r.left)}–${Math.round(r.right)}px)`);
          if (out.length >= 3) break;
        }
      }
      return out;
    });
    for (const wEl of wide) problems.push(`sticks out sideways at ${w}px wide: ${wEl}`);
  }

  if (problems.length) {
    failures++;
    console.log(`✗ ${p}`);
    for (const line of problems) console.log(`  ${line}`);
    // GitHub annotation, so the failure is readable from the PR page.
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=a11y ${p}::${problems.join(" | ").slice(0, 900)}`);
  } else {
    console.log(`✓ ${p}`);
  }
}

await browser.close();
server.close();

console.log(
  `\n${pages.length - failures}/${pages.length} pages pass` +
    (KNOWN_DISABLED_RULES.length ? ` (known issues not yet checked: ${KNOWN_DISABLED_RULES.join(", ")})` : ""),
);
process.exit(failures ? 1 : 0);
