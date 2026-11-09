"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LessonsFrame, LessonsHeader } from "@/components/learn/timetable/LessonsFrame";
import { btn, callFunction, chipCls, fieldCls } from "@/components/learn/timetable/api";
import { useTimetableData } from "@/components/learn/timetable/useTimetableData";
import { addIsoDays, hhmm, ukIsoDate } from "@/components/learn/timetable/types";
import { edgeErrorMessage } from "@/lib/learn/edge";
import { getSupabaseClient } from "@/lib/supabase/client";
import { StatusChip, ui } from "@/components/learn/ui";

type Range = "week" | "fortnight" | "past";
type Row = {
  id: string;
  date: string;
  bbb_status: string;
  timetable_slots: { start_time: string; end_time: string; teacher_user_id: string; classes: { name: string; meeting_url: string | null } | null; subjects: { name: string } | null } | null;
};

// Dates are UK dates: toISOString() is UTC and gives yesterday between midnight and 1am in summer.
const addDays = (n: number) => addIsoDays(n);

function GenerateInstances({ runId, onDone, defaultOpen }: { runId: string; onDone: () => void; defaultOpen?: boolean }) {
  const [from, setFrom] = useState(() => addDays(0));
  const [to, setTo] = useState(() => addDays(13));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!from || !to || to < from) return setMessage("The \"To\" date must be on or after the \"From\" date.");
    setBusy(true);
    setMessage(null);
    try {
      const result = await callFunction("lesson-instances-generate", { run_id: runId, from, to });
      setMessage(result.ok ? (result.created ? `Created ${result.created} lesson${result.created === 1 ? "" : "s"}.` : "Nothing new to create: every lesson in that range already exists.") : `Could not create lessons: ${edgeErrorMessage(result)}`);
      if (result.ok) onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="rounded-2xl border border-gold-light bg-white p-4" open={defaultOpen}>
      <summary className="cursor-pointer text-sm font-semibold text-ink">Create dated lessons from the published timetable</summary>
      <p className="mt-2 text-sm text-ink/65">Creates one lesson (join link, objectives, resources, register, recording) for each occurrence of every published timetable slot in the range. Safe to re-run: existing dates are never duplicated.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-ink/70">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldCls} /></label>
        <label className="text-xs font-medium text-ink/70">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={fieldCls} /></label>
        <button type="button" disabled={busy} onClick={run} className={btn}>{busy ? "Working…" : "Create lessons"}</button>
      </div>
      {message && <p role="status" className="mt-2 text-xs text-ink/70">{message}</p>}
    </details>
  );
}

function ListContent() {
  const supabase = getSupabaseClient();
  const { data } = useTimetableData();
  const [range, setRange] = useState<Range>("week");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [refresh, setRefresh] = useState(0);
  const published = data.runs.find((r) => r.status === "published") || null;
  const upcoming = range !== "past";
  const publishedId = published?.id || null;

  useEffect(() => {
    if (!supabase || !data.loaded) return;
    let cancelled = false;
    (async () => {
      if (!publishedId) return setRows([]);
      // Filter through the embedded slot rather than an .in() list of every slot id, which can outgrow the URL limit.
      let q = supabase.from("lesson_instances").select("id, date, bbb_status, timetable_slots!inner(run_id, start_time, end_time, teacher_user_id, classes(name, meeting_url), subjects(name))").eq("timetable_slots.run_id", publishedId);
      const today = ukIsoDate();
      q = range === "past" ? q.lt("date", today).order("date", { ascending: false }) : q.gte("date", today).lte("date", addDays(range === "week" ? 6 : 13)).order("date", { ascending: true });
      const { data: res } = await q.limit(200);
      if (!cancelled) setRows((res as unknown as Row[]) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, data.loaded, publishedId, range, refresh]);

  const byDate = new Map<string, Row[]>();
  for (const r of rows || []) byDate.set(r.date, [...(byDate.get(r.date) || []), r]);
  const teacherName = (id: string) => data.teachers.find((t) => t.id === id)?.full_name || "Teacher";

  return (
    <div>
      <LessonsHeader title="Lessons" subtitle="Dated lessons made from the published timetable: join links, details and cover." />
      {!data.loaded ? (
        <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" aria-label="Loading" />
      ) : !published ? (
        <p className="rounded-xl border border-dashed border-gold-light bg-cream/60 px-4 py-4 text-sm text-ink/70">
          No published timetable yet, so there are no lessons. <Link href="/admin/lessons/timetable" className="font-semibold underline">Review and publish a timetable</Link>.
        </p>
      ) : (
        <div className="space-y-4">
          <GenerateInstances key={rows !== null && rows.length === 0 && upcoming ? "empty" : "some"} runId={published.id} onDone={() => setRefresh((k) => k + 1)} defaultOpen={rows !== null && rows.length === 0 && upcoming} />
          <div className="rounded-2xl border border-gold-light bg-white p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date range">
              {([["week", "Next 7 days"], ["fortnight", "Next 14 days"], ["past", "Past"]] as const).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={range === id} onClick={() => { setRange(id); setRows(null); }} className={chipCls(range === id)}>{label}</button>
              ))}
            </div>
            {rows === null ? (
              <p className="mt-4 text-sm text-ink/65">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="mt-4 text-sm text-ink/65">{upcoming ? "No lessons in this range yet. Create them from the published timetable above." : "No past lessons yet."}</p>
            ) : (
              <div className="mt-4 space-y-4">
                {[...byDate.entries()].map(([date, list]) => (
                  <div key={date}>
                    <h3 className="text-sm font-semibold text-ink">{new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", ...(range === "past" ? { year: "numeric" } : {}), timeZone: "UTC" })}{date === ukIsoDate() ? " (today)" : ""}</h3>
                    <ul className="mt-1 divide-y divide-gold-light/30">
                      {list.sort((a, b) => (a.timetable_slots?.start_time || "").localeCompare(b.timetable_slots?.start_time || "")).map((r) => {
                        const s = r.timetable_slots;
                        const link = s?.classes?.meeting_url;
                        return (
                          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                            <span className="w-24 shrink-0 tabular-nums text-ink/65">{s ? `${hhmm(s.start_time)}–${hhmm(s.end_time)}` : ""}</span>
                            <span className="min-w-0 flex-1 basis-48"><strong className="text-ink">{s?.subjects?.name}</strong> <span className="text-ink/70">({s?.classes?.name})</span> <span className="text-ink/65">· {s ? teacherName(s.teacher_user_id) : ""}</span></span>
                            {r.bbb_status === "live" && <StatusChip tone="good">Live</StatusChip>}
                            {link && <a href={link} target="_blank" rel="noopener noreferrer" className={`${ui.btnLink} !text-xs`}>Join link</a>}
                            <Link href={`/admin/lessons/view?id=${r.id}`} className={`${ui.btnLink} !text-xs`}>Open</Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {rows !== null && rows.length >= 200 && <p className="mt-4 text-xs text-amber-800">Showing the first 200 lessons only.</p>}
            <p className="mt-4 text-xs text-ink/65">To move a weekly lesson, edit it in the <Link href="/admin/lessons/timetable" className="underline">timetable</Link>. For a one-off absence, arrange cover there.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminLessonsListPage() {
  return (
    <LessonsFrame>
      <ListContent />
    </LessonsFrame>
  );
}
