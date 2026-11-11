"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useClassRoster } from "@/components/learn/class/PupilPicker";
import { LOOKBACK_DAYS, loadClassAttendance, rateOf, type ClassMark } from "@/components/learn/class/ClassAttendanceTab";
import { Icon } from "@/components/learn/Icon";
import { Avatar, EmptyState, ui } from "@/components/learn/ui";
import { pupilRecordHref } from "@/components/learn/pupil/PupilLink";

type Why = "attendance" | "homework" | "results";
const WHY: { key: Why; label: string }[] = [
  { key: "attendance", label: "Attendance" },
  { key: "homework", label: "Homework" },
  { key: "results", label: "Results" },
];

type StatusRow = { child_id: string; status: string; homework_id: string; due_at?: string | null };
type Grade = { child_id: string; percent: number | null; date?: string | null };

const WEEKS = 8;
/** Which of the last WEEKS weeks (0 = oldest) a date falls in, or -1. */
function weekIndex(iso: string | null | undefined, now: number): number {
  if (!iso) return -1;
  const t = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).getTime();
  const back = Math.floor((now - t) / (7 * 86_400_000));
  return back < 0 || back >= WEEKS ? -1 : WEEKS - 1 - back;
}

/** A row of small bars, one per week (decorative: the figure is said in words beside it). */
function MiniBars({ values }: { values: (number | null)[] }) {
  if (values.every((v) => v === null)) return null;
  return (
    <span className="portal-minibars mt-3" aria-hidden="true">
      {values.map((v, i) => (
        <i key={i} style={{ height: v === null ? "3px" : `${Math.max(6, Math.min(100, v))}%`, opacity: v === null ? 0.25 : undefined }} />
      ))}
    </span>
  );
}

/**
 * A class at a glance, like Teams for Education's Insights (owner, 11 Nov 2026: "better
 * structured"): the class's four figures in one strip, each opening the section it comes from,
 * then the pupils who may need a word as a table with one column per reason. A pupil's name opens
 * their record, each reason opens the page behind it (Attendance, Classwork, Grades), and
 * Message opens a new message. Read from the same sources as those sections.
 */
