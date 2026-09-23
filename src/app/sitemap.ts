import type { MetadataRoute } from "next";
import { keyStages } from "@/content/curriculum";

export const dynamic = "force-static";

const siteUrl = "https://globalacademy.tarbiyyah.co.uk";

const routes = [
  "", "about", "curriculum", "admissions", "fees", "flexible-learning", "pastoral-care", "team",
  "testimonials", "faqs", "contact", "term-dates", "open-evening", "portal", "policies",
  "legal/privacy", "legal/cookies", "legal/terms",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = routes.map((route) => ({
    url: `${siteUrl}/${route}`.replace(/\/$/, "") || siteUrl,
    lastModified: new Date(),
  }));
  const curriculumRoutes = keyStages.map((ks) => ({
    url: `${siteUrl}/curriculum/${ks.slug}`,
    lastModified: new Date(),
  }));
  return [...staticRoutes, ...curriculumRoutes];
}
