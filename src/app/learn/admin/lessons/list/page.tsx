"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LessonsFrame, LessonsHeader } from "@/components/learn/timetable/LessonsFrame";
import { btn, callFunction, chipCls, fieldCls } from "@/components/learn/timetable/api";
import { useTimetableData } from "@/components/learn/timetable/useTimetableData";
import { hhmm } from "@/components/learn/timetable/types";
import { edgeErrorMessage } from "@/lib/learn/edge";
import { getSupabaseClient } from "@/lib/supabase/client";

type Range = "week" | "fortnight" | "past";
type Row = {
  id: string;
  date: string;
  bbb_status: string;
  timetable_slots: { start_time: string; end_time: string; teacher_user_id: string; classes: { name: string; meeting_url: string | null } | null; subjects: { name: string } | null } | null;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (n: number) => iso(new Date(Date.now() + n * 86400000));

function GenerateInstances({ runId, onDone }: { runId: string; onDone: () => void }) {
  const [from, setFrom] = useState(() => addDays(0));
  const [to, setTo] = useState(() => addDays(13));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await callFunction("lesson-instances-generate", { run_id: runId, from, to });
      setMessage(result.ok ? `Generated ${result.created ?? 0} lesson(s).` : `Could not generate: ${edgeErrorMessage(result)}`);
      if (result.ok) onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="rounded-2xl border border-gold-light/50 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-ink">Create dated lessons from the published timetable</summary>
      <p className="mt-2 text-sm text-ink/60">Creates one lesson (join link, objectives, resources, register, recording) for each occurrence of every published timetable slot in the range. Safe to re-run: existing dates are never duplicated.</p>
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
  const publishedId = published?.id || null;

  useEffect(() => {
    if (!supabase || !data.loaded) return;
    let cancelled = false;
    (async () => {
      if (!publishedId) return setRows([]);
      const { data: slots } = await supabase.from("timetable_slots").select("id").eq("run_id", publishedId);
      const ids = (slots || []).map((s) => s.id);
      if (ids.length === 0) return setRows([]);
      let q = supabase.from("lesson_instances").select("id, date, bbb_status, timetable_slots(start_time, end_time, teacher_user_id, classes(name, meeting_url), subjects(name))").in("timetable_slot_id", ids);
      q = range === "past" ? q.lt("date", iso(new Date())).order("date", { ascending: false }) : q.gte("date", iso(new Date())).lte("date", addDays(range === "week" ? 6 : 13)).order("date", { ascending: true });
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
        <p className="text-sm text-ink/60">Loading…</p>
      ) : !published ? (
        <p className="rounded-xl border border-dashed border-gold-light bg-cream/60 px-4 py-4 text-sm text-ink/70">
          No published timetable yet, so there are no lessons. <Link href="/admin/lessons/timetable" className="font-semibold underline">Review and publish a timetable</Link>.
        </p>
      ) : (
        <div className="space-y-4">
          <GenerateInstances runId={published.id} onDone={() => setRefresh((k) => k + 1)} />
          <div className="rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date range">
              {([["week", "Next 7 days"], ["fortnight", "Next 14 days"], ["past", "Past"]] as const).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={range === id} onClick={() => { setRange(id); setRows(null); }} className={chipCls(range === id)}>{label}</button>
              ))}
            </div>
            {rows === null ? (
              <p className="mt-4 text-sm text-ink/60">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="mt-4 text-sm text-ink/60">No lessons in this range. Use &quot;Create dated lessons&quot; above to make them.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {[...byDate.entries()].map(([date, list]) => (
                  <div key={date}>
                    <h3 className="text-sm font-semibold text-ink">{new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</h3>
                    <ul className="mt-1 divide-y divide-gold-light/30">
                      {list.sort((a, b) => (a.timetable_slots?.start_time || "").localeCompare(b.timetable_slots?.start_time || "")).map((r) => {
                        const s = r.timetable_slots;
                        const link = s?.classes?.meeting_url;
                        return (
                          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                            <span className="w-24 shrink-0 tabular-nums text-ink/60">{s ? `${hhmm(s.start_time)}–${hhmm(s.end_time)}` : ""}</span>
                            <span className="min-w-0 flex-1 basis-48"><strong className="text-ink">{s?.subjects?.name}</strong> <span className="text-ink/70">({s?.classes?.name})</span> <span className="text-ink/55">· {s ? teacherName(s.teacher_user_id) : ""}</span></span>
                            {r.bbb_status === "live" && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-900">Live</span>}
                            {link && <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-gold-700 underline">Join link</a>}
                            <Link href={`/admin/lessons/view?id=${r.id}`} className="text-xs font-semibold text-gold-700 underline">Open</Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-xs text-ink/55">To move a weekly lesson, edit it in the <Link href="/admin/lessons/timetable" className="underline">timetable</Link>. For a one-off absence, arrange cover there.</p>
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
