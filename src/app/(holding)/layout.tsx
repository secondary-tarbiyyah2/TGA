import { PrelaunchFooter, PrelaunchHeader } from "@/components/prelaunch/PrelaunchChrome";

// The public holding page's chrome (see src/lib/prelaunch.ts): logo, an
// under-development notice and a footer with the legal links, nothing else.
export default function HoldingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PrelaunchHeader />
      <main id="main" className="flex-1" data-site="public">
        {children}
      </main>
      <PrelaunchFooter />
    </>
  );
}
