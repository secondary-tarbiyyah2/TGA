"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState, ui } from "@/components/learn/ui";
import { FEATURES, useFeature, type FeatureKey } from "@/lib/learn/features";

/** Shows its children only while the Headteacher has this School feature on
 * (Settings, School features). Off, a page says so in place of its content;
 * with `quiet`, nothing at all is shown (a button, a tab, a panel). */
export function FeatureGate({ feature, children, quiet = false, home }: { feature: FeatureKey; children: ReactNode; quiet?: boolean; home?: string }) {
  const on = useFeature(feature);
  if (on) return <>{children}</>;
  if (quiet) return null;
  const label = FEATURES.find((f) => f.key === feature)?.label || "This part of the portal";
  return (
    <EmptyState
      title={`${label} is switched off`}
      icon="circleHelp"
      action={
        home ? (
          <Link href={home} className={ui.btnSecondary}>
            Back to Today
          </Link>
        ) : undefined
      }
    >
      The Headteacher has switched this off for now. Nothing has been deleted: it will be here again when it is switched back on.
    </EmptyState>
  );
}
