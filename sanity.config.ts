/**
 * Config for the Sanity Studio admin panel, run via the Sanity CLI
 * (`npm run sanity:dev` / `npm run sanity:deploy`) — see README. Not embedded
 * in the Next.js app: the site is statically exported for a memory-constrained
 * shared server, and Sanity's own free hosted Studio (<project>.sanity.studio)
 * costs that server nothing at all.
 */
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { apiVersion, dataset, projectId } from "@/lib/sanity/env";
import { schema } from "@/sanity/schemaTypes";
import { structure } from "@/sanity/structure";

export default defineConfig({
  projectId,
  dataset,
  schema,
  plugins: [
    structureTool({ structure }),
    // Vision lets editors run GROQ queries against the dataset for debugging.
    ...(process.env.NODE_ENV === "development" ? [visionTool({ defaultApiVersion: apiVersion })] : []),
  ],
});
