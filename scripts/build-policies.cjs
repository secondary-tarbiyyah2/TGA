/* eslint-disable @typescript-eslint/no-require-imports */
// Renders every policy in content/policies/*.md to public/policies/<stem>.pdf
// in the Academy's house style (logo, policy header table, contents,
// numbered sections, page numbers), so the markdown is the single editable
// source and the PDFs on the site are always generated from it.
//
//   npm i --no-save marked playwright && npx playwright install chromium   # once
//   node scripts/build-policies.cjs            # all policies
//   node scripts/build-policies.cjs 25-fees    # one stem
//   node scripts/build-policies.cjs --html     # also write the HTML next to each PDF (for eyeballing)
//   node scripts/build-policies.cjs --from-db --out out/policies
//       # CI: render from the policy_links rows (body_md + meta) instead of the
//       # markdown files, so text edited in the portal becomes the published PDF.
//       # Needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (public
//       # read policy). Rows with an uploaded file or no body are skipped.
//
// marked and playwright are deliberately not project dependencies (the site
// build must stay light); install them ad hoc as above, or point NODE_PATH at
// a folder that has them. The generated PDFs are committed, so the site deploy
// never needs this script. Fonts fall back to the system sans (Liberation
// Sans on Linux), matching the original PDFs.
const { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { marked } = require("marked");
const { chromium } = require("playwright");

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "content", "policies");
const OUT = join(ROOT, "public", "policies");
const LOGO = join(ROOT, "public", "brand", "ga-wordmark.png");
// Amiri (Arabic), the site's own Arabic font, embedded so Arabic such as
// "صلى الله عليه وسلم" prints clearly whatever fonts the runner has.
const ARABIC_FONT = join(ROOT, "src", "app", "fonts", "amiri-arabic-400.woff2");

const args = process.argv.slice(2);
const writeHtml = args.includes("--html");
const fromDb = args.includes("--from-db");
const outArg = args.indexOf("--out");
const OUT_DIR = outArg >= 0 ? join(process.cwd(), args[outArg + 1]) : OUT;
const only = args.filter((a, i) => !a.startsWith("--") && !(outArg >= 0 && i === outArg + 1));

function parseFrontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) throw new Error("missing front matter");
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    meta[key] = value;
  }
  return { meta, body: text.slice(m[0].length) };
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const META_ROWS = [
  ["Policy name", "policyName"],
  ["Applies to", "appliesTo"],
  ["Policy owner", "owner"],
  ["Approved by", "approvedBy"],
  ["Agreed with", "agreedWith"],
  ["Date of issue", "dateOfIssue"],
  ["Next review due by", "nextReview"],
  ["Basis", "basis"],
  ["Read alongside", "readAlongside"],
  ["Availability", "availability"],
];

const CSS = `
  @page { size: A4; margin: 22mm 16mm 20mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Inter", "Liberation Sans", Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #1b1e21; margin: 0; }
  .brand { display: flex; align-items: center; gap: 14px; margin: 0 0 18px; }
  .brand img { width: 170px; height: auto; }
  .brand .name { font-weight: 700; letter-spacing: .08em; font-size: 10pt; color: #7a5f1c; }
  .brand .sub { font-size: 8.5pt; color: #6b6b6b; margin-top: 2px; }
  h1 { font-size: 24pt; font-weight: 800; margin: 0 0 4px; letter-spacing: .01em; }
  .subtitle { font-style: italic; color: #4a4a4a; margin: 0 0 6px; font-size: 11.5pt; }
  .year { font-size: 8.5pt; letter-spacing: .14em; color: #7a5f1c; font-weight: 700; margin: 0 0 14px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; page-break-inside: auto; }
  th, td { border: 1px solid #e6dcc3; padding: 6px 9px; vertical-align: top; text-align: left; font-size: 9.5pt; }
  th { background: #f7f1e3; font-weight: 700; }
  tr { page-break-inside: avoid; }
  table.meta td:first-child { width: 28%; font-weight: 700; background: #fbf7ee; }
  .contents { border: 1px solid #e6dcc3; border-radius: 10px; padding: 10px 16px 6px; margin: 0 0 18px; background: #fffdf8; }
  .contents .label { font-size: 8.5pt; letter-spacing: .14em; font-weight: 700; color: #7a5f1c; margin: 0 0 6px; }
  .contents ul { columns: 2; column-gap: 24px; margin: 0; padding-left: 0; list-style: none; font-size: 9.5pt; }
  .contents li { break-inside: avoid; margin: 0 0 3px; }
  h2 { font-size: 13.5pt; color: #7a5f1c; margin: 18px 0 6px; page-break-after: avoid; }
  h3 { font-size: 11pt; margin: 14px 0 4px; page-break-after: avoid; }
  p { margin: 0 0 8px; }
  ul, ol { margin: 0 0 8px; padding-left: 22px; }
  li { margin: 0 0 3px; }
  blockquote { margin: 0 0 8px; padding: 6px 12px; border-left: 3px solid #c9a34b; background: #fbf7ee; }
  .approval { margin-top: 26px; padding-top: 10px; border-top: 1px solid #e6dcc3; font-size: 9pt; color: #4a4a4a; }
`;

