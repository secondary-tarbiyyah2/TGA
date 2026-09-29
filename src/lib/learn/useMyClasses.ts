"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export type MyClassOption = { id: string; name: string; subject_id: string | null };

/**
 * The signed-in teacher/TA's own classes, from their class-scoped
 * user_roles rows — the same query that was previously copy-pasted (with
 * small drifts) across /teach/homework, /teach/assessment and
 * /teach/reports. Centralised here so the three pickers stay in sync
 * instead of quietly diverging.
 *
 * `autoSelectFirst` mirrors each page's previous behaviour: homework/
 * assessment only defaulted the selection if nothing was chosen yet,
 * reports always defaulted on load — both are safe to run once, since this
 * only fires on mount, not on every subsequent re-render.
 */
export function useMyClasses(autoSelectFirst: (firstId: string) => void = () => {}) {
  const supabase = getSupabaseClient();
  const [classes, setClasses] = useState<MyClassOption[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("scope_id, classes(id, name, subject_id)")
        .eq("user_id", user.id)
        .eq("scope_type", "class");
      if (cancelled) return;
      const opts = ((roleRows as unknown as { scope_id: string; classes: MyClassOption | null }[]) || [])
        .map((r) => r.classes)
        .filter(Boolean) as MyClassOption[];
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
