import type { MetadataRoute } from "next";

const siteUrl = "https://globalacademy.tarbiyyah.co.uk";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/studio", "/api"] }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
