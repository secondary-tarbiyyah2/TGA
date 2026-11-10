import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MobileCtaBar } from "@/components/MobileCtaBar";
import { BreadcrumbSchema, Breadcrumbs } from "@/components/BreadcrumbSchema";
import { RelatedLinks } from "@/components/RelatedLinks";
import { StaffPreviewBadge } from "@/components/prelaunch/StaffPreviewBadge";
import { JourneyBar, JourneyNext } from "@/components/JourneyBar";
import { SiteSearch } from "@/components/SiteSearch";

// The public marketing site's chrome, every route in this `(marketing)`
// group (the homepage plus About/Admissions/Fees/etc.) gets this Header and
// Footer. This route group exists ONLY to scope that chrome away from
// `/learn`, which has its own layout (src/app/learn/layout.tsx) and never
// renders this Header/Footer. The group segment `(marketing)` doesn't affect
// any URL, `/about` still builds to `/about/`, exactly as before this file
// existed.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main id="main" className="flex-1">
        <Breadcrumbs />
        <JourneyBar />
        {children}
        <JourneyNext />
        <RelatedLinks />
      </main>
      <Footer />
      <MobileCtaBar />
      <BreadcrumbSchema />
      <StaffPreviewBadge />
      <SiteSearch />
    </>
  );
}
