// Fetches a page with a real headless browser (chromium via Playwright)
// and extracts nav links / headings / body text after JS has rendered —
// needed for research-competitor-site.yml because a plain curl only ever
// sees an empty client-rendered shell on some sites (confirmed: every
// path on crescentpathways.co.uk returned nothing but a bare <title> when
// fetched with curl).
import { chromium } from "playwright";

const baseUrl = process.env.RESEARCH_BASE_URL;
const paths = (process.env.RESEARCH_PATHS || "/").split(",");

const browser = await chromium.launch();
const page = await browser.newPage();

for (const p of paths) {
  const url = `${baseUrl}${p}`;
  console.log("==================================================");
  console.log(`URL: ${url}`);
  console.log("==================================================");
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
  } catch (err) {
    console.log(`fetch/render failed: ${err.message}`);
    continue;
  }

  const navLinks = await page.$$eval("nav a, header a", (els) =>
    els.map((a) => `${a.textContent?.trim()} -> ${a.getAttribute("href")}`).filter((t) => t.trim() !== "->")
  );
  console.log("--- NAV LINKS ---");
  console.log(navLinks.join("\n"));

  const headings = await page.$$eval("h1, h2, h3", (els) =>
    els.map((h) => `${h.tagName.toLowerCase()}: ${h.textContent?.trim()}`)
  );
  console.log("\n--- HEADINGS ---");
  console.log(headings.join("\n"));

  const bodyText = await page.$eval("body", (el) => el.innerText);
  console.log("\n--- BODY TEXT (first ~4000 chars) ---");
  console.log(bodyText.slice(0, 4000));
  console.log("");
}

await browser.close();
