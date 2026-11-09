"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLessonPins } from "@/lib/learn/pins";

/**
 * "Recently opened": the last lessons this person opened, so they can pick up
 * where they left off (owner brief: recently accessed and saved items). Kept in
 * this browser only (no personal data: titles and links to staff pages).
 */
export type RecentLesson = { id: string; title: string; subject: string; year: string; unit?: string | null; at: number };

const KEY = "tga-recent-lessons";
const MAX = 8;

export function readRecentLessons(): RecentLesson[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? (raw as RecentLesson[]).filter((r) => r && r.id && r.title) : [];
  } catch {
    return [];
  }
}

/** Call when a lesson workspace opens. */
export function rememberLesson(l: Omit<RecentLesson, "at">) {
  try {
    const next = [{ ...l, at: Date.now() }, ...readRecentLessons().filter((r) => r.id !== l.id)].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: nothing to remember */
  }
}

const yearLabel = (y: string) => (y.startsWith("y") ? `Year ${y.slice(1)}` : y);

function LessonLinkRow({ area, l }: { area: "teach" | "admin"; l: { id: string; title: string; subject: string; year: string; unit?: string | null } }) {
  return (
    <li>
      <Link href={`/${area}/curriculum/lesson?id=${encodeURIComponent(l.id)}`} className="flex min-h-12 items-center gap-3 px-5 py-2.5 hover:bg-cream">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{l.title}</span>
          <span className="block truncate text-xs text-ink/60">
            {l.subject} · {yearLabel(l.year)}
            {l.unit ? ` · ${l.unit}` : ""}
          </span>
        </span>
        <span aria-hidden="true" className="text-ink/35">
          ›
        </span>
      </Link>
    </li>
  );
}

/** Pinned lessons first, then the ones opened most recently in this browser. */
export function RecentLessons({ area, limit = 4 }: { area: "teach" | "admin"; limit?: number }) {
  const [items, setItems] = useState<RecentLesson[] | null>(null);
  const { lessons: pinned } = useLessonPins();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read this browser's list once after mount
    setItems(readRecentLessons().slice(0, limit));
  }, [limit]);
  const pins = pinned || [];
  const recent = (items || []).filter((r) => !pins.some((p) => p.id === r.id));
  if (pins.length === 0 && recent.length === 0) return null;
  return (
    <section aria-labelledby="recent-lessons" className="rounded-2xl border border-gold-light bg-white">
      <div className="flex items-baseline justify-between gap-3 px-5 pb-2 pt-4">
        <h2 id="recent-lessons" className="text-[0.9375rem] font-semibold text-ink">
          {pins.length ? "Your lessons" : "Recently opened"}
        </h2>
        <Link href={`/${area}/curriculum`} className="text-sm font-medium text-forest-700 hover:underline">
          Curriculum
        </Link>
      </div>
      {pins.length > 0 && (
        <>
          <p className="px-5 pt-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink/55">Pinned</p>
          <ul className="divide-y divide-gold-light/70">
            {pins.slice(0, 6).map((l) => (
              <LessonLinkRow key={l.id} area={area} l={l} />
            ))}
          </ul>
        </>
      )}
      {recent.length > 0 && (
        <>
          {pins.length > 0 && <p className="px-5 pt-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink/55">Recently opened</p>}
          <ul className="divide-y divide-gold-light/70 pb-1">
            {recent.map((l) => (
              <LessonLinkRow key={l.id} area={area} l={l} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
