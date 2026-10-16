import { chromium } from "playwright";
import fs from "node:fs";
const req = JSON.parse(fs.readFileSync("research/request.json", "utf8"));
fs.mkdirSync("research/out", { recursive: true });
const browser = await chromium.launch();
const seen = new Set();
const queue = [...req.paths];
const report = [];
for (const width of [1366, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const list = width === 1366 ? queue : req.paths.slice(0, 2);
  for (let i = 0; i < list.length && i < 14; i++) {
    const p = list[i];
    const name = (p.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home") + `-${width}`;
    try {
      await page.goto(req.base + p, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `research/out/${name}.png`, fullPage: true });
      if (width === 1366) {
        const data = await page.evaluate(() => ({
          title: document.title,
          links: [...document.querySelectorAll("a")].map((a) => `${a.innerText.trim().replace(/\s+/g, " ")} -> ${a.getAttribute("href")}`).filter((t) => !t.startsWith(" ->")),
          headings: [...document.querySelectorAll("h1,h2,h3,h4")].map((h) => `${h.tagName}: ${h.innerText.trim()}`),
          text: document.body.innerText,
          fonts: [...new Set([...document.querySelectorAll("h1,h2,p,a,button")].slice(0, 80).map((e) => getComputedStyle(e).fontFamily))],
          colors: [...new Set([...document.querySelectorAll("section,div,a,button,h1,h2")].slice(0, 400).flatMap((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color]))].slice(0, 40),
        }));
        report.push(`#### ${p}\n${JSON.stringify(data, null, 1)}`);
        for (const l of data.links) {
          const href = l.split(" -> ")[1] || "";
          if (href.startsWith("/") && !href.startsWith("//") && !seen.has(href) && !queue.includes(href) && !/#/.test(href)) queue.push(href);
        }
      }
      seen.add(p);
    } catch (e) {
      report.push(`#### ${p}\nFAILED ${e.message}`);
    }
  }
  await ctx.close();
}
fs.writeFileSync("research/out/report.md", report.join("\n\n"));
await browser.close();
