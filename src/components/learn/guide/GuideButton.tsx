"use client";

// "Guide me": the top-bar button that opens this page's guide in a side panel
// (a bottom sheet on phones). The ? key opens it too, unless you are typing.

import { useEffect } from "react";
import { Icon } from "@/components/learn/Icon";
import { toggleGuidePanel, useGuideState } from "./guideStore";

export const GUIDE_BUTTON_ID = "portal-guide-button";

function typing(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.closest("[role=dialog][aria-modal=true]");
}

export function GuideButton() {
  const { panel } = useGuideState();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      e.preventDefault();
      toggleGuidePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <button
      type="button"
      id={GUIDE_BUTTON_ID}
      data-guide="guide-button"
      data-tour="guide"
      onClick={toggleGuidePanel}
      aria-expanded={panel}
      aria-controls="portal-guide-panel"
      aria-keyshortcuts="?"
      title="Guide me: how this page works (press ?)"
      className="portal-topbar-btn whitespace-nowrap text-sm font-medium"
    >
      <Icon name="circleHelp" className="h-[18px] w-[18px]" />
      <span className="hidden md:inline">Guide me</span>
      <span className="sr-only md:hidden">Guide me</span>
    </button>
  );
}
