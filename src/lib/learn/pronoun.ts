"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export type Pronoun = "he" | "she";

/**
 * A pupil's pronoun from their record (the gender on pupil_details), via
 * public.pupil_pronoun() (0185): staff who may see the pupil get "he" or
 * "she"; anyone else, or a record without gender, gets null. Forms use it as
 * the starting value and staff can still change it for that document.
 */
export function usePupilPronoun(childId: string | null | undefined): Pronoun | null {
  const [p, setP] = useState<{ childId: string; pronoun: Pronoun | null } | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !childId) return;
    let cancelled = false;
    supabase.rpc("pupil_pronoun", { p_child_id: childId }).then(({ data, error }) => {
      if (cancelled || error) return;
      setP({ childId, pronoun: data === "he" || data === "she" ? data : null });
    });
    return () => {
      cancelled = true;
    };
  }, [childId]);
  // Never show one pupil's pronoun on another's form while the next one loads.
  return p && p.childId === childId ? p.pronoun : null;
}

/**
 * The pronoun field's state: starts from the record, and keeps whatever staff
 * choose once they change it. `fromRecord` says whether the current value
 * came from the record (for a "From the pupil's record" hint).
 */
export function usePronounField(childId: string | null | undefined): { value: string; set: (v: string) => void; fromRecord: boolean } {
  const recorded = usePupilPronoun(childId);
  const [chosen, setChosen] = useState<{ childId: string | null | undefined; value: string } | null>(null);
  const own = chosen && chosen.childId === childId ? chosen.value : null;
  return {
    value: own ?? recorded ?? "",
    set: (v: string) => setChosen({ childId, value: v }),
    fromRecord: own === null && recorded !== null,
  };
}
