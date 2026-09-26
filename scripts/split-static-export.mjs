// Splits the single `next build` static export (`out/`) into the two
// document roots this site now deploys to (see deploy-site.yml and
// SETUP.md, "Moving /learn to its own subdomain"):
//
//   out-main/  — everything except /learn, for the main domain
//                (globalacademy.tarbiyyah.co.uk).
//   out-learn/ — the contents of /learn, PROMOTED TO ROOT (so
//                "/learn/login/" becomes "/login/"), for the new subdomain
//                (learn.globalacademy.tarbiyyah.co.uk).
//
// Why not two separate builds? Next's static export shares one `_next/`
// asset directory (JS/CSS chunks, fonts) across every route, including
// between /learn and the marketing pages (they share the root layout, its
// fonts, and globals.css). There's no CDN in front of this site (see
// next.config.ts/deploy-site.yml — deliberately, to fit a 2GB shared host),
// so there's nowhere for both origins to fetch a SHARED copy of `_next/`
// from; the simplest correct fix is to duplicate that folder (plus the
// handful of top-level static assets /learn's own layout references, e.g.
// public/brand's wordmark) into both document roots. This roughly doubles
// the size of `_next/` in the deploy, which is a non-issue for a static
// export this small — trading a little transfer for not needing any new
// infrastructure (matching how this project has avoided a CDN everywhere
// else).
//
// Run after `next build` (see package.json's "build" script and
// deploy-site.yml). Idempotent — safe to re-run; wipes and rebuilds both
// output directories from `out/` each time.
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(repoRoot, "out");
const outMainDir = path.join(repoRoot, "out-main");
const outLearnDir = path.join(repoRoot, "out-learn");
const learnSourceDir = path.join(outDir, "learn");

// Top-level static files/directories (beyond the promoted /learn contents
// themselves) that /learn's own pages reference directly and so must exist
// at the subdomain's root too — checked against what src/app/learn actually
// uses (the wordmark in src/app/learn/layout.tsx, plus the browser-chrome
// favicons every page implicitly requests via src/app/layout.tsx's
// metadata.icons). Kept as an explicit list, not "copy everything", so a
// stray marketing-only asset doesn't quietly end up served from the portal
// subdomain too.
const SHARED_ASSET_PATHS = ["_next", "brand", "favicon.svg", "favicon.png", "apple-touch-icon.png"];

async function main() {
  if (!existsSync(outDir)) {
    console.error(`::error::${outDir} does not exist — run \`next build\` first.`);
    process.exit(1);
  }
  if (!existsSync(learnSourceDir)) {
    console.error(`::error::${learnSourceDir} does not exist — expected the /learn route to have built. Nothing to split.`);
    process.exit(1);
  }

  await rm(outMainDir, { recursive: true, force: true });
  await rm(outLearnDir, { recursive: true, force: true });

  // out-main: everything in out/, minus /learn (promoted into out-learn
  // below instead) — plus the migration bridge page at the same /learn
  // path old links already point at (see deploy/learn-bridge.html).
  console.log(`Copying ${outDir} -> ${outMainDir} ...`);
  await cp(outDir, outMainDir, { recursive: true });
  await rm(path.join(outMainDir, "learn"), { recursive: true, force: true });
  await mkdir(path.join(outMainDir, "learn"), { recursive: true });
  await cp(path.join(repoRoot, "deploy", "learn-bridge.html"), path.join(outMainDir, "learn", "index.html"));

  // out-learn: /learn's contents promoted to root, plus the shared assets
  // it depends on, plus its own dedicated .htaccess (CSP/no-cache/noindex
  // unconditionally — see deploy/learn-subdomain.htaccess).
  console.log(`Copying ${learnSourceDir} -> ${outLearnDir} (promoted to root) ...`);
  await mkdir(outLearnDir, { recursive: true });
  await cp(learnSourceDir, outLearnDir, { recursive: true });

  for (const assetPath of SHARED_ASSET_PATHS) {
    const src = path.join(outDir, assetPath);
    if (!existsSync(src)) {
      console.warn(`::warning::Expected shared asset "${assetPath}" not found in ${outDir} — skipping.`);
      continue;
    }
    await cp(src, path.join(outLearnDir, assetPath), { recursive: true });
  }

  await cp(path.join(repoRoot, "deploy", "learn-subdomain.htaccess"), path.join(outLearnDir, ".htaccess"));

  const [mainTop, learnTop] = await Promise.all([readdir(outMainDir), readdir(outLearnDir)]);
  console.log("");
  console.log(`out-main/  (${mainTop.length} top-level entries): ${mainTop.sort().join(", ")}`);
  console.log(`out-learn/ (${learnTop.length} top-level entries): ${learnTop.sort().join(", ")}`);
}

main();
