"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DEFAULT_QUIZ_CONFIG } from "./defaultConfig";
import type { QuizConfig } from "./schema";

export type LoadedQuizConfig = {
  config: QuizConfig;
  versionId: string | null; // null when running on the bundled fallback (no Supabase / nothing published yet)
  publishedAt: string | null;
  loading: boolean;
};

/**
 * Loads the currently PUBLISHED quiz config from Supabase (RLS: anon can
 * only read status = 'published', see 0016_eligibility_quiz_v2.sql), and
 * falls back to the bundled DEFAULT_QUIZ_CONFIG, same "hide/fallback
 * gracefully, never invent" pattern as getFeeBands()/getSiteSettings(), 
 * whenever Supabase isn't configured, nothing has been published yet, or
 * the fetch fails outright.
 */
export function useQuizConfig(): LoadedQuizConfig {
  const [state, setState] = useState<LoadedQuizConfig>({
    config: DEFAULT_QUIZ_CONFIG,
    versionId: null,
    publishedAt: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseClient();
    if (!supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load with no external subscription, not a render-cycle sync
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    supabase
      .from("quiz_config_versions")
      .select("id, content, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(
        ({ data }) => {
          if (cancelled) return;
          if (data && data.content) {
            setState({
              config: data.content as unknown as QuizConfig,
              versionId: data.id as string,
              publishedAt: (data.published_at as string) ?? null,
              loading: false,
            });
          } else {
            setState((s) => ({ ...s, loading: false }));
          }
        },
        () => {
          if (!cancelled) setState((s) => ({ ...s, loading: false }));
        }
      );
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
