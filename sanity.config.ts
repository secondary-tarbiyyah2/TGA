/**
 * Config for the Sanity Studio admin panel — a standalone static React app,
 * built via the Sanity CLI (`npm run sanity:build`, see README) into
 * out/studio/, so it deploys to <site>/studio alongside the rest of the
 * statically-exported site. It costs the server nothing at runtime: it's
 * just more static files, exactly like every other page.
 */
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { apiVersion, dataset, projectId } from "@/lib/sanity/env";
import { schema } from "@/sanity/schemaTypes";
import { structure } from "@/sanity/structure";

export default defineConfig({
  basePath: "/studio",
  projectId,
  dataset,
  schema,
  plugins: [
    structureTool({ structure }),
    // Vision lets editors run GROQ queries against the dataset for debugging.
    ...(process.env.NODE_ENV === "development" ? [visionTool({ defaultApiVersion: apiVersion })] : []),
  ],
  // Without this, Sanity's Vite build auto-copies the repo-root public/
  // folder (the Next.js site's own static assets) into the Studio bundle —
  // Studio doesn't need any of it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sanity's own vite config type isn't exported cleanly
  vite: (config: any) => ({ ...config, publicDir: false }),
});
