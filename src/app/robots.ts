import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const siteUrl = "https://globalacademy.tarbiyyah.co.uk";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/studio", "/learn", "/staff", "/portal"] }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
