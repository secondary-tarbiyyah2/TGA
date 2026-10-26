import type { Metadata, Viewport } from "next";
import { Amiri, Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { CookieConsent } from "@/components/CookieConsent";
import { Analytics } from "@/components/Analytics";
import { getSiteSettings } from "@/lib/content";
import { JsonLd } from "@/components/JsonLd";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"], weight: ["500", "600", "700"] });
// Arabic script (Qur'an, Islamic Studies, Arabic terms). Not preloaded: the
// browser only downloads it on pages that actually show Arabic.
const amiri = Amiri({ variable: "--font-arabic", subsets: ["arabic"], weight: ["400", "700"], preload: false });

const siteUrl = "https://globalacademy.tarbiyyah.co.uk";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Tarbiyyah Global Academy — A specialist, quality education, rooted in faith", template: "%s — Tarbiyyah Global Academy" },
  description:
    "An online school by the Tarbiyyah Education Trust, delivering a specialist, quality education wherever home is. Live, timetabled lessons with qualified teachers — Qur'an, Arabic and Islamic Studies alongside the full national curriculum, Year 1 to Year 11, launching January 2027.",
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

// ink-900 — matches the brand's deep-ink token, not the old burgundy.
export const viewport: Viewport = { themeColor: "#1B1E21" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // This root layout is deliberately minimal: <html>/<body>, fonts, the
  // skip-link, cookie consent and analytics only. The public marketing
  // Header/Footer live one level down in src/app/(marketing)/layout.tsx, and
  // the authenticated /learn area has its own shell in
  // src/app/learn/layout.tsx — neither renders the other's chrome. Before
  // this split, EVERY /learn page rendered the public Header/Footer AND
  // AdminShell's own sidebar stacked on top of each other (reported as
  // "crowded... and it shows Log in even when I'm signed in").
  //
  // Built only from real, already-published fields — site settings (contact
  // phone/address) if set, and the Trust link already stated in the footer.
  // Never adds a rating, review or accreditation claim that isn't backed by
  // an actual confirmed field elsewhere on the site (see ground rule 2).
  const settings = await getSiteSettings();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: "Tarbiyyah Global Academy",
    description:
      "A specialist online school by the Tarbiyyah Education Trust — live, timetabled lessons with qualified teachers — Qur'an, Arabic and Islamic Studies alongside the full national curriculum, Year 1 to Year 11, taught with tarbiyyah at its heart.",
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
            Header/Footer, or /learn's own <main id="main"> in its shell) —
            not here, so there's never more than one <main> landmark on a
            page. */}
        <div className="flex flex-1 flex-col">{children}</div>
        <CookieConsent />
        <Analytics />
      </body>
    </html>
  );
}
