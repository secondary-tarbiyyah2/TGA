// One-off targeted patch to the live siteSettings singleton, unlike
// seed-sanity.mjs (createOrReplace, full document), this only sets the
// specific fields given so it never clobbers other fields an admin may have
// already edited in Studio since seeding.
//
// Usage: node scripts/patch-site-settings.mjs '{"applicationFee":150}'
// Requires SANITY_API_TOKEN and NEXT_PUBLIC_SANITY_PROJECT_ID.
import { createClient } from "@sanity/client";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const token = process.env.SANITY_API_TOKEN;
const patchJson = process.argv[2];

if (!projectId || !token || !patchJson) {
  console.error('Usage: SANITY_API_TOKEN=... NEXT_PUBLIC_SANITY_PROJECT_ID=... node scripts/patch-site-settings.mjs \'{"field":"value"}\'');
  process.exit(1);
}

const fields = JSON.parse(patchJson);
const client = createClient({ projectId, dataset, token, apiVersion: "2025-01-01", useCdn: false });

const before = await client.getDocument("siteSettings");
console.log("Before:", JSON.stringify(before, null, 2));

const after = await client.patch("siteSettings").set(fields).commit();
console.log("After:", JSON.stringify(after, null, 2));
