import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: the whole site builds to plain HTML/CSS/JS with no Node.js
  // server needed at runtime. Chosen over `next start` because this site is
  // deployed onto a 2GB shared server already running WordPress — a
  // persistent Node process there risks starving both sites under load.
  // Build happens in CI/locally; only the generated `out/` folder (plus the
  // PHP form endpoints in public/) is deployed to the server.
  output: "export",

  // No Node server means no on-demand image optimisation endpoint.
  images: { unoptimized: true },

  // Emits <route>/index.html for every page (not <route>.html), so Apache's
  // default DirectoryIndex serves clean URLs without any rewrite rules.
  trailingSlash: true,
};

export default nextConfig;