export function ClassInsightsTab({ classId, classHref, area = "/teach" }: { classId: string; classHref: (tab: string) => string; area?: string }) {
  const roster = useClassRoster(classId);
  const [marks, setMarks] = useState<ClassMark[] | null>(null);
  const [lessonDates, setLessonDates] = useState<Record<string, string>>({});
  const [now, setNow] = useState(0);
  const [hw, setHw] = useState<StatusRow[] | null>(null);
  const [review, setReview] = useState<number | null>(null);
  const [grades, setGrades] = useState<Grade[] | null>(null);
  const [why, setWhy] = useState<Why | "all">("all");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
    (async () => {
      const [att, st, rq, gr] = await Promise.all([
        loadClassAttendance(classId),
        supabase.from("homework_status").select("child_id, status, homework_id, due_at").eq("class_id", classId).gte("due_at", since).limit(5000),
        supabase.from("homework_review_queue").select("submission_id", { count: "exact", head: true }).eq("class_id", classId),
        supabase.from("assessments").select("child_id, percent, date").eq("class_id", classId).gte("date", since.slice(0, 10)).limit(5000),
      ]);
      if (!alive) return;
      setMarks(att?.marks || []);
      setLessonDates(Object.fromEntries((att?.lessons || []).map((l) => [l.id, l.date])));
      setNow(Date.now());
      setHw((st.data as unknown as StatusRow[]) || []);
      setReview(rq.count ?? 0);
      setGrades((gr.data as unknown as Grade[]) || []);
    })();
    return () => {
      alive = false;
    };
  }, [classId]);

  const pupils = useMemo(() => {
    if (!roster || !marks || !hw || !grades) return null;
    return roster
      .map((p) => {
        const att = rateOf(marks.filter((m) => m.child_id === p.id));
        const mine = hw.filter((h) => h.child_id === p.id);
        const missing = mine.filter((h) => h.status === "missing").length;
        const scores = grades.filter((g) => g.child_id === p.id && g.percent != null).map((g) => Number(g.percent));
        const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
        const flags: Record<Why, boolean> = { attendance: att !== null && att < 90, homework: missing >= 2, results: avg !== null && avg < 50 };
        const reasons = (Object.keys(flags) as Why[]).filter((k) => flags[k]);
        return { ...p, att, missing, avg, flags, reasons };
      })
      .filter((p) => p.reasons.length > 0)
      .sort((a, b) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name));
  }, [roster, marks, hw, grades]);

  if (!roster || !marks || !hw || review === null || !grades || !pupils) return <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />;

  const due = hw.filter((h) => h.status !== "not_yet_due");
  const handedIn = due.filter((h) => h.status === "on_time" || h.status === "late").length;
  const missing = due.filter((h) => h.status === "missing").length;
  const scored = grades.filter((g) => g.percent != null).map((g) => Number(g.percent));
  const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;
  const att = rateOf(marks);
  const weeks = LOOKBACK_DAYS / 7;

  // Week by week (oldest first), for each figure's small bars.
  const series = (fill: (bucket: number[][]) => void, toValue: (xs: number[]) => number | null) => {
    const b: number[][] = Array.from({ length: WEEKS }, () => []);
    fill(b);
    return b.map((xs) => (xs.length ? toValue(xs) : null));
  };
  const attSeries = series(
    (b) => {
      for (const m of marks) {
        const w = weekIndex(lessonDates[m.lesson_instance_id], now);
        if (w < 0) continue;
        if (m.status === "present" || m.status === "late" || m.status === "not_engaged") b[w].push(1);
        else if (m.status === "absent") b[w].push(0);
      }
    },
    (xs) => Math.round((xs.reduce((a, c) => a + c, 0) / xs.length) * 100),
  );
  const hwSeries = series(
    (b) => {
      for (const h of due) {
        const w = weekIndex(h.due_at, now);
        if (w >= 0) b[w].push(h.status === "on_time" || h.status === "late" ? 1 : 0);
      }
    },
    (xs) => Math.round((xs.reduce((a, c) => a + c, 0) / xs.length) * 100),
  );
  const gradeSeries = series(
    (b) => {
      for (const g of grades) {
        const w = weekIndex(g.date, now);
        if (w >= 0 && g.percent != null) b[w].push(Number(g.percent));
      }
    },
    (xs) => Math.round(xs.reduce((a, c) => a + c, 0) / xs.length),
  );

  const figures = [
    { label: "Attendance", value: att === null ? "–" : `${att}%`, sub: "Present or late", alert: att !== null && att < 90, href: classHref("attendance"), bars: attSeries },
    { label: "Homework handed in", value: due.length ? `${Math.round((handedIn / due.length) * 100)}%` : "–", sub: missing ? `${missing} missing` : "Nothing missing", alert: missing > 0, href: classHref("classwork"), bars: hwSeries },
    { label: "To review", value: String(review), sub: review ? "Handed in, not yet returned" : "All marked", alert: review > 0, href: `${classHref("classwork")}&view=review`, bars: null },
    { label: "Average result", value: avg === null ? "–" : `${avg}%`, sub: `${scored.length} result${scored.length === 1 ? "" : "s"} recorded`, alert: false, href: classHref("grades"), bars: gradeSeries },
  ];
  const counts: Record<Why, number> = { attendance: 0, homework: 0, results: 0 };
  for (const p of pupils) for (const r of p.reasons) counts[r]++;
  const shown = why === "all" ? pupils : pupils.filter((p) => p.flags[why]);
  const profile = (id: string) => pupilRecordHref(area.replace("/", ""), id) || `${area}/pupils`;
  const reasonHref: Record<Why, string> = { attendance: classHref("attendance"), homework: classHref("classwork"), results: classHref("grades") };
  const cell = (p: (typeof pupils)[number], k: Why, text: string) =>
    p.flags[k] ? (
      <Link href={reasonHref[k]} className="font-medium text-amber-900 underline decoration-amber-600/40 underline-offset-2 hover:decoration-amber-900">
        {text}
      </Link>
    ) : (
      <span className="text-ink-500">{text}</span>
    );

  return (
    <div className="space-y-6">
      <section aria-labelledby="ins-class">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ins-class" className="t-section">
            This class
          </h2>
          <p className="t-meta">
            The last {weeks} weeks · {roster.length} pupil{roster.length === 1 ? "" : "s"}
          </p>
        </div>
        <ul data-guide="insights-figures" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
          {figures.map((f) => (
            <li key={f.label}>
              <Link href={f.href} className="flex h-full flex-col rounded-2xl border border-[var(--portal-line)] bg-white p-5 shadow-[var(--portal-shadow-card)] transition-colors hover:border-[var(--portal-control-line-hover)]">
                <span className="text-[0.8125rem] font-medium text-ink-500">{f.label}</span>
                <span className="mt-1 text-[1.75rem] font-bold leading-[1.1] tracking-[-0.02em] tabular-nums text-ink">{f.value}</span>
                <span className={`mt-1 text-xs ${f.alert ? "font-semibold text-amber-800" : "text-ink-500"}`}>{f.sub}</span>
                {f.bars && <MiniBars values={f.bars} />}
              </Link>
            </li>
          ))}
        </ul>
        <p className="t-meta mt-2">Bars show each of the last {WEEKS} weeks, this week in gold.</p>
      </section>

      <section aria-labelledby="ins-word" data-guide="insights-pupils">
        <div className="mb-2">
          <h2 id="ins-word" className="t-section">
            Who needs attention <span className="font-normal text-ink-500">· {pupils.length}</span>
          </h2>
          <p className="t-meta">Attendance under 90%, two or more pieces of homework missing, or an average under 50%. Press a name for their record, or a figure for the page behind it.</p>
        </div>
        {pupils.length === 0 ? (
          <EmptyState title="No one stands out" icon="circleCheck">
            Everyone is attending, handing work in and doing well.
          </EmptyState>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Show">
              <button type="button" aria-pressed={why === "all"} onClick={() => setWhy("all")} className={why === "all" ? ui.chipOn : ui.chip}>
                All · {pupils.length}
              </button>
              {WHY.filter((w) => counts[w.key] > 0).map((w) => (
                <button key={w.key} type="button" aria-pressed={why === w.key} onClick={() => setWhy(w.key)} className={why === w.key ? ui.chipOn : ui.chip}>
                  {w.label} · {counts[w.key]}
                </button>
              ))}
            </div>
            <ul className="divide-y divide-[var(--portal-line-soft)] rounded-2xl border border-gold-light bg-white px-5">
              {shown.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3.5">
                  <Avatar name={p.name} seed={p.id} />
                  <span className="min-w-0 flex-[1_1_14rem]">
                    <Link href={profile(p.id)} className="block truncate text-sm font-semibold text-ink hover:text-forest-700 hover:underline">
                      {p.name}
                    </Link>
                    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.8125rem] tabular-nums">
                      <span>
                        <span className="text-ink-500">Attendance </span>
                        {cell(p, "attendance", p.att === null ? "–" : `${p.att}%`)}
                      </span>
                      <span>
                        <span className="text-ink-500">Missing </span>
                        {cell(p, "homework", String(p.missing))}
                      </span>
                      <span>
                        <span className="text-ink-500">Average </span>
                        {cell(p, "results", p.avg === null ? "–" : `${p.avg}%`)}
                      </span>
                    </span>
                  </span>
                  <span className="flex gap-1.5">
                    <Link href={`${area}/messages?family=${p.id}`} className={`${ui.btnSecondary} ${ui.sm}`} aria-label={`Message ${p.name}'s family`}>
                      <Icon name="messageSquare" size="sm" />
                      <span className="hidden lg:inline">Message family</span>
                    </Link>
                    <Link href={profile(p.id)} className={`${ui.btnSecondary} ${ui.sm}`} aria-label={`Open ${p.name}'s record`}>
                      Record
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
