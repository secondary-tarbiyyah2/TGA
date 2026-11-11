"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const cache = new Map<string, Promise<string | null>>();

/** A signed link to a quiz image in homework-attachments (staff and the class's pupils may read it). */
export function quizImageUrl(path: string): Promise<string | null> {
  if (!cache.has(path)) {
    const supabase = getSupabaseClient();
    cache.set(
      path,
      supabase
        ? supabase.storage
            .from("homework-attachments")
            .createSignedUrl(path, 60 * 60 * 3)
            .then(({ data }) => data?.signedUrl ?? null)
        : Promise.resolve(null),
    );
  }
  return cache.get(path)!;
}

export function useQuizImage(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (path) quizImageUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);
  return path ? url : null;
}

/** A question's image, with numbered pins for "label a diagram" (pins carry x, y from 0 to 1). */
export function QuizImage({ path, pins, highlight }: { path: string; pins?: { x: number; y: number }[]; highlight?: number }) {
  const url = useQuizImage(path);
  if (!url) return <div className="h-40 w-full max-w-md motion-safe:animate-pulse rounded-lg bg-cream" aria-label="Loading the image" />;
  return (
    <div className="relative inline-block max-w-full overflow-hidden rounded-lg border border-gold-light bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage link */}
      <img src={url} alt={pins ? "The diagram, with numbered pins to label" : "Picture for this question"} className="block max-h-[22rem] max-w-full" />
      {pins?.map((p, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-semibold ring-2 ring-white ${highlight === i ? "bg-amber-600 text-white" : "bg-forest-700 text-white"}`}
          style={{ left: `${Number(p.x) * 100}%`, top: `${Number(p.y) * 100}%` }}
        >
          {i + 1}
        </span>
      ))}
    </div>
  );
}
