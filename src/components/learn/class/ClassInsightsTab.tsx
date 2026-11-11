"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useClassRoster } from "@/components/learn/class/PupilPicker";
import { LOOKBACK_DAYS, loadClassAttendance, rateOf, type ClassMark } from "@/components/learn/class/ClassAttendanceTab";
import { Icon } from "@/components/learn/Icon";
import { ui } from "@/components/learn/ui";

type Why = "attendance" | "homework" | "results";
const WHY: { key: Why; label: string }[] = [
  { key: "attendance", label: "Attendance" },
  { key: "homework", label: "Homework" },
  { key: "results", label: "Results" },
];

type StatusRow = { child_id: string; status: string; homework_id: string };
type Grade = { child_id: string; percent: number | null };

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
        supabase.from("homework_status").select("child_id, status, homework_id").eq("class_id", classId).gte("due_at", since).limit(5000),
        supabase.from("homework_review_queue").select("submission_id", { count: "exact", head: true }).eq("class_id", classId),
        supabase.from("assessments").select("child_id, percent").eq("class_id", classId).gte("date", since.slice(0, 10)).limit(5000),
      ]);
      if (!alive) return;
      setMarks(att?.marks || []);
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

  const figures = [
    { label: "Attendance", value: att === null ? "–" : `${att}%`, sub: "Present, late or not engaged", alert: att !== null && att < 90, href: classHref("attendance") },
    { label: "Homework handed in", value: due.length ? `${Math.round((handedIn / due.length) * 100)}%` : "–", sub: missing ? `${missing} missing` : "Nothing missing", alert: missing > 0, href: classHref("classwork") },
    { label: "To review", value: String(review), sub: review ? "Handed in, not yet returned" : "All marked", alert: review > 0, href: `${classHref("classwork")}&view=review` },
    { label: "Average result", value: avg === null ? "–" : `${avg}%`, sub: `${scored.length} result${scored.length === 1 ? "" : "s"} recorded`, alert: false, href: classHref("grades") },
  ];
  const counts: Record<Why, number> = { attendance: 0, homework: 0, results: 0 };
  for (const p of pupils) for (const r of p.reasons) counts[r]++;
  const shown = why === "all" ? pupils : pupils.filter((p) => p.flags[why]);
  const profile = (id: string) => (area === "/admin" ? `/admin/pupils?id=${id}` : `${area}/pupils?pupil=${id}`);
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
        <ul data-guide="insights-figures" className="grid gap-px overflow-hidden rounded-[10px] border border-gold-light bg-gold-light sm:grid-cols-2 lg:grid-cols-4">
          {figures.map((f) => (
            <li key={f.label} className="bg-white">
              <Link href={f.href} className="flex h-full flex-col gap-0.5 px-4 py-3.5 transition-colors hover:bg-[var(--portal-hover)]">
                <span className="text-[0.8125rem] font-medium text-ink-500">{f.label}</span>
                <span className="text-[1.5rem] font-semibold leading-tight tabular-nums text-ink">{f.value}</span>
                <span className={`text-xs ${f.alert ? "font-medium text-amber-900" : "text-ink-500"}`}>{f.sub}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ins-word" data-guide="insights-pupils">
        <div className="mb-2">
          <h2 id="ins-word" className="t-section">
            Pupils who may need a word <span className="font-normal text-ink-500">· {pupils.length}</span>
          </h2>
          <p className="t-meta">Attendance under 90%, two or more pieces of homework missing, or an average under 50%. Press a name for their record, or a figure for the page behind it.</p>
        </div>
        {pupils.length === 0 ? (
          <p className="rounded-[10px] border border-gold-light bg-white px-4 py-5 text-sm text-ink-500">No one stands out. Everyone is attending, handing work in and doing well.</p>
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
            <div className="overflow-hidden rounded-[10px] border border-gold-light bg-white">
              <table className="block w-full text-sm sm:table">
                <thead className="hidden border-b border-gold-light text-left sm:table-header-group">
                  <tr className="t-eyebrow">
                    <th scope="col" className="px-4 py-2 font-semibold">Pupil</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Attendance</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Homework missing</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Average result</th>
                    <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="block divide-y divide-gold-light sm:table-row-group">
                  {shown.map((p) => (
                    <tr key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:table-row sm:p-0">
                      <th scope="row" className="w-full text-left font-medium sm:w-auto sm:px-4 sm:py-2.5">
                        <Link href={profile(p.id)} className="text-ink hover:text-forest-700 hover:underline">
                          {p.name}
                        </Link>
                      </th>
                      <td className="tabular-nums sm:px-3 sm:py-2.5">
                        <span className="text-ink-500 sm:hidden">Attendance </span>
                        {cell(p, "attendance", p.att === null ? "–" : `${p.att}%`)}
                      </td>
                      <td className="tabular-nums sm:px-3 sm:py-2.5">
                        <span className="text-ink-500 sm:hidden">Homework missing </span>
                        {cell(p, "homework", String(p.missing))}
                      </td>
                      <td className="tabular-nums sm:px-3 sm:py-2.5">
                        <span className="text-ink-500 sm:hidden">Average </span>
                        {cell(p, "results", p.avg === null ? "–" : `${p.avg}%`)}
                      </td>
                      <td className="ml-auto sm:px-4 sm:py-2.5 sm:text-right">
                        <span className="inline-flex gap-1">
                          <Link href={`${area}/messages?compose=1`} className={`${ui.btnGhost} ${ui.sm}`} aria-label={`Message about ${p.name}`}>
                            <Icon name="messageSquare" size="sm" />
                            <span className="hidden lg:inline">Message</span>
                          </Link>
                          <Link href={profile(p.id)} className={`${ui.btnSecondary} ${ui.sm}`} aria-label={`Open ${p.name}'s record`}>
                            Record
                          </Link>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