// Same rule as markArabic() in src/lib/safeMarkdown.ts: each run of Arabic
// words is marked lang="ar" dir="rtl" (text between tags only).
const ARABIC_RUN = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+(?:\s+[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+)*/g;
function markArabic(html) {
  return html
    .split(/(<[^>]*>)/)
    .map((part) => (part.startsWith("<") ? part : part.replace(ARABIC_RUN, (run) => `<span lang="ar" dir="rtl">${run}</span>`)))
    .join("");
}

function arabicFontCss() {
  if (!existsSync(ARABIC_FONT)) return "";
  const data = readFileSync(ARABIC_FONT).toString("base64");
  return `@font-face { font-family: "Amiri"; src: url(data:font/woff2;base64,${data}) format("woff2"); font-weight: 400; font-style: normal; }
  :lang(ar) { font-family: "Amiri", "Noto Naskh Arabic", "DejaVu Sans", serif; font-size: 1.15em; unicode-bidi: isolate; }`;
}

function sectionsOf(html) {
  const out = [];
  for (const m of html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)) out.push(m[1].replace(/<[^>]+>/g, ""));
  return out;
}

function render(meta, body) {
  const html = markArabic(marked.parse(body, { gfm: true }));
  const toc = sectionsOf(html);
  const logo = existsSync(LOGO) ? `data:image/png;base64,${readFileSync(LOGO).toString("base64")}` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(meta.title)}</title><style>${CSS}${arabicFontCss()}</style></head><body>
<div class="brand">${logo ? `<img src="${logo}" alt="">` : ""}<div><div class="sub">Part of the Tarbiyyah Education Trust · globalacademy.tarbiyyah.co.uk · globalacademy@tarbiyyah.co.uk · 020 3719 8697</div></div></div>
<h1>${esc(meta.title).toUpperCase()}</h1>
${meta.subtitle ? `<p class="subtitle">${esc(meta.subtitle)}</p>` : ""}
<p class="year">ACADEMIC YEAR 2026 – 2027</p>
<table class="meta">${META_ROWS.filter(([, k]) => meta[k]).map(([label, k]) => `<tr><td>${label}</td><td>${esc(meta[k])}</td></tr>`).join("")}</table>
${toc.length ? `<div class="contents"><p class="label">CONTENTS</p><ul>${toc.map((t) => `<li>${t}</li>`).join("")}</ul></div>` : ""}
${html}
<p class="approval">Approved by: ${esc(meta.approvedBy)} · Next review due: ${esc(meta.nextReview)} · Tarbiyyah Global Academy · A specialist education, rooted in faith</p>
</body></html>`;
}

/** Policies to render: [{ stem, meta, body }], from the database or the markdown files. */
async function loadPolicies() {
  if (fromDb) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("--from-db needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const res = await fetch(`${url}/rest/v1/policy_links?select=slug,title,number,meta,body_md,file_path,deleted_at&order=order_index`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`policy_links fetch failed: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    return rows
      .filter((r) => r.slug && r.body_md && !r.file_path && !r.deleted_at)
      .map((r) => ({ stem: r.slug, meta: { title: r.title, number: r.number, ...(r.meta || {}) }, body: r.body_md }));
  }
  return readdirSync(SRC)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const { meta, body } = parseFrontMatter(readFileSync(join(SRC, f), "utf8"));
      return { stem: f.replace(/\.md$/, ""), meta, body };
    });
}

(async () => {
const all = await loadPolicies();
const policies = all.filter((p) => only.length === 0 || only.some((o) => p.stem.startsWith(o)));
if (policies.length === 0) {
  console.error("No policies matched.");
  process.exit(fromDb ? 0 : 1);
}
mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const { stem, meta, body } of policies) {
  const html = render(meta, body);
  if (writeHtml) writeFileSync(join(OUT_DIR, `${stem}.html`), html);
  await page.setContent(html, { waitUntil: "load" });
  const headerLeft = "Tarbiyyah Global Academy";
  const headerRight = `${esc(meta.title).toUpperCase()} · 2026 – 2027`;
  await page.pdf({
    path: join(OUT_DIR, `${stem}.pdf`),
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `<div style="width:100%;font-family:'Liberation Sans',Arial,sans-serif;font-size:7.5px;color:#777;padding:0 16mm;display:flex;justify-content:space-between;"><span>${headerLeft}</span><span>${headerRight}</span></div>`,
    footerTemplate: `<div style="width:100%;font-family:'Liberation Sans',Arial,sans-serif;font-size:7.5px;color:#777;padding:0 16mm;display:flex;justify-content:space-between;"><span>globalacademy.tarbiyyah.co.uk</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    margin: { top: "22mm", bottom: "20mm", left: "16mm", right: "16mm" },
  });
  console.log(`built ${stem}.pdf`);
}
await browser.close();
})();
