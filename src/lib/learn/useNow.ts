"use client";

import { useState } from "react";

/**
 * The current time in milliseconds, captured once when the component first
 * renders. Use this instead of calling Date.now() while rendering: React
 * requires render to be pure, and a value that changes on every render can
 * make the same screen show different results each time it redraws.
 * "Overdue", "upcoming" and "link expired" labels only need the time the page
 * was opened, so a value fixed at mount is exactly right for them.
 */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
