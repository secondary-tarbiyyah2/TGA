import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { PrelaunchHome } from "@/components/prelaunch/PrelaunchHome";

// Served at "/" to the public while the site is under development (the
// PRE-LAUNCH block in public/.htaccess rewrites every page address here), so
// its canonical address is the homepage.
export const metadata: Metadata = pageMetadata({
  title: "Our website is under development",
  description: "Tarbiyyah Global Academy, a live online Islamic school for Year 1 to Year 11, opens in January 2027. Register your interest.",
  path: "",
});

export default function ComingSoonPage() {
  return <PrelaunchHome />;
}
