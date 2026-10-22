"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Tabs } from "@/components/learn/Tabs";
import { EmptyState, Notice, StatusChip, ui } from "@/components/learn/ui";
import { focusLabel, JUZ_AMMA_COUNT, surahAr, surahName } from "@/lib/learn/surahs";
import {
  ayatLabel, bandFor, HW_KINDS, MARK_COLUMNS, nextSession, pupilStats, revisionRows, SETTING_LABEL, shortLevel, todayISO,
  type Homework, type Level, type QuranMark, type Session,
} from "@/lib/learn/quranClassroom";

type Tab = "progress" | "revision" | "homework" | "sessions";
type Data = { child: string; marks: QuranMark[]; levels: Level[]; mine: string[]; homework: Homework[]; sessions: Session[] };

const fmt = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/**
 * One child's Qur'an and Qaidah: marks out of 10, surahs covered, revision due, homework and
 * one-to-one sessions. Used for the pupil and for a parent (the database only returns the rows
 * that belong to that child).
 */
export function QuranPupilView({ childId, name }: { childId: string; name?: string }) {
  const [tab, setTab] = useState<Tab>("progress");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !childId) return;
    let alive = true;
    (async () => {
      const [m, l, cl, h, s] = await Promise.all([
        supabase.from("quran_progress").select(MARK_COLUMNS).eq("child_id", childId).eq("milestone_type", "quran_memorisation"),
        supabase.from("quran_levels").select("id, track, name, sort, meets").order("sort"),
        supabase.from("quran_child_levels").select("level_id").eq("child_id", childId),
        supabase.from("quran_homework").select("id, level_id, kind, surah, ayah_from, ayah_to, note, due_date").order("due_date", { ascending: false }).limit(60),
        supabase.from("quran_sessions").select("id, child_id, teacher_name, session_date, session_time, done").eq("child_id", childId).order("session_date"),
      ]);
      if (!alive) return;
      setError(m.error || l.error ? "Couldn't load the Qur'an page. Refresh to try again." : null);
      setData({
        child: childId,
        marks: (m.data as QuranMark[]) || [],
        levels: (l.data as Level[]) || [],
        mine: ((cl.data as { level_id: string }[]) || []).map((x) => x.level_id),
        homework: (h.data as Homework[]) || [],
        sessions: (s.data as Session[]) || [],
      });
    })();
    return () => {
      alive = false;
    };
  }, [childId]);

  const d = data && data.child === childId ? data : null;
  if (!d) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  const who = name ? `${name} is` : "You are";
  const stats = pupilStats(d.marks);
  const rev = revisionRows(stats);
  const due = rev.filter((r) => r.status === "due");
  const levels = d.levels.filter((l) => d.mine.includes(l.id));
  const hw = d.homework.filter((h) => d.mine.includes(h.level_id)).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const next = nextSession(d.sessions);

  return (
    <div className="space-y-4">
      {error && <Notice tone="bad">{error}</Notice>}
      {levels.length === 0 ? (
        <Notice>{who} not in a Qur&apos;an or Qaidah level group yet. The teacher will place {name ? "them" : "you"} soon.</Notice>
      ) : (
        <div className="flex flex-wrap gap-2">
          {levels.map((l) => (
            <StatusChip key={l.id} tone="info">
              {l.track === "qaidah" ? "Qaidah" : "Qur'an"} · {shortLevel(l.name)}
              {l.meets ? ` · ${l.meets}` : ""}
            </StatusChip>
          ))}
        </div>
      )}
      <Tabs
        label="Qur'an sections"
        value={tab}
        onChange={setTab}
        items={[
          { key: "progress", label: "Progress" },
          { key: "revision", label: "Revision", count: due.length, countAlert: due.length > 0 },
          { key: "homework", label: "Homework", count: hw.filter((h) => h.due_date >= todayISO()).length },
          { key: "sessions", label: "One to one" },
        ]}
      />

      {tab === "progress" &&
        (stats.count === 0 ? (
          <EmptyState title="No marks yet.">After your teacher listens to a recitation, the mark out of 10 and the surah appear here.</EmptyState>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Average mark" value={`${stats.overall} / 10`} sub={`${stats.count} marks${stats.trend ? ` · ${stats.trend}` : ""}`} />
              <Stat label="Surahs covered" value={String(stats.covered)} sub="recited at least once" />
              <Stat label="Secure surahs" value={String(stats.secure)} sub="average 8 or more" />
              <Stat label="Juz Amma" value={`${stats.juzAmma} / ${JUZ_AMMA_COUNT}`} sub="surahs 78 to 114" />
            </div>
            <div className={ui.card}>
              <h2 className="text-base font-semibold text-ink">Focus areas</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {stats.focus.length ? stats.focus.map(([k, n]) => <StatusChip key={k} tone="warn">{focusLabel(k)} × {n}</StatusChip>) : <span className="text-sm text-ink/70">Nothing flagged recently.</span>}
              </div>
            </div>
            <div className={ui.card}>
              <h2 className="text-base font-semibold text-ink">Average mark by surah</h2>
              <ul className="mt-3 space-y-2">
                {stats.surahs.map((s) => (
                  <li key={s.surah} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,12rem)_1fr_auto]">
                    <span className="truncate text-ink">
                      {surahName(s.surah)} <span lang="ar" dir="rtl" className="text-ink/65">{surahAr(s.surah)}</span>
                    </span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-cream" role="img" aria-label={`${s.avg} out of 10`}>
                      <span className={`block h-full rounded-full ${s.avg >= 8 ? "bg-teal-700" : s.avg >= 6 ? "bg-gold-500" : "bg-red-600"}`} style={{ width: `${s.avg * 10}%` }} />
                    </span>
                    <span className="tabular-nums text-ink/80">{s.avg} · {s.times}×</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={ui.card}>
              <h2 className="text-base font-semibold text-ink">Recent marks</h2>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <thead>
                    <tr className="text-xs text-ink/65">
                      <th className="py-1 pr-3 font-medium">Date</th><th className="pr-3 font-medium">Surah</th><th className="pr-3 font-medium">Ayat</th><th className="pr-3 font-medium">Where</th><th className="pr-3 font-medium">Mark</th><th className="font-medium">Focus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.marks.slice().reverse().slice(0, 10).map((m) => (
                      <tr key={m.id} className="border-t border-gold-light/60 align-top">
                        <td className="py-1.5 pr-3">{fmt(m.session_date)}</td>
                        <td className="pr-3">{surahName(m.surah_from as number)}</td>
                        <td className="pr-3">{ayatLabel(m.surah_from, m.ayah_from, m.ayah_to)}</td>
                        <td className="pr-3">{SETTING_LABEL[m.setting]}</td>
                        <td className="pr-3 font-semibold tabular-nums">{m.score}/10 <span className="font-normal text-ink/65">{bandFor(m.score)?.label}</span></td>
                        <td>{(m.focus || []).map(focusLabel).join(", ") || "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ))}

      {tab === "revision" &&
        (rev.length === 0 ? (
          <EmptyState title="Nothing to revise yet.">A surah appears here once it has been assessed. Revision keeps it secure.</EmptyState>
        ) : (
          <>
            <div className={ui.card}>
              <h2 className="text-base font-semibold text-ink">{due.length ? "Revise these now" : "Up to date"}</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {due.length ? due.map((r) => <StatusChip key={r.surah} tone="warn">{surahName(r.surah)} · {r.gap} days ago</StatusChip>) : <span className="text-sm text-ink/70">Nothing due. Well done.</span>}
              </div>
              <p className="mt-3 text-xs text-ink/65">A surah comes due again 3 days after a fail (0 to 4), 7 after a developing mark (5 or 6), 14 after a good one (7 or 8) and 30 after an excellent one (9 or 10).</p>
            </div>
            <div className={ui.card}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead>
                    <tr className="text-xs text-ink/65">
                      <th className="py-1 pr-3 font-medium">Surah</th><th className="pr-3 font-medium">Times</th><th className="pr-3 font-medium">Last</th><th className="pr-3 font-medium">Average</th><th className="pr-3 font-medium">Revise by</th><th className="font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rev.map((r) => (
                      <tr key={r.surah} className="border-t border-gold-light/60">
                        <td className="py-1.5 pr-3">{surahName(r.surah)}</td>
                        <td className="pr-3">{r.times}</td>
                        <td className="pr-3">{fmt(r.last)}</td>
                        <td className="pr-3">{r.avg}</td>
                        <td className="pr-3">{fmt(r.next)}</td>
                        <td><StatusChip tone={r.status === "due" ? "warn" : r.status === "soon" ? "info" : "good"}>{r.status === "due" ? "Due" : r.status === "soon" ? "Soon" : "OK"}</StatusChip></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ))}

      {tab === "homework" &&
        (hw.length === 0 ? (
          <EmptyState title="No Qur'an homework set.">It appears here when your teacher sets it for your level.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {hw.map((h) => {
              const mark = d.marks.find((m) => m.homework_id === h.id);
              return (
                <li key={h.id} className={`${ui.card} flex flex-wrap items-center justify-between gap-2`}>
                  <span className="text-sm text-ink">
                    <span className="font-semibold">{HW_KINDS[h.kind]}</span>
                    {h.surah ? `: ${surahName(h.surah)} ayat ${ayatLabel(h.surah, h.ayah_from, h.ayah_to)}` : ""}
                    {h.note ? ` · ${h.note}` : ""}
                  </span>
                  <span className="flex items-center gap-2 text-sm text-ink/70">
                    due {fmt(h.due_date)}
                    {mark ? <StatusChip tone="good">{mark.score}/10</StatusChip> : <StatusChip tone={h.due_date < todayISO() ? "bad" : "warn"}>{h.due_date < todayISO() ? "Not marked" : "To do"}</StatusChip>}
                  </span>
                </li>
              );
            })}
          </ul>
        ))}

      {tab === "sessions" && (
        <div className={ui.card}>
          <h2 className="text-base font-semibold text-ink">Live recitation with a teacher</h2>
          <p className="mt-1 text-sm text-ink/70">Your teacher books these, like a normal lesson. Come ready to recite what you have been working on.</p>
          <h3 className="mt-4 text-sm font-semibold text-ink">Coming up</h3>
          <ul className="mt-1 space-y-1.5">
            {d.sessions.filter((s) => !s.done && s.session_date >= todayISO()).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm text-ink">
                {fmt(s.session_date)} at {s.session_time.slice(0, 5)}{s.teacher_name ? ` with ${s.teacher_name}` : ""}
                {next?.id === s.id && <StatusChip tone="info">Next</StatusChip>}
              </li>
            ))}
            {!d.sessions.some((s) => !s.done && s.session_date >= todayISO()) && <li className="text-sm text-ink/70">Nothing booked yet. Your teacher will schedule the next one.</li>}
          </ul>
          {d.sessions.some((s) => s.done) && (
            <>
              <h3 className="mt-4 text-sm font-semibold text-ink">Done</h3>
              <ul className="mt-1 space-y-1">
                {d.sessions.filter((s) => s.done).reverse().slice(0, 8).map((s) => <li key={s.id} className="text-sm text-ink/75">{fmt(s.session_date)}{s.teacher_name ? ` with ${s.teacher_name}` : ""}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-gold-light bg-white p-4">
      <p className="text-xs text-ink/65">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      <p className="text-xs text-ink/65">{sub}</p>
    </div>
  );
}
