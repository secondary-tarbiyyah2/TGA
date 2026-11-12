// Portal demo, after `next build`: turns Next's static export into a folder
// that works from any path on any host.
//   - only index.html and the files it needs are kept (no RSC .txt payloads,
//     no 404 pages, no source maps);
//   - _next becomes "assets" (hosts may reserve paths starting with "_");
//   - every URL becomes relative: "./assets/..." in HTML and JS (resolved
//     against index.html), "../media/..." in CSS (resolved against the CSS file);
//   - files from public/ that the code refers to ("/brand/ga-wordmark.png")
//     are copied in and referred to relatively.
//   node scripts/demo/postprocess.mjs <nextOut> <demoOut> <publicDir>
import fs from "node:fs";
import path from "node:path";

const [src, dest, pub] = process.argv.slice(2).map((p) => path.resolve(p));
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

// 1. index.html and _next/static -> assets/static
fs.copyFileSync(path.join(src, "index.html"), path.join(dest, "index.html"));
fs.cpSync(path.join(src, "_next", "static"), path.join(dest, "assets", "static"), { recursive: true });
for (const f of walk(dest)) if (/\.map$/.test(f) || /_buildManifest|_ssgManifest|_clientMiddlewareManifest/.test(path.basename(f))) fs.rmSync(f);

// 2. any path segment starting with "_" is renamed (and every reference to it)
const renames = [];
for (const f of walk(dest)) {
  const rel = path.relative(dest, f).split(path.sep);
  if (rel.some((seg) => seg.startsWith("_"))) {
    const fixed = rel.map((seg) => (seg.startsWith("_") ? `u${seg.slice(1)}` : seg));
    const to = path.join(dest, ...fixed);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(f, to);
    renames.push([rel.join("/"), fixed.join("/")]);
  }
}
// Folders left empty by the renames go too.
const dirs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((d) => [...dirs(path.join(dir, d.name)), path.join(dir, d.name)]);
for (const d of dirs(dest)) if (!fs.readdirSync(d).length) fs.rmdirSync(d);

// 3. rewrite references
const textFiles = walk(dest).filter((f) => /\.(html|js|css|json|txt|webmanifest)$/.test(f));
const publicHits = new Set();
const publicRef = /(["'(])\/((?:brand|images|fonts|mushaf|icons?|learn|policies|prospectus|staff)\/[^"')\s?#]+|[a-z0-9-]+\.(?:png|svg|ico|webp|jpe?g|webmanifest|json|pdf|mp3|woff2?))(?=["')?#])/gi;
for (const f of textFiles) {
  let s = fs.readFileSync(f, "utf8");
  const ext = path.extname(f);
  const relToRoot = path.relative(path.dirname(f), dest).split(path.sep).join("/") || ".";
  for (const [from, to] of renames) s = s.split(from.replace(/^assets\//, "")).join(to.replace(/^assets\//, ""));
  if (ext === ".css") {
    // url(/_next/static/media/x) -> relative to this CSS file
    s = s.replace(/\/_next\/static\//g, `${relToRoot}/assets/static/`);
  } else {
    // Next checks its own script's address contains "/_next/" (asset-prefix.js): now "/assets/".
    s = s.replace(/indexOf\((["'])\/_next\/\1\)/g, "indexOf($1/assets/$1)");
    // HTML and JS resolve against the document (index.html at the top).
    s = s.replace(/(["'`(])\/_next\//g, "$1./assets/").replace(/\\u002F_next\\u002F/g, "./assets/").replace(/\/_next\/static\//g, "./assets/static/");
  }
  s = s.replace(publicRef, (m, q, p) => {
    const candidates = [path.join(pub, "learn", p), path.join(pub, p)];
    const hit = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
    if (!hit) return m;
    const out = path.join(dest, "public", p);
    if (!publicHits.has(out)) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.copyFileSync(hit, out);
      publicHits.add(out);
    }
    return `${q}${ext === ".css" ? `${relToRoot}/` : "./"}public/${p}`;
  });
  fs.writeFileSync(f, s);
}
// The favicon the demo layout links to.
if (fs.existsSync(path.join(pub, "favicon.svg"))) fs.copyFileSync(path.join(pub, "favicon.svg"), path.join(dest, "favicon.svg"));
// The sign-in page's logo.
fs.mkdirSync(path.join(dest, "brand"), { recursive: true });
fs.copyFileSync(path.join(pub, "brand", "ga-wordmark.png"), path.join(dest, "brand", "ga-wordmark.png"));

// 4. report and check the host's limits
const files = walk(dest);
const bytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);
const bad = files.map((f) => path.relative(dest, f)).filter((p) => p.split(path.sep).some((s) => s.startsWith("_")));
const absolute = [];
for (const f of files.filter((f) => /\.(html|js|css)$/.test(f))) {
  const s = fs.readFileSync(f, "utf8");
  if (/["'(]\/_next\//.test(s)) absolute.push(path.relative(dest, f));
}
console.log(`[demo] ${dest}: ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB, ${publicHits.size} public files copied`);
if (bad.length) console.log(`[demo] WARNING paths starting with "_": ${bad.slice(0, 5).join(", ")}`);
if (absolute.length) console.log(`[demo] WARNING absolute /_next references left in: ${absolute.slice(0, 5).join(", ")}`);
if (files.length > 450 || bytes > 60 * 1048576) {
  console.error("[demo] over the host's limits (450 files, 60 MB)");
  process.exit(1);
}
