"use client";

// Mounted once by the portal shell: the Guide me panel for the current page,
// and the "Show me" spotlight. Everything here is the Portal guide
// (src/content/portal-guide); the first-sign-in tour stays in TourHost.

import { usePathname } from "next/navigation";
import { useEffect, useMemo } from "react";
import type { PortalArea } from "@/lib/learn/nav";
import { markGuideLearned, usePortalPrefs } from "@/lib/learn/portalPrefs";
import { GuidePanel } from "./GuidePanel";
import { GuideSpotlight } from "./GuideSpotlight";
import { closeGuidePanel, endSpot, moveSpot, openGuidePanel, useGuideState } from "./guideStore";
import { useGuideContent } from "./useGuideContent";

export function GuideHost({ area, roles, userId }: { area: PortalArea; roles: string[]; userId: string }) {
  const { panel, spot } = useGuideState();
  const pathname = usePathname() || "/";
  const prefs = usePortalPrefs(userId);
  const content = useGuideContent(panel || !!spot);
  const role = useMemo(() => content?.guideRoleFor(area, roles) ?? null, [content, area, roles]);
  const entries = role && content ? content.GUIDE[role] : null;
  const entry = role && content ? content.guideEntryFor(role, pathname) : null;

  // A new page closes a Show me that belonged to the old one. A link from the
  // Portal guide (?guide=1) opens the new page's guide straight away.
  useEffect(() => {
    if (spot?.kind === "show") endSpot();
    if (new URLSearchParams(window.location.search).get("guide") === "1") openGuidePanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on navigation
  }, [pathname]);

  // The phone menu and the guide never sit on top of each other.
  useEffect(() => {
    const close = () => closeGuidePanel();
    window.addEventListener("tga-close-guide", close);
    return () => window.removeEventListener("tga-close-guide", close);
  }, []);

  return (
    <>
      {panel && role && <GuidePanel entry={entry} role={role} entries={entries} learned={prefs.guide.learned} pathname={pathname} />}
      {panel && !role && (
        <div id="portal-guide-panel" role="status" className="portal fixed bottom-4 right-4 z-[60] rounded-xl border border-gold-light bg-white px-4 py-3 text-sm shadow-xl">
          Loading the guide…
        </div>
      )}
      {spot?.kind === "show" && (
        <GuideSpotlight
          heading={spot.heading}
          steps={spot.steps}
          index={spot.index}
          onMove={moveSpot}
          onStop={() => {
            endSpot();
            openGuidePanel();
          }}
          onFinish={() => {
            markGuideLearned(spot.key, { shown: true });
            endSpot();
            openGuidePanel();
          }}
        />
      )}
    </>
  );
}
