"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnSession } from "@/lib/learn/session";

export type PinnedLesson = { id: string; title: string; subject: string; year: string; unit: string | null };

/**
 * This person's pinned lessons (migration 0193): pin a lesson from its row or
 * workspace, find it again on the dashboard. Works quietly (no pins) before the
 * migration reaches the database.
 */
export function useLessonPins() {
  const { session } = useLearnSession();
  const userId = session && session !== "loading" ? session.user.id : null;
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [lessons, setLessons] = useState<PinnedLesson[] | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return;
    const { data, error } = await supabase
      .from("lesson_pins")
      .select("lesson_id, created_at, curriculum_lessons(id, title, subject, year, unit)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      setLessons([]);
      return;
    }
    const rows = (data as unknown as { lesson_id: string; curriculum_lessons: PinnedLesson | null }[]) || [];
    setIds(new Set(rows.map((r) => r.lesson_id)));
    setLessons(rows.map((r) => r.curriculum_lessons).filter((l): l is PinnedLesson => !!l));
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load this person's pins once signed in
    load();
  }, [load]);

  const toggle = useCallback(
    async (lessonId: string) => {
      const supabase = getSupabaseClient();
      if (!supabase || !userId) return;
      const on = ids.has(lessonId);
      setIds((s) => {
        const n = new Set(s);
        if (on) n.delete(lessonId);
        else n.add(lessonId);
        return n;
      });
      const { error } = on
        ? await supabase.from("lesson_pins").delete().eq("user_id", userId).eq("lesson_id", lessonId)
        : await supabase.from("lesson_pins").insert({ user_id: userId, lesson_id: lessonId });
      await load();
      return error ? "Couldn't change the pin. Try again." : null;
    },
    [ids, userId, load]
  );

  return { pinned: ids, lessons, toggle, reload: load };
}
