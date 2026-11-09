"use client";

import { Icon } from "@/components/learn/Icon";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useNow } from "@/lib/learn/useNow";
import { MarkRow } from "@/components/learn/homework/HomeworkCards";
import { Tabs } from "@/components/learn/Tabs";
import { ui } from "@/components/learn/ui";
import { PageHeader } from "@/components/learn/PageHeader";
import { ScrollArea } from "@/components/learn/ScrollArea";
import { Select } from "@/components/learn/Select";

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
const btn = ui.btnSecondary;
const btnPrimary = ui.btnPrimary;

/**
 * The teacher's marking queue: every piece of work handed in and not yet
 * returned, across all their classes, grouped by assignment, oldest first.
 *
 * "Mark" opens the marking view in place: one pupil's work and the marking
 * form, with Previous / Next, so a whole class is marked without going back
 * to the list. A piece of work only leaves the queue once it has been
 * returned (saved in the database), never just because it was opened.
 *
 * Inside a class (Classwork › To review) it is given `classId` and shows
 * just that class, without its own heading; `homeworkId` opens one
 * assignment's marking straight away.
 */
export function ReviewQueue({ classId: fixedClass, homeworkId, embedded = false, onCount }: { classId?: string; homeworkId?: string; embedded?: boolean; onCount?: (n: number) => void } = {}) {
  const now = useNow();
  const [items, setItems] = useState<Item[] | null>(null);
  const [maxPoints, setMaxPoints] = useState<Record<string, number | null>>({});
  const [chosenClass, setClassId] = useState("");
  const classId = fixedClass || chosenClass;
  const Heading = embedded ? "h2" : "h1";
  const [only, setOnly] = useState<"all" | "week" | "late">("all");
  const [error, setError] = useState(false);
  // The pupils being marked (a snapshot, so the order doesn't jump as work is returned).
  const [marking, setMarking] = useState<{ title: string; items: Item[]; index: number } | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let q = supabase
      .from("homework_review_queue")
      .select("submission_id, homework_id, homework_title, class_id, class_name, child_id, child_name, due_at, submitted_at, is_late");
    if (fixedClass) q = q.eq("class_id", fixedClass);
    const { data, error: err } = await q.order("submitted_at", { ascending: true }).limit(1000);
    if (err) setError(true);
    const rows = (data as unknown as Item[]) || [];
    setItems(rows);
    onCount?.(rows.length);
    const ids = [...new Set(rows.map((r) => r.homework_id))];
    if (ids.length) {
      const { data: hw } = await supabase.from("homework").select("id, max_points").in("id", ids);
      setMaxPoints(Object.fromEntries(((hw as { id: string; max_points: number | null }[]) || []).map((h) => [h.id, h.max_points])));
    }
  }, [fixedClass, onCount]);

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

  // Open a homework's marking view from a link (?homework=<id>).
  useEffect(() => {
    if (!items || marking) return;
    const id = homeworkId || new URLSearchParams(window.location.search).get("homework");
    if (!id) return;
    const list = items.filter((i) => i.homework_id === id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off: honour the link once the queue has loaded
    if (list.length) setMarking({ title: list[0].homework_title, items: list, index: 0 });
  }, [items, marking, homeworkId]);

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
            <Heading className="truncate font-serif text-h3 font-semibold text-ink">{marking.title}</Heading>
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
            <ScrollArea label="Pupils to mark" className="max-h-[60vh]">
            <ol className="space-y-0.5">
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
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${returned ? "bg-teal-700 text-white" : "bg-cream text-ink/65"}`}>{returned ? <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.5} /> : k + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{i.child_name || "Pupil"}</span>
                      {i.is_late && <span className="text-[11px] font-medium text-amber-800">late</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
            </ScrollArea>
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

  const inClass = (items || []).filter((i) => !classId || i.class_id === classId);
  const statusTabs = [
    { key: "all" as const, label: "Everything", count: inClass.length },
    { key: "week" as const, label: "Waiting 7+ days", count: inClass.filter((i) => waiting(i.submitted_at) >= 7).length },
    { key: "late" as const, label: "Handed in late", count: inClass.filter((i) => i.is_late).length },
  ];
  const classCounts = classes.map(([id, name]) => {
    const list = (items || []).filter((i) => i.class_id === id);
    return { id, name, n: list.length, old: list.some((i) => waiting(i.submitted_at) >= 7) };
  });

  return (
    <div className="space-y-4">
      {!embedded && (
        <PageHeader title="To review" subtitle="Work handed in and waiting to be marked, oldest first." />
      )}
      {items === null ? (
        <div className="h-24 animate-pulse rounded-2xl bg-white" />
      ) : error ? (
        <p className="rounded-2xl bg-white p-5 text-sm text-red-800">The review list could not be loaded. Refresh to try again.</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-gold-light bg-white p-8 text-center text-sm text-ink/65">Nothing to review{fixedClass ? " in this class" : ""}. You are all caught up.</p>
      ) : (
        <div className={fixedClass ? "" : "grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]"}>
          {!fixedClass && (
          <>
          {/* Classes: a list with counts on wide screens, a drop-down on phones. */}
          <label className="block text-sm font-semibold text-ink lg:hidden">
            Class
            <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="mt-1 block w-full rounded-lg border border-gold-light bg-white px-3 py-2 text-sm font-normal">
              <option value="">All classes ({items.length})</option>
              {classCounts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.n})
                </option>
              ))}
            </Select>
          </label>
          <nav aria-label="Classes" className="hidden self-start rounded-2xl border border-gold-light bg-white p-2 lg:sticky lg:top-[76px] lg:block">
            <ul className="space-y-0.5">
              {[{ id: "", name: "All classes", n: items.length, old: false }, ...classCounts].map((c) => (
                <li key={c.id || "all"}>
                  <button
                    type="button"
                    onClick={() => setClassId(c.id)}
                    aria-current={classId === c.id ? "true" : undefined}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${classId === c.id ? "bg-teal-100 font-semibold text-teal-900" : "text-ink hover:bg-cream"}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {c.old && <span className="h-2 w-2 shrink-0 rounded-full bg-red-600" title="Something has waited a week or more" />}
                    <span className="tabular-nums text-ink/65">{c.n}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          </>
          )}

          <div className="min-w-0 rounded-2xl border border-gold-light bg-white">
            <div className="border-b border-gold-light px-4 py-3">
              <Tabs variant="switch" items={statusTabs} value={only} onChange={setOnly} label="Show" />
            </div>
          {groups.length === 0 ? (
            <p className="p-8 text-center text-sm text-ink/65">Nothing matches this filter.</p>
          ) : (
            <ul className="divide-y divide-gold-light/60 p-2">
              {groups.map((g) => {
                const days = waiting(g.oldest);
                return (
                  <li key={g.homework_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
                    <span className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                      <span className="block truncate text-sm font-semibold text-ink" title={g.title}>{g.title}</span>
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
                        {g.items.length === 1 ? "Waiting" : "Oldest waiting"} {days} days
                      </span>
                    )}
                    <button type="button" className={`${btnPrimary} ml-auto`} onClick={() => setMarking({ title: g.title, items: g.items, index: 0 })}>
                      Mark
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
