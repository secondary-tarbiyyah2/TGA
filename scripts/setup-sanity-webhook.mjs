// One-time (idempotent — safe to re-run) setup: creates/updates a Sanity
// webhook that fires on every publish and triggers a rebuild+redeploy of
// the site via GitHub's repository_dispatch API. Without this, publishing
// content in Studio changes nothing live until someone next pushes code or
// manually runs "Deploy site" — this closes that gap, which matters
// because the site is statically exported (no server to re-fetch at
// request time; see src/lib/content.ts).
//
// Requires:
//   SANITY_MANAGEMENT_TOKEN — a Sanity token with "Manage webhooks" access
//     (Project Settings > API > Tokens in sanity.io/manage). Not the same
//     as the dataset write token this project already uses for seeding.
//   GH_DISPATCH_TOKEN — a fine-grained GitHub PAT scoped to ONLY this repo,
//     with just the "Actions: write" permission (nothing else) — that's
//     the minimum needed to fire repository_dispatch. Generate at
//     github.com/settings/personal-access-tokens/new.
//   NEXT_PUBLIC_SANITY_PROJECT_ID, NEXT_PUBLIC_SANITY_DATASET (or defaults
//     to "production").
//
// Run via: node scripts/setup-sanity-webhook.mjs
import { createClient } from "@sanity/client";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const managementToken = process.env.SANITY_MANAGEMENT_TOKEN;
const ghToken = process.env.GH_DISPATCH_TOKEN;
const repo = process.env.GITHUB_REPOSITORY || "secondary-tarbiyyah2/TGA";

if (!projectId || !managementToken || !ghToken) {
  console.error("Missing NEXT_PUBLIC_SANITY_PROJECT_ID, SANITY_MANAGEMENT_TOKEN, or GH_DISPATCH_TOKEN");
  process.exit(1);
}

const HOOK_NAME = "auto-rebuild-on-publish";
const client = createClient({ projectId, dataset, token: managementToken, apiVersion: "2025-01-01", useCdn: false });

// Sanity webhooks can only POST to a fixed URL with a fixed body — they
// can't template the GitHub PAT into the Authorization header per-request
// in a way that avoids storing it in Sanity's own webhook config. That
// config is visible to anyone with "manage webhooks" access on the Sanity
// project, same trust tier as this script's own SANITY_MANAGEMENT_TOKEN,
// which is why GH_DISPATCH_TOKEN is scoped down to nothing but
// Actions:write on this one repo — the narrowest permission that can do
// this job, so a leaked webhook config can't do more than trigger a
// rebuild.
const hookConfig = {
  name: HOOK_NAME,
  type: "document",
  dataset,
  url: `https://api.github.com/repos/${repo}/dispatches`,
  httpMethod: "POST",
  apiVersion: "v2021-03-25",
  includeDrafts: false,
  trigger: ["create", "update", "delete"],
  headers: {
    Authorization: `Bearer ${ghToken}`,
    Accept: "application/vnd.github+json",
  },
  // Sanity's webhook body is a fixed JSON payload describing the change,
  // not templatable to GitHub's {event_type, client_payload} shape — so
  // this points instead at a minimal, static body via the "projection"
  // field, which Sanity DOES let you customize per-hook.
  projection: `{"event_type": "sanity-content-published"}`,
};

const existing = await client.request({ url: `/hooks/projects/${projectId}`, method: "GET" });
const match = existing.find((h) => h.name === HOOK_NAME);

if (match) {
  await client.request({ url: `/hooks/projects/${projectId}/${match.id}`, method: "PUT", body: hookConfig });
  console.log(`Updated existing webhook "${HOOK_NAME}" (id ${match.id}).`);
} else {
  const created = await client.request({ url: `/hooks/projects/${projectId}`, method: "POST", body: hookConfig });
  console.log(`Created webhook "${HOOK_NAME}" (id ${created.id}).`);
}

console.log(`Publishing any document in Sanity Studio will now trigger a rebuild of ${repo}.`);
