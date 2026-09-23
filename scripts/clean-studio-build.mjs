// `sanity build` copies the repo-root public/ folder into its output
// unconditionally (a documented feature for a custom Studio favicon/robots
// file, with no opt-out flag) — but that's the Next.js site's public folder,
// so it drags in our images, PHP endpoints and .htaccess. This removes
// anything in out/studio that's just a copy of something already in public/,
// leaving only what the Studio build itself actually produced
// (index.html, static/, and its own generated favicon.ico).
import { readdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const publicDir = join(root, "public");
const studioDir = join(root, "out", "studio");

if (!existsSync(studioDir)) {
  console.error(`No Studio build found at ${studioDir} — run "sanity build out/studio" first.`);
  process.exit(1);
}

const publicEntries = new Set(readdirSync(publicDir));
let removed = 0;

for (const entry of readdirSync(studioDir)) {
  if (publicEntries.has(entry)) {
    rmSync(join(studioDir, entry), { recursive: true, force: true });
    removed++;
  }
}

console.log(`Cleaned ${removed} public/ passthrough entr${removed === 1 ? "y" : "ies"} out of out/studio.`);
