"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useNow } from "@/lib/learn/useNow";
import { MarkRow } from "@/components/learn/homework/HomeworkCards";

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

type Group = { homework_id: string; title: string; class_name: string | null; class_id: string | null; due_at: string; items: Item[]; oldest: string; late: number };

const DAY = 86_400_000;
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const btn = "rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-cream disabled:opacity-40";
const btnPrimary = "rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-40";

/**
 * The teacher's marking queue: every piece of work handed in and not yet
 * returned, across all their classes, grouped by assignment, oldest first.
 *
 * "Mark" opens the marking view in place: one pupil's work and the marking
 * form, with Previous / Next, so a whole class is marked without going back
 * to the list. A piece of work only leaves the queue once it has been
 * returned (saved in the database), never just because it was opened.
 */
export function ReviewQueue() {
  const now = useNow();
  const [items, setItems] = useState<Item[] | null>(null);
  const [maxPoints, setMaxPoints] = useState<Record<string, number | null>>({});
  const [classId, setClassId] = useState("");
  const [only, setOnly] = useState<"all" | "week" | "late">("all");
  const [error, setError] = useState(false);
  // The pupils being marked (a snapshot, so the order doesn't jump as work is returned).
  const [marking, setMarking] = useState<{ title: string; items: Item[]; index: number } | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error: err } = await supabase
      .from("homework_review_queue")
      .select("submission_id, homework_id, homework_title, class_id, class_name, child_id, child_name, due_at, submitted_at, is_late")
      .order("submitted_at", { ascending: true })
      .limit(1000);
    if (err) setError(true);
    const rows = (data as unknown as Item[]) || [];
    setItems(rows);
    const ids = [...new Set(rows.map((r) => r.homework_id))];
    if (ids.length) {
      const { data: hw } = await supabase.from("homework").select("id, max_points").in("id", ids);
      setMaxPoints(Object.fromEntries(((hw as { id: string; max_points: number | null }[]) || []).map((h) => [h.id, h.max_points])));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const waiting = useCallback((iso: string) => Math.floor((now - new Date(iso).getTime()) / DAY), [now]);

  const classes = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items || []) if (i.class_id) m.set(i.class_id, i.class_name || "Class");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const shown = useMemo(
    () =>
      (items || []).filter((i) => (!classId || i.class_id === classId) && (only === "all" || (only === "late" ? i.is_late : waiting(i.submitted_at) >= 7))),
    [items, classId, only, waiting],
  );

  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const i of shown) {
      const g = m.get(i.homework_id) || { homework_id: i.homework_id, title: i.homework_title, class_name: i.class_name, class_id: i.class_id, due_at: i.due_at, items: [], oldest: i.submitted_at, late: 0 };
      g.items.push(i);
      if (i.submitted_at < g.oldest) g.oldest = i.submitted_at;
      if (i.is_late) g.late++;
      m.set(i.homework_id, g);
    }
    return [...m.values()].sort((a, b) => a.oldest.localeCompare(b.oldest));
  }, [shown]);

  const stillWaiting = useMemo(() => new Set((items || []).map((i) => i.submission_id)), [items]);
  const overWeek = (items || []).filter((i) => waiting(i.submitted_at) >= 7).length;

  // Open a homework's marking view from a link (?homework=<id>).
  useEffect(() => {
    if (!items || marking) return;
    const id = new URLSearchParams(window.location.search).get("homework");
    if (!id) return;
    const list = items.filter((i) => i.homework_id === id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off: honour the link once the queue has loaded
    if (list.length) setMarking({ title: list[0].homework_title, items: list, index: 0 });
  }, [items, marking]);

  if (marking) {
    const cur = marking.items[marking.index];
    const done = marking.items.filter((i) => !stillWaiting.has(i.submission_id)).length;
    const go = (index: number) => setMarking({ ...marking, index });
    const nextWaiting = marking.items.findIndex((i, k) => k > marking.index && stillWaiting.has(i.submission_id));
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gold-light bg-white px-5 py-4">
          <button type="button" className={btn} onClick={() => setMarking(null)}>
            ‹ Back to the queue
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-h3 font-semibold text-ink">{marking.title}</h1>
            <p className="text-sm text-ink/65">
              {cur.class_name ? `${cur.class_name} · ` : ""}Pupil {marking.index + 1} of {marking.items.length} · {done} returned
            </p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-cream sm:w-40" aria-hidden="true">
            <div className="h-2 rounded-full bg-teal-500" style={{ width: `${(done / marking.items.length) * 100}%` }} />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav aria-label="Pupils to mark" className="self-start rounded-2xl border border-gold-light bg-white p-2 lg:sticky lg:top-[76px]">
            <ol className="max-h-[60vh] space-y-0.5 overflow-y-auto">
              {marking.items.map((i, k) => {
                const returned = !stillWaiting.has(i.submission_id);
                return (
                  <li key={i.submission_id}>
                    <button
                      type="button"
                      onClick={() => go(k)}
                      aria-current={k === marking.index ? "true" : undefined}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${k === marking.index ? "bg-teal-100 font-semibold text-teal-900" : "text-ink hover:bg-cream"}`}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${returned ? "bg-teal-700 text-white" : "bg-cream text-ink/60"}`}>{returned ? "✓" : k + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{i.child_name || "Pupil"}</span>
                      {i.is_late && <span className="text-[11px] font-medium text-amber-800">late</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="min-w-0 space-y-3">
            {!stillWaiting.has(cur.submission_id) && (
              <p role="status" className="rounded-lg bg-teal-100 px-3 py-2 text-sm text-teal-900">
                Returned to {cur.child_name || "the pupil"}.{nextWaiting >= 0 ? " Next pupil when you're ready." : " That's everyone in this assignment."}
              </p>
            )}
            <div className="rounded-2xl border border-gold-light bg-white p-4">
              <MarkRow key={cur.submission_id} submissionId={cur.submission_id} childName={cur.child_name || "Pupil"} maxPoints={maxPoints[cur.homework_id] ?? null} onSaved={load} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <button type="button" className={btn} disabled={marking.index === 0} onClick={() => go(marking.index - 1)}>
                ‹ Previous pupil
              </button>
              {nextWaiting >= 0 ? (
                <button type="button" className={btnPrimary} onClick={() => go(nextWaiting)}>
                  Next pupil to mark ›
                </button>
              ) : (
                <button type="button" className={btnPrimary} onClick={() => setMarking(null)}>
                  Done, back to the queue
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const chip = (k: typeof only, label: string, n?: number) => (
    <button
      key={k}
      type="button"
      aria-pressed={only === k}
      onClick={() => setOnly(k)}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium ${only === k ? "border-teal-700 bg-teal-700 text-white" : "border-gold-light bg-white text-ink/75 hover:bg-cream"}`}
    >
      {label}
      {n !== undefined ? ` (${n})` : ""}
    </button>
  );

  return (
    <div className="rounded-2xl border border-gold-light bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gold-light px-5 py-4">
        <div>
          <h1 className="font-serif text-h2 font-semibold text-ink">To review</h1>
          <p className="text-sm text-ink/65">Work handed in and waiting to be marked, by assignment, oldest first.</p>
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
        <p className="p-5 text-sm text-red-800">The review list could not be loaded. Refresh to try again.</p>
      ) : items.length === 0 ? (
        <p className="p-8 text-center text-sm text-ink/65">Nothing to review. You are all caught up.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 px-5 pt-4" role="group" aria-label="Show">
            {chip("all", "Everything", items.length)}
            {chip("week", "Waiting a week or more", overWeek)}
            {chip("late", "Handed in late", items.filter((i) => i.is_late).length)}
          </div>
          {groups.length === 0 ? (
            <p className="p-8 text-center text-sm text-ink/65">Nothing matches this filter.</p>
          ) : (
            <ul className="divide-y divide-gold-light/60 p-2">
              {groups.map((g) => {
                const days = waiting(g.oldest);
                return (
                  <li key={g.homework_id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{g.title}</span>
                      <span className="block truncate text-xs text-ink/65">
                        {g.class_name ? `${g.class_name} · ` : ""}due {fmtDay(g.due_at)}
                      </span>
                    </span>
                    <span className="text-sm tabular-nums text-ink/80">
                      <span className="font-semibold text-ink">{g.items.length}</span> to mark
                    </span>
                    {g.late > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">{g.late} late</span>}
                    {days >= 3 && (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${days >= 7 ? "bg-red-50 text-red-800 ring-red-600/20" : "bg-cream text-ink/75 ring-gold-light"}`}>
                        Oldest waiting {days} days
                      </span>
                    )}
                    <button type="button" className={btnPrimary} onClick={() => setMarking({ title: g.title, items: g.items, index: 0 })}>
                      Mark
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
