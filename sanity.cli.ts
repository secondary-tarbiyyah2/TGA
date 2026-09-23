import { defineCliConfig } from "sanity/cli";

/**
 * Config for the Sanity CLI (`sanity build`, `sanity deploy`, `sanity dev`) —
 * separate from sanity.config.ts, which configures the Studio app itself.
 * Reads the same env vars as the Next.js site (see .env.example).
 */
export default defineCliConfig({
  api: {
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
  },
});
