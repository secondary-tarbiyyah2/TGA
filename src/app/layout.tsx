import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { CookieConsent } from "@/components/CookieConsent";
import { Analytics } from "@/components/Analytics";
import { getSiteSettings } from "@/lib/content";
import { JsonLd } from "@/components/JsonLd";

// Fonts are self-hosted from src/app/fonts (OFL-licensed woff2 subsets, see
// the LICENSE-*.txt files there). This removes the build-time dependency on
// fonts.googleapis.com (builds no longer fail offline or behind a proxy) and
// the runtime third-party request, and lets the browser preload the Latin
// faces from our own origin.
const inter = localFont({
  variable: "--font-inter",
  display: "swap",
  src: [
    { path: "./fonts/inter-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/inter-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/inter-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/inter-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});
const spaceGrotesk = localFont({
  variable: "--font-space-grotesk",
  display: "swap",
  src: [
    { path: "./fonts/space-grotesk-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/space-grotesk-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/space-grotesk-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});
// Arabic script (Qur'an, Islamic Studies, Arabic terms). Not preloaded: the
// browser only downloads it on pages that actually show Arabic.
const amiri = localFont({
  variable: "--font-arabic",
  display: "swap",
  preload: false,
  src: [
    { path: "./fonts/amiri-arabic-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/amiri-arabic-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

const siteUrl = "https://globalacademy.tarbiyyah.co.uk";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Tarbiyyah Global Academy | Online Islamic school for homeschooling families", template: "%s | Tarbiyyah Global Academy" },
  description:
    "Online Islamic school for homeschooling families by Tarbiyyah Education Trust: live lessons, qualified teachers, Qur'an, Arabic and Islamic Studies with the national curriculum.",
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: "Tarbiyyah Global Academy",
    url: siteUrl,
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Tarbiyyah Global Academy" }],
  },
  twitter: { card: "summary_large_image", images: ["/og-image.jpg"] },
  // Google shows the site icon next to search results. It wants a square icon
  // in a multiple of 48px, and also checks /favicon.ico, so all are provided
  // (all the gold Global Academy mark, never the Trust's green logo).
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-48.png", type: "image/png", sizes: "48x48" },
      { url: "/icon-96.png", type: "image/png", sizes: "96x96" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

// ink-900, matches the brand's deep-ink token, not the old burgundy.
export const viewport: Viewport = { themeColor: "#1B1E21" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // This root layout is deliberately minimal: <html>/<body>, fonts, the
  // skip-link, cookie consent and analytics only. The public marketing
  // Header/Footer live one level down in src/app/(marketing)/layout.tsx, and
  // the authenticated /learn area has its own shell in
  // src/app/learn/layout.tsx, neither renders the other's chrome. Before
  // this split, EVERY /learn page rendered the public Header/Footer AND
  // AdminShell's own sidebar stacked on top of each other (reported as
  // "crowded... and it shows Log in even when I'm signed in").
  //
  // Built only from real, already-published fields, site settings (contact
  // phone/address) if set, and the Trust link already stated in the footer.
  // Never adds a rating, review or accreditation claim that isn't backed by
  // an actual confirmed field elsewhere on the site (see ground rule 2).
  const settings = await getSiteSettings();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: "Tarbiyyah Global Academy",
    description:
      "An online Islamic school for homeschooling families, by the Tarbiyyah Education Trust. Live, timetabled lessons with qualified teachers: Qur'an, Arabic and Islamic Studies alongside the full national curriculum, Year 1 to Year 11, taught with tarbiyyah at its heart.",
    url: siteUrl,
    logo: { "@type": "ImageObject", url: `${siteUrl}/brand/ga-logo-square.png`, width: 512, height: 512 },
    image: `${siteUrl}/brand/ga-wordmark.png`,
    email: settings.admissionsEmail || "globalacademy@tarbiyyah.co.uk",
    ...(settings.contactPhone && { telephone: settings.contactPhone }),
    ...(settings.contactAddress && { address: { "@type": "PostalAddress", streetAddress: settings.contactAddress } }),
    areaServed: "Worldwide",
    parentOrganization: { "@type": "EducationalOrganization", name: "Tarbiyyah Education Trust", url: "https://tarbiyyaheducationtrust.com" },
  };

  // Tells Google the site's own name, so results read "Tarbiyyah Global
  // Academy" rather than the parent domain "tarbiyyah.co.uk".
  const websiteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Tarbiyyah Global Academy",
    alternateName: ["Global Academy", "TGA"],
    url: siteUrl,
  };

  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${amiri.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-ink">
        <JsonLd data={jsonLd} />
        <JsonLd data={websiteLd} />
        <a href="#main" className="skip-link">Skip to content</a>
        {/* The `#main` skip-link target is rendered by the nested layout
            below (the public (marketing) group's <main id="main"> around
            Header/Footer, or /learn's own <main id="main"> in its shell), 
            not here, so there's never more than one <main> landmark on a
            page. */}
        <div className="flex flex-1 flex-col">{children}</div>
        <CookieConsent />
        <Analytics />
      </body>
    </html>
  );
}
