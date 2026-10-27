import type { Metadata, Viewport } from "next";
import { LearnLayoutShell } from "@/components/learn/LearnLayoutShell";

// The portal gets its own browser-tab title and description rather than
// inheriting the marketing homepage's, and is kept out of search results
// (the subdomain also sends an X-Robots-Tag noindex header; this is the
// in-page equivalent, in case that header is ever lost).
export const metadata: Metadata = {
  title: { absolute: "TGA Portal", template: "%s, TGA Portal" },
  description: "The Tarbiyyah Global Academy portal for parents, students and staff.",
  robots: { index: false, follow: false },
  openGraph: null,
  twitter: null,
  // Installable as an app ("Add to Home Screen" / "Install TGA Portal"): see
  // public/learn/app.webmanifest, public/learn/sw.js and the /install page.
  manifest: "/app.webmanifest",
  appleWebApp: { capable: true, title: "TGA Portal", statusBarStyle: "default" },
  icons: { apple: "/app-apple-touch-icon.png" },
};

// The installed app's title bar (and a phone's status bar) matches the
// portal's white top bar rather than the marketing site's dark header.
export const viewport: Viewport = { themeColor: "#FFFFFF" };

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return <LearnLayoutShell>{children}</LearnLayoutShell>;
}
