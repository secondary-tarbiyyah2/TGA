"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export type Pronoun = "" | "he" | "she";

/**
 * The pronoun for a pupil, from the gender on their record (pupil_details,
 * which teachers of the pupil's classes can read). "" when not recorded, so
 * the AI uses the pupil's name instead. Owner, Nov 2026 (Tafweed T31): "under
 * pronoun we should have the pronoun of the kid already linked".
 */
export function usePupilPronoun(childId: string | null | undefined): Pronoun {
  const [pronoun, setPronoun] = useState<Pronoun>("");
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !childId) return;
    let cancelled = false;
    supabase
      .from("pupil_details")
      .select("gender")
      .eq("child_id", childId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const g = (data as { gender?: string | null } | null)?.gender;
        setPronoun(g === "male" ? "he" : g === "female" ? "she" : "");
      });
    return () => {
      cancelled = true;
    };
  }, [childId]);
  return pronoun;
}
