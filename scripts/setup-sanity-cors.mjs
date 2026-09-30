// One-time (idempotent — safe to re-run) setup: registers the domain(s)
// Sanity Studio is served from as CORS origins on the Sanity project.
// Without this, the Studio app at /studio loads its JS shell fine (that's
// just static files from FTP) but every API call it makes to Sanity's
// backend — including login — is rejected by the browser, which is exactly
// what "Studio isn't working" looks like: a shell that never gets past
// loading/login with no obvious error on screen.
//
// Reuses the same SANITY_MANAGEMENT_TOKEN already set up for
// setup-sanity-webhook.mjs (see SETUP.md) — that token's access level
// (Editor or Administrator) must be enough to manage CORS origins; if it
// isn't, this script's error will say so and the fix is to add the origin
// by hand at sanity.io/manage > your project > API > CORS origins instead.
//
// Run via: node scripts/setup-sanity-cors.mjs
import { createClient } from "@sanity/client";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const managementToken = process.env.SANITY_MANAGEMENT_TOKEN;

if (!projectId || !managementToken) {
  console.error("Missing NEXT_PUBLIC_SANITY_PROJECT_ID or SANITY_MANAGEMENT_TOKEN");
  process.exit(1);
}

// The main site is where Studio is actually served (out-main/studio, per
// deploy-site.yml) — that's the origin the browser sends when Studio's own
// JS calls the Sanity API. allowCredentials is required because Studio's
// login flow relies on cookies.
const ORIGINS = [
  { origin: "https://globalacademy.tarbiyyah.co.uk", allowCredentials: true },
];

const client = createClient({ projectId, token: managementToken, apiVersion: "2025-01-01", useCdn: false });

const existing = await client.request({ url: `/projects/${projectId}/cors`, method: "GET" });

for (const wanted of ORIGINS) {
  const match = existing.find((o) => o.origin === wanted.origin);
  if (match) {
    console.log(`Already registered: ${wanted.origin} (id ${match.id}, credentials: ${match.allowCredentials})`);
    continue;
  }
  const created = await client.request({ url: `/projects/${projectId}/cors`, method: "POST", body: wanted });
  console.log(`Registered CORS origin ${wanted.origin} (id ${created.id}).`);
}

console.log("Sanity Studio CORS origins are up to date.");
