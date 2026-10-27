"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { myTeachingClasses } from "@/lib/learn/classes";

export type MyClassOption = { id: string; name: string; subject_id: string | null };

/**
 * The signed-in teacher/TA's own classes (myTeachingClasses: role,
 * subject mapping or published timetable) · the same query that was previously copy-pasted (with
 * small drifts) across /teach/homework, /teach/assessment and
 * /teach/reports. Centralised here so the three pickers stay in sync
 * instead of quietly diverging.
 *
 * `autoSelectFirst` mirrors each page's previous behaviour: homework/
 * assessment only defaulted the selection if nothing was chosen yet,
 * reports always defaulted on load, both are safe to run once, since this
 * only fires on mount, not on every subsequent re-render.
 */
export function useMyClasses(autoSelectFirst: (firstId: string) => void = () => {}) {
  const supabase = getSupabaseClient();
  const [classes, setClasses] = useState<MyClassOption[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const opts: MyClassOption[] = (await myTeachingClasses()).map((c) => ({ id: c.id, name: c.name, subject_id: c.subject_id }));
      if (cancelled) return;
      setClasses(opts);
      if (opts[0]) autoSelectFirst(opts[0].id);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- autoSelectFirst is a setter callback, not a reactive dependency; re-running on every render would defeat "only default once"
  }, [supabase]);

  return classes;
}
