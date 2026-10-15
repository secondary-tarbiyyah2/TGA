"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useNow } from "@/lib/learn/useNow";

type Item = {
  submission_id: string;
  homework_id: string;
  homework_title: string;
  class_id: string | null;
  class_name: string | null;
  child_id: string;
  child_name: string | null;
  due_at: string;
  submitted_at: string;
  is_late: boolean;
};

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * The teacher's "To review" list: every piece of work handed in and not yet
 * returned, across all of their classes, oldest first so nothing waits. It
 * only reads (homework_review_queue); marking happens on the Homework page.
 */
export function ReviewQueue() {
  const now = useNow();
  const [items, setItems] = useState<Item[] | null>(null);
  const [classId, setClassId] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("homework_review_queue")
      .select("submission_id, homework_id, homework_title, class_id, class_name, child_id, child_name, due_at, submitted_at, is_late")
      .order("submitted_at", { ascending: true })
      .limit(500)
      .then(({ data, error: err }) => {
        if (err) setError(true);
        setItems((data as unknown as Item[]) || []);
      });
  }, []);

  const classes = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items || []) if (i.class_id) m.set(i.class_id, i.class_name || "Class");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const shown = (items || []).filter((i) => !classId || i.class_id === classId);
  const waitingDays = (iso: string) => Math.floor((now - new Date(iso).getTime()) / 86_400_000);

  return (
    <div className="rounded-2xl border border-gold-light bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gold-light px-5 py-4">
        <div>
          <h1 className="font-serif text-h2 font-semibold text-ink">To review</h1>
          <p className="text-sm text-ink/60">Work handed in and waiting to be marked, oldest first.</p>
        </div>
        {classes.length > 1 && (
          <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Filter by class" className="rounded-lg border border-gold-light/70 px-3 py-2 text-sm">
            <option value="">All classes</option>
            {classes.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>
      {items === null ? (
        <div className="m-5 h-24 animate-pulse rounded-lg bg-cream" />
      ) : error ? (
        <p className="p-5 text-sm text-red-800">The review list could not be loaded. It will work once the latest database update has been applied.</p>
      ) : shown.length === 0 ? (
        <p className="p-8 text-center text-sm text-ink/60">Nothing to review. You are all caught up.</p>
      ) : (
        <>
          <p className="px-5 pt-4 text-sm text-ink/70">
            <span className="font-semibold text-ink">{shown.length}</span> to review
          </p>
          <ul className="divide-y divide-gold-light/60 p-2">
            {shown.map((i) => {
              const days = waitingDays(i.submitted_at);
              return (
                <li key={i.submission_id}>
                  <Link href={`/teach/homework?homework=${i.homework_id}`} className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-3 hover:bg-cream">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{i.child_name || "Pupil"}</span>
                      <span className="block truncate text-xs text-ink/60">
                        {i.homework_title}
                        {i.class_name ? ` · ${i.class_name}` : ""}
                      </span>
                    </span>
                    <span className="text-xs text-ink/55">Handed in {fmt(i.submitted_at)}</span>
                    {i.is_late && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">Late</span>}
                    {days >= 3 && <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 ring-1 ring-inset ring-red-600/20">Waiting {days} days</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
