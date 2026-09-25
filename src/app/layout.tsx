import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CookieConsent } from "@/components/CookieConsent";
import { Analytics } from "@/components/Analytics";
import { getSiteSettings } from "@/lib/content";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"], weight: ["500", "600", "700"] });

const siteUrl = "https://globalacademy.tarbiyyah.co.uk";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Tarbiyyah Global Academy — A British education, rooted in faith", template: "%s — Tarbiyyah Global Academy" },
  description:
    "An online school by the Tarbiyyah Education Trust. Live, timetabled British-curriculum lessons and Islamic Studies with qualified UK teachers, Reception to Year 11, launching January 2027.",
  openGraph: {
    type: "website",
    siteName: "Tarbiyyah Global Academy",
    url: siteUrl,
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Tarbiyyah Global Academy" }],
  },
  twitter: { card: "summary_large_image", images: ["/og-image.jpg"] },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon.png", type: "image/png", sizes: "256x256" }],
    apple: "/apple-touch-icon.png",
  },
};

// ink-900 — matches the brand's deep-ink token, not the old burgundy.
export const viewport: Viewport = { themeColor: "#1B1E21" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
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
      "An online British-curriculum school by the Tarbiyyah Education Trust — live, timetabled lessons with qualified UK teachers, Reception to Year 11, taught with tarbiyyah at its heart.",
    url: siteUrl,
    email: settings.admissionsEmail || "globalacademy@tarbiyyah.co.uk",
    ...(settings.contactPhone && { telephone: settings.contactPhone }),
    ...(settings.contactAddress && { address: { "@type": "PostalAddress", streetAddress: settings.contactAddress } }),
    areaServed: "Worldwide",
    parentOrganization: { "@type": "EducationalOrganization", name: "Tarbiyyah Education Trust", url: "https://tarbiyyaheducationtrust.com" },
  };

  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-ink">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <a href="#main" className="skip-link">Skip to content</a>
        <Header />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
        <CookieConsent />
        <Analytics />
      </body>
    </html>
  );
}
