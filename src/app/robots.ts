import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const siteUrl = "https://globalacademy.tarbiyyah.co.uk";

export default function robots(): MetadataRoute.Robots {
  return {
    // /staff and /portal 301-redirect to /learn/login at the server level (see
    // public/.htaccess) and no longer exist as their own pages — kept in the
    // disallow list defensively in case a crawler still has the old URL indexed.
    rules: [{ userAgent: "*", allow: "/", disallow: ["/studio", "/learn", "/staff", "/portal"] }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
