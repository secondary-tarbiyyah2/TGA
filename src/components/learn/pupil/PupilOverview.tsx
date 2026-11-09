"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { StatusChip, ui } from "@/components/learn/ui";
import { focusLabel, surahName } from "@/lib/learn/surahs";
import { MARK_COLUMNS, nextSession, pupilStats, revisionRows, todayISO, type QuranMark, type Session } from "@/lib/learn/quranClassroom";

type HwRow = { homework_id: string; homework_title: string; due_at: string; attention: string };
type Status = { status: string };
type Data = {
  child: string;
  onTime: number;
  late: number;
  missing: number;
  attention: HwRow[];
  quran: ReturnType<typeof pupilStats> | null;
  due: number;
  next: Session | null;
};

const DAY = 86_400_000;
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * One academic picture of a pupil, in the same place as their record: homework over the last 60
 * days, and Qur'an marks, revision and the next one-to-one. Everything is read through the same
 * RLS-scoped sources the Homework and Qur'an pages use, so the numbers always agree with them.
 */
export function PupilOverview({ childId }: { childId: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !childId) return;
    let alive = true;
    (async () => {
      try {
        const since = new Date(Date.now() - 60 * DAY).toISOString();
        const [st, att, mk, se] = await Promise.all([
          supabase.from("homework_status").select("status").eq("child_id", childId).gte("due_at", since),
          supabase.from("homework_attention").select("homework_id, homework_title, due_at, attention").eq("child_id", childId).gte("due_at", since).order("due_at", { ascending: false }).limit(6),
          supabase.from("quran_progress").select(MARK_COLUMNS).eq("child_id", childId).eq("milestone_type", "quran_memorisation"),
          supabase.from("quran_sessions").select("id, child_id, teacher_name, session_date, session_time, done").eq("child_id", childId).gte("session_date", todayISO()),
        ]);
        if (!alive) return;
        const counts = { on_time: 0, late: 0, missing: 0 } as Record<string, number>;
        for (const r of ((st.data as Status[]) || [])) counts[r.status] = (counts[r.status] || 0) + 1;
        const marks = (mk.data as QuranMark[]) || [];
        const quran = marks.length ? pupilStats(marks) : null;
        setD({
          child: childId,
          onTime: counts.on_time || 0,
          late: counts.late || 0,
          missing: counts.missing || 0,
          attention: ((att.data as HwRow[]) || []).filter((r) => r.attention === "missing"),
          quran,
          due: quran ? revisionRows(quran).filter((r) => r.status === "due").length : 0,
          next: nextSession(((se.data as Session[]) || [])),
        });
        setFailed(false);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [childId]);

  if (failed) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">The progress summary couldn&apos;t load. The record below still works.</p>;
  if (!d || d.child !== childId) return <div className="h-24 motion-safe:animate-pulse rounded-xl bg-white" />;

  const handedIn = d.onTime + d.late;
  const total = handedIn + d.missing;
  return (
    <section aria-label="Progress at a glance" className="rounded-xl border border-gold-light/60 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Progress at a glance</h3>
        <span className="text-xs text-ink/60">last 60 days</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fig label="Homework handed in" value={total ? `${handedIn}/${total}` : "–"} warn={d.missing > 0} sub={d.missing ? `${d.missing} missing` : d.late ? `${d.late} late` : "all on time"} />
        <Fig label="Qur'an average" value={d.quran?.overall != null ? `${d.quran.overall}/10` : "–"} sub={d.quran ? `${d.quran.count} marks · ${d.quran.trend || "no trend yet"}` : "no marks yet"} />
        <Fig label="Surahs covered" value={d.quran ? String(d.quran.covered) : "–"} warn={d.due > 0} sub={d.due ? `${d.due} due for revision` : d.quran ? `${d.quran.secure} secure` : "assessed at least once"} />
        <Fig label="Next one-to-one" value={d.next ? fmt(d.next.session_date + "T12:00:00") : "None"} warn={!d.next && !!d.quran} sub={d.next ? d.next.session_time.slice(0, 5) + (d.next.teacher_name ? ` · ${d.next.teacher_name}` : "") : d.quran ? "not booked" : "–"} />
      </dl>
      {(d.attention.length > 0 || (d.quran?.focus.length || 0) > 0) && (
        <div className="mt-3 space-y-1.5 border-t border-gold-light/50 pt-3">
          {d.attention.slice(0, 3).map((r) => (
            <p key={r.homework_id} className="flex flex-wrap items-center gap-2 text-sm text-ink">
              <StatusChip tone="bad">Missing</StatusChip>
              <span className="min-w-0 flex-1 truncate">{r.homework_title}</span>
              <span className="text-xs text-ink/60">due {fmt(r.due_at)}</span>
            </p>
          ))}
          {(d.quran?.focus.length || 0) > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
              <StatusChip tone="warn">Work on</StatusChip>
              <span>{d.quran!.focus.slice(0, 2).map(([k]) => focusLabel(k)).join(", ")}</span>
            </p>
          )}
          {d.due > 0 && d.quran && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
              <StatusChip tone="warn">Revise</StatusChip>
              <span>{revisionRows(d.quran).filter((r) => r.status === "due").slice(0, 3).map((r) => surahName(r.surah)).join(", ")}</span>
            </p>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/teach/homework" className={`${ui.btnSecondary} ${ui.sm}`}>Homework</Link>
        <Link href="/teach/quran" className={`${ui.btnSecondary} ${ui.sm}`}>Qur&apos;an</Link>
      </div>
    </section>
  );
}

function Fig({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-cream/60 p-2.5">
      <dt className="text-[11px] text-ink/65">{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${warn ? "text-amber-900" : "text-ink"}`}>{value}</dd>
      <dd className="text-[11px] text-ink/65">{sub}</dd>
    </div>
  );
}
