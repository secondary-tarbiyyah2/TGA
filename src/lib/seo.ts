import type { Metadata } from "next";

export const SITE_URL = "https://globalacademy.tarbiyyah.co.uk";
export const SITE_NAME = "Tarbiyyah Global Academy";

/**
 * Per-page metadata with a canonical URL and matching Open Graph / Twitter
 * tags. A page-level `openGraph` replaces the root layout's wholesale in the
 * Metadata API (it is not deep-merged), so the share image is repeated here.
 * `path` is the route without a trailing slash ("/fees", "" for home) · the
 * site is exported with trailingSlash, so the canonical gets one.
 */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const canonical = path ? `${path.replace(/\/$/, "")}/` : "/";
  const fullTitle = `${title} | ${SITE_NAME}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: canonical,
      title: fullTitle,
      description,
      images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: ["/og-image.jpg"] },
  };
}

/** BreadcrumbList JSON-LD (Home > ... > current page). */
export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...trail].map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: `${SITE_URL}${t.path === "/" ? "/" : `${t.path.replace(/\/$/, "")}/`}`,
    })),
  };
}
