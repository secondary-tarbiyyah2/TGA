"use client";

import { useEffect, useState } from "react";
import { FaqAccordion } from "@/components/FaqAccordion";
import { getLiveFaqEntries } from "@/lib/content";
import type { FaqEntry } from "@/content/seed";

/**
 * The FAQ list. The build renders it first (so the page works without
 * JavaScript), then the browser re-reads the questions and the live fee
 * figures from the database, so an edit in the admin portal shows here
 * straight away, with no site rebuild.
 */
export function LiveFaq({ initialEntries }: { initialEntries: FaqEntry[] }) {
  const [entries, setEntries] = useState<FaqEntry[]>(initialEntries);

  useEffect(() => {
    let cancelled = false;
    void getLiveFaqEntries().then((live) => {
      if (!cancelled && live && live.length > 0) setEntries(live);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <FaqAccordion entries={entries} />;
}
