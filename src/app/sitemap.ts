import type { MetadataRoute } from "next";
import { getKeyStages } from "@/lib/content";
import { PRELAUNCH } from "@/lib/prelaunch";

export const dynamic = "force-static";

const siteUrl = "https://globalacademy.tarbiyyah.co.uk";

const routes = [
  "", "about", "curriculum", "admissions", "eligibility", "fees", "pastoral-care", "team",
  "testimonials", "faqs", "contact", "term-dates", "open-evening", "policies", "safeguarding", "book-a-call", "learning", "parents", "admissions/apply",
  "legal/privacy", "legal/cookies", "legal/terms", "accessibility",
];

// Pre-launch: only the pages that are open (src/lib/prelaunch.ts).
const prelaunchRoutes = ["", "open-evening", "admissions/apply", "legal/privacy", "legal/cookies", "legal/terms"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (PRELAUNCH) {
    return prelaunchRoutes.map((route) => ({ url: route ? `${siteUrl}/${route}/` : `${siteUrl}/`, lastModified: new Date() }));
  }
  const keyStages = await getKeyStages();
  const staticRoutes = routes.map((route) => ({
    // Trailing slash matches the exported URLs (trailingSlash: true) and each page's canonical.
    url: route ? `${siteUrl}/${route}/` : `${siteUrl}/`,
    lastModified: new Date(),
  }));
  const curriculumRoutes = keyStages.map((ks) => ({
    url: `${siteUrl}/curriculum/${ks.slug}/`,
    lastModified: new Date(),
  }));
  return [...staticRoutes, ...curriculumRoutes];
}
