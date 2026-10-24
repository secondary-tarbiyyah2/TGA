import type { MetadataRoute } from "next";
import { getKeyStages } from "@/lib/content";

export const dynamic = "force-static";

const siteUrl = "https://globalacademy.tarbiyyah.co.uk";

const routes = [
  "", "about", "curriculum", "admissions", "eligibility", "fees", "pastoral-care", "team",
  "testimonials", "faqs", "contact", "term-dates", "open-evening", "policies", "safeguarding", "book-a-call", "learning", "parents", "admissions/apply",
  "legal/privacy", "legal/cookies", "legal/terms", "accessibility",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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
