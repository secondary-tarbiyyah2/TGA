"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { installActivityRecorder, recordActivity, safePath } from "@/lib/learn/activityLog";

/** Mounted once in the /learn layout: starts the recent-activity log and
 * notes each page opened. Renders nothing. See src/lib/learn/activityLog.ts. */
export function ActivityRecorder() {
  const pathname = usePathname();
  useEffect(() => {
    installActivityRecorder();
  }, []);
  useEffect(() => {
    recordActivity("page", `Opened ${safePath(pathname, window.location.search)}`);
  }, [pathname]);
  return null;
}
