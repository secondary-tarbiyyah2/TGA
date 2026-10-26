import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const siteUrl = "https://globalacademy.tarbiyyah.co.uk";

export default function robots(): MetadataRoute.Robots {
  return {
    // /staff and /portal 301-redirect to the /learn subdomain's /login at the
    // server level (see public/.htaccess) and no longer exist as their own
    // pages — kept in the disallow list defensively in case a crawler still
    // has the old URL indexed. /learn itself no longer exists under this
    // domain at all (it moved to its own subdomain, which carries its own
    // noindex header on every response — see public/.htaccess and the
    // out-learn .htaccess built by scripts/split-static-export.mjs); the
    // /learn/* bridge page left behind here for old bookmarked links is
    // marked noindex via a header rather than disallow, so it can still be
    // crawled-and-redirected rather than silently ignored.
    // The staff preview link (/?preview=...) and the holding pages' internal
    // addresses (/coming-soon/...) are kept out of search results too.
    rules: [{ userAgent: "*", allow: "/", disallow: ["/studio", "/staff", "/portal", "/manage-booking", "/sample-lesson", "/coming-soon/", "/*?preview="] }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
