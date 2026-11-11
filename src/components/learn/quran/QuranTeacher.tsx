"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { myTeachingClasses } from "@/lib/learn/classes";
import { Tabs } from "@/components/learn/Tabs";
import { EmptyState, Notice, StatusChip, ui } from "@/components/learn/ui";
import { FOCUS_AREAS, focusLabel, surahAyat, surahName, SURAHS } from "@/lib/learn/surahs";
import {
  addDaysISO, avg, ayatLabel, bandFor, MARK_BANDS, HW_KINDS, MARK_COLUMNS, nextSession, pupilStats, revisionRows, shortLevel, todayISO,
  type Homework, type Level, type QuranMark, type Session,
} from "@/lib/learn/quranClassroom";
import { Select } from "@/components/learn/Select";

type Pupil = { id: string; name: string; year: string | null };
type ChildLevel = { child_id: string; track: "qaidah" | "quran"; level_id: string };
type Tab = "mark" | "homework" | "groups" | "sessions" | "revision" | "data";
type Data = { pupils: Pupil[]; levels: Level[]; childLevels: ChildLevel[]; homework: Homework[]; sessions: Session[]; marks: QuranMark[] };

const fmt = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const SURAH_OPTIONS = SURAHS.map((s, i) => ({ n: i + 1, label: `${i + 1}. ${s[0]} ${s[1]}` }));

export function QuranTeacher() {
  const supabase = getSupabaseClient();
  const [tab, setTab] = useState<Tab>("mark");
  const [data, setData] = useState<Data | null>(null);
  const [version, setVersion] = useState(0);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    (async () => {
      const classes = await myTeachingClasses();
      const ids = classes.map((c) => c.id);
      const enr = ids.length ? await supabase.from("enrolments").select("children(id, name, year_groups(name))").in("class_id", ids) : { data: [] };
      const seen = new Map<string, Pupil>();
      for (const r of ((enr.data as unknown as { children: { id: string; name: string; year_groups?: { name: string } | null } | null }[]) || [])) {
        if (r.children) seen.set(r.children.id, { id: r.children.id, name: r.children.name, year: r.children.year_groups?.name || null });
      }
      const pupils = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
      const pid = pupils.map((p) => p.id);
      const empty = { data: [] as unknown[] };
      const [lv, cl, hw, se, mk] = await Promise.all([
        supabase.from("quran_levels").select("id, track, name, sort, meets").order("sort"),
        pid.length ? supabase.from("quran_child_levels").select("child_id, track, level_id").in("child_id", pid) : empty,
        supabase.from("quran_homework").select("id, level_id, kind, surah, ayah_from, ayah_to, note, due_date").order("due_date", { ascending: false }).limit(80),
        pid.length ? supabase.from("quran_sessions").select("id, child_id, teacher_name, session_date, session_time, done").in("child_id", pid).gte("session_date", addDaysISO(todayISO(), -90)).order("session_date") : empty,
        pid.length ? supabase.from("quran_progress").select(MARK_COLUMNS).in("child_id", pid).eq("milestone_type", "quran_memorisation") : empty,
      ]);
      if (!alive) return;
      setData({
        pupils,
        levels: (lv.data as Level[]) || [],
        childLevels: (cl.data as ChildLevel[]) || [],
        homework: (hw.data as Homework[]) || [],
        sessions: (se.data as Session[]) || [],
        marks: (mk.data as QuranMark[]) || [],
      });
    })();
    return () => {
      alive = false;
    };
  }, [supabase, version]);

  const done = (text: string) => {
    setMsg({ tone: "good", text });
    refresh();
  };
  const fail = (text: string) => setMsg({ tone: "bad", text });

  if (!data) return <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />;
  if (data.pupils.length === 0) return <EmptyState title="No pupils yet.">Pupils from the classes you teach appear here, ready to be placed in a Qaidah or Qur&apos;an level.</EmptyState>;

  const levelOf = (childId: string, track: "qaidah" | "quran") => data.childLevels.find((c) => c.child_id === childId && c.track === track)?.level_id || "";
  const levelsFor = (childId: string) => data.childLevels.filter((c) => c.child_id === childId).map((c) => c.level_id);
  const pupilsIn = (levelId: string) => data.pupils.filter((p) => levelsFor(p.id).includes(levelId));
  const lvName = (id: string) => shortLevel(data.levels.find((l) => l.id === id)?.name || id);
  const pupilLevels = (p: Pupil) => levelsFor(p.id).map(lvName).join(" + ") || "No level yet";

  const dueTotal = data.pupils.filter((p) => revisionRows(pupilStats(data.marks.filter((m) => m.child_id === p.id))).some((r) => r.status === "due")).length;
  const unbooked = data.pupils.filter((p) => !nextSession(data.sessions.filter((s) => s.child_id === p.id))).length;

  return (
    <div className="space-y-4">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <MarkScale />
      <Tabs
        label="Qur'an sections"
        guide="quran-sections"
        value={tab}
        onChange={(k) => {
          setTab(k);
          setMsg(null);
        }}
        items={[
          { key: "mark", label: "Mark homework" },
          { key: "homework", label: "Set homework" },
          { key: "groups", label: "Level groups" },
          { key: "sessions", label: "One to one", count: unbooked, countAlert: unbooked > 0 },
          { key: "revision", label: "Revision", count: dueTotal, countAlert: dueTotal > 0 },
          { key: "data", label: "Class data" },
        ]}
      />
      {tab === "mark" && <MarkTab data={data} pupilsIn={pupilsIn} lvName={lvName} onDone={done} onFail={fail} />}
      {tab === "homework" && <HomeworkTab data={data} pupilsIn={pupilsIn} onDone={done} onFail={fail} />}
      {tab === "groups" && <GroupsTab data={data} levelOf={levelOf} pupilsIn={pupilsIn} onDone={done} onFail={fail} />}
      {tab === "sessions" && <SessionsTab data={data} pupilLevels={pupilLevels} onDone={done} onFail={fail} />}
      {tab === "revision" && <RevisionTab data={data} />}
      {tab === "data" && <DataTab data={data} pupilLevels={pupilLevels} pupilsIn={pupilsIn} />}
    </div>
  );
}

function MarkScale() {
  return (
    <details className={ui.card}>
      <summary className="cursor-pointer text-sm font-semibold text-ink">What the marks mean (0 to 10)</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead>
            <tr className="text-xs text-ink/65">
              <th className="py-1 pr-3 font-medium">Mark</th><th className="pr-3 font-medium">Level</th><th className="pr-3 font-medium">Result</th><th className="font-medium">What it looks like</th>
            </tr>
          </thead>
          <tbody>
            {MARK_BANDS.map((b) => (
              <tr key={b.label} className="border-t border-gold-light/60 align-top">
                <td className="py-1.5 pr-3 tabular-nums">{b.min === b.max ? b.min : `${b.min}-${b.max}`}</td>
                <td className="pr-3"><StatusChip tone={b.tone}>{b.label}</StatusChip></td>
                <td className="pr-3">{b.result}</td>
                <td>{b.means}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ── shared mark form ────────────────────────────────────────────────────

type MarkDraft = { score: number | null; focus: string[] };

function ScoreAndFocus({ draft, set }: { draft: MarkDraft; set: (d: MarkDraft) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <p className={ui.hint}>Mark out of 10. Fail is 0 to 4, pass is 5 or more, secure is 8 or more.</p>
        <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Mark out of 10">
          {Array.from({ length: 11 }, (_, n) => (
            <button key={n} type="button" aria-pressed={draft.score === n} onClick={() => set({ ...draft, score: n })} className={`${draft.score === n ? ui.chipOn : ui.chip} min-w-10 tabular-nums`}>
              {n}
            </button>
          ))}
        </div>
      </div>
      {bandFor(draft.score) && (
        <p className="rounded-lg bg-cream/70 px-3 py-2 text-sm text-ink">
          <span className="font-semibold">{draft.score}: {bandFor(draft.score)!.label} ({bandFor(draft.score)!.result}).</span> {bandFor(draft.score)!.means} {bandFor(draft.score)!.next}
        </p>
      )}
      <div>
        <p className={ui.hint}>Tajweed focus: tap anything that needs work</p>
        <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Focus areas">
          {FOCUS_AREAS.map((f) => {
            const on = draft.focus.includes(f.key);
            return (
              <button key={f.key} type="button" aria-pressed={on} onClick={() => set({ ...draft, focus: on ? draft.focus.filter((x) => x !== f.key) : [...draft.focus, f.key] })} className={on ? ui.chipOn : ui.chip}>
                <span lang="ar">{f.ar}</span> · {f.en}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

async function saveMark(row: { child_id: string; surah: number; ayah_from: number; ayah_to: number; score: number; focus: string[]; setting: QuranMark["setting"]; session_date: string; homework_id?: string | null; session_id?: string | null }) {
  const supabase = getSupabaseClient();
  if (!supabase) return "Not connected.";
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Please sign in again.";
  const { error } = await supabase.from("quran_progress").insert({
    child_id: row.child_id,
    class_id: null,
    milestone_type: "quran_memorisation",
    surah_from: row.surah,
    surah_to: row.surah,
    ayah_from: row.ayah_from,
    ayah_to: row.ayah_to,
    score: row.score,
    focus: row.focus,
    setting: row.setting,
    session_date: row.session_date,
    homework_id: row.homework_id ?? null,
    session_id: row.session_id ?? null,
    recorded_by: user.id,
  });
  return error ? "Couldn't save that mark. Try again." : null;
}

type Common = { onDone: (t: string) => void; onFail: (t: string) => void };

// ── mark homework ───────────────────────────────────────────────────────

function MarkTab({ data, pupilsIn, lvName, onDone, onFail }: { data: Data; pupilsIn: (l: string) => Pupil[]; lvName: (id: string) => string } & Common) {
  const [hwId, setHwId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, MarkDraft>>({});
  const [busy, setBusy] = useState("");
  const hws = data.homework.filter((h) => h.surah);
  const hw = hws.find((h) => h.id === hwId) || hws[0];
  if (!hw) return <EmptyState title="No homework set yet.">Set some on the Set homework tab, then mark it here.</EmptyState>;
  const pupils = pupilsIn(hw.level_id);
  return (
    <div className="space-y-3">
      <div className={`${ui.card} flex flex-wrap items-end gap-3`}>
        <label className="text-sm font-medium text-ink">
          Homework
          <Select className={`${ui.input} mt-1`} value={hw.id} onChange={(e) => setHwId(e.target.value)}>
            {hws.map((h) => (
              <option key={h.id} value={h.id}>
                {lvName(h.level_id)} · {HW_KINDS[h.kind]} · {surahName(h.surah as number)} {ayatLabel(h.surah, h.ayah_from, h.ayah_to)} · due {h.due_date}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {pupils.length === 0 ? (
        <EmptyState title="Nobody is in this level group yet.">Place pupils in a level on the Level groups tab.</EmptyState>
      ) : (
        pupils.map((p) => {
          const marked = data.marks.find((m) => m.child_id === p.id && m.homework_id === hw.id);
          const d = drafts[p.id] || { score: null, focus: [] };
          return (
            <div key={p.id} className={ui.card}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-ink">{p.name}{p.year ? ` · ${p.year}` : ""}</h3>
                {marked ? <StatusChip tone="good">Marked {marked.score}/10</StatusChip> : <StatusChip tone="warn">Waiting</StatusChip>}
              </div>
              {!marked && (
                <div className="mt-3 space-y-3">
                  <ScoreAndFocus draft={d} set={(x) => setDrafts({ ...drafts, [p.id]: x })} />
                  <button
                    type="button"
                    className={ui.btnPrimary}
                    disabled={d.score === null || busy === p.id}
                    onClick={async () => {
                      setBusy(p.id);
                      const err = await saveMark({ child_id: p.id, surah: hw.surah as number, ayah_from: hw.ayah_from || 1, ayah_to: hw.ayah_to || surahAyat(hw.surah as number), score: d.score as number, focus: d.focus, setting: hw.kind === "revision" ? "revision" : "homework", session_date: todayISO(), homework_id: hw.id });
                      setBusy("");
                      if (err) onFail(err);
                      else {
                        setDrafts({ ...drafts, [p.id]: { score: null, focus: [] } });
                        onDone(`Saved ${p.name}'s mark.`);
                      }
                    }}
                  >
                    Save mark
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── set homework ────────────────────────────────────────────────────────

function HomeworkTab({ data, pupilsIn, onDone, onFail }: { data: Data; pupilsIn: (l: string) => Pupil[] } & Common) {
  const [levelId, setLevelId] = useState(data.levels.find((l) => l.track === "quran")?.id || data.levels[0]?.id || "");
  const [kind, setKind] = useState<Homework["kind"]>("recitation");
  const [surah, setSurah] = useState(78);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(surahAyat(78));
  const [note, setNote] = useState("");
  const [due, setDue] = useState(addDaysISO(todayISO(), 7));
  const [busy, setBusy] = useState(false);
  const level = data.levels.find((l) => l.id === levelId);
  const qaidah = level?.track === "qaidah";
  const max = surahAyat(surah);

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("quran_homework").insert({
      level_id: levelId,
      kind,
      surah: qaidah ? null : surah,
      ayah_from: qaidah ? null : Math.min(from, max),
      ayah_to: qaidah ? null : Math.max(Math.min(to, max), Math.min(from, max)),
      note: note.trim() || null,
      due_date: due,
      set_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) onFail("Couldn't set that homework. Try again.");
    else onDone(`Homework set for ${shortLevel(level?.name || "")} (${pupilsIn(levelId).length} pupils).`);
  };

  return (
    <div className="space-y-3">
      <div className={ui.card}>
        <h2 className="text-base font-semibold text-ink">Set Qur&apos;an homework for a level group</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={ui.label}>
            Level group
            <Select className={`${ui.input} mt-1`} value={levelId} onChange={(e) => setLevelId(e.target.value)}>
              {data.levels.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          </label>
          <label className={ui.label}>
            Type
            <Select className={`${ui.input} mt-1`} value={kind} onChange={(e) => setKind(e.target.value as Homework["kind"])}>
              {Object.entries(HW_KINDS).map(([k, t]) => (
                <option key={k} value={k}>{t}</option>
              ))}
            </Select>
          </label>
          {!qaidah && (
            <>
              <label className={`${ui.label} sm:col-span-2`}>
                Surah
                <Select
                  className={`${ui.input} mt-1`}
                  value={surah}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setSurah(n);
                    setFrom(1);
                    setTo(surahAyat(n));
                  }}
                >
                  {SURAH_OPTIONS.map((s) => (
                    <option key={s.n} value={s.n}>{s.label}</option>
                  ))}
                </Select>
              </label>
              <label className={ui.label}>
                From ayah (1 to {max})
                <input type="number" min={1} max={max} className={`${ui.input} mt-1`} value={from} onChange={(e) => setFrom(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />
              </label>
              <label className={ui.label}>
                To ayah
                <input type="number" min={from} max={max} className={`${ui.input} mt-1`} value={to} onChange={(e) => setTo(Math.max(from, Math.min(max, Number(e.target.value) || from)))} />
              </label>
            </>
          )}
          <label className={`${ui.label} sm:col-span-2`}>
            {qaidah ? "What to practise" : "Note (optional)"}
            <input className={`${ui.input} mt-1`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={qaidah ? "For example: lesson 4, letters ba ta tha" : "For example: focus on the madd"} />
          </label>
          <label className={ui.label}>
            Due
            <input type="date" className={`${ui.input} mt-1`} value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>
        <div className="mt-4">
          <button type="button" className={ui.btnPrimary} disabled={busy || !levelId || (qaidah && !note.trim())} onClick={save}>
            Set homework
          </button>
        </div>
      </div>
      <div className={ui.card}>
        <h2 className="text-base font-semibold text-ink">Set so far</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-ink">
          {data.homework.slice(0, 12).map((h) => {
            const n = pupilsIn(h.level_id).length;
            const marked = data.marks.filter((m) => m.homework_id === h.id).length;
            return (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-gold-light/60 pt-1.5">
                <span>
                  {shortLevel(data.levels.find((l) => l.id === h.level_id)?.name || h.level_id)} · {HW_KINDS[h.kind]}
                  {h.surah ? ` · ${surahName(h.surah)} ${ayatLabel(h.surah, h.ayah_from, h.ayah_to)}` : ""}{h.note ? ` · ${h.note}` : ""}
                </span>
                <span className="text-ink/70">due {fmt(h.due_date)} · marked {marked} of {n}</span>
              </li>
            );
          })}
          {data.homework.length === 0 && <li className="text-ink/70">Nothing set yet.</li>}
        </ul>
      </div>
    </div>
  );
}

// ── level groups ────────────────────────────────────────────────────────

function GroupsTab({ data, levelOf, pupilsIn, onDone, onFail }: { data: Data; levelOf: (c: string, t: "qaidah" | "quran") => string; pupilsIn: (l: string) => Pupil[] } & Common) {
  const supabase = getSupabaseClient();
  const setLevel = async (child: string, track: "qaidah" | "quran", levelId: string) => {
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = levelId
      ? await supabase.from("quran_child_levels").upsert({ child_id: child, track, level_id: levelId, updated_by: user?.id ?? null, updated_at: new Date().toISOString() })
      : await supabase.from("quran_child_levels").delete().eq("child_id", child).eq("track", track);
    if (error) onFail("Couldn't change that level. Try again.");
    else onDone("Level updated.");
  };
  const setMeets = async (levelId: string, meets: string) => {
    if (!supabase) return;
    const { error } = await supabase.from("quran_levels").update({ meets: meets.trim() || null }).eq("id", levelId);
    if (error) onFail("Only the head teacher or an admin can change when a group meets.");
    else onDone("Saved.");
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink/75">Every class does Qur&apos;an, Qaidah or both. Tajweed is taught as part of Qur&apos;an. Groups are by level, not year, so a Year 9 and a Year 10 pupil can share one. Change a level when a pupil is ready.</p>
      <div className={ui.card}>
        <h2 className="text-base font-semibold text-ink">Who is in which level</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="text-xs text-ink/65">
                <th className="py-1 pr-3 font-medium">Pupil</th><th className="pr-3 font-medium">Qaidah</th><th className="font-medium">Qur&apos;an</th>
              </tr>
            </thead>
            <tbody>
              {data.pupils.map((p) => (
                <tr key={p.id} className="border-t border-gold-light/60">
                  <td className="py-1.5 pr-3">{p.name}{p.year ? ` (${p.year})` : ""}</td>
                  {(["qaidah", "quran"] as const).map((tr) => (
                    <td key={tr} className="py-1 pr-3">
                      <Select className={ui.input} aria-label={`${tr === "qaidah" ? "Qaidah" : "Qur'an"} level for ${p.name}`} value={levelOf(p.id, tr)} onChange={(e) => setLevel(p.id, tr, e.target.value)}>
                        <option value="">{tr === "qaidah" ? "Not doing Qaidah" : "Not doing Qur'an"}</option>
                        {data.levels.filter((l) => l.track === tr).map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </Select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.levels.map((l) => {
          const ps = pupilsIn(l.id);
          const years = [...new Set(ps.map((p) => p.year).filter(Boolean))].join(", ");
          return (
            <div key={l.id} className={ui.card}>
              <h3 className="text-base font-semibold text-ink">{l.name}</h3>
              <p className="text-xs text-ink/65">{ps.length} pupil{ps.length === 1 ? "" : "s"}{years ? ` · ${years}` : ""}</p>
              <label className={`${ui.label} mt-2`}>
                Group meets
                <input className={`${ui.input} mt-1`} defaultValue={l.meets || ""} placeholder="For example: Wed 16:30" onBlur={(e) => e.target.value !== (l.meets || "") && setMeets(l.id, e.target.value)} />
              </label>
              <p className="mt-2 text-sm text-ink/80">{ps.map((p) => p.name).join(", ") || "No pupils yet"}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── one to one ──────────────────────────────────────────────────────────

function SessionsTab({ data, pupilLevels, onDone, onFail }: { data: Data; pupilLevels: (p: Pupil) => string } & Common) {
  const supabase = getSupabaseClient();
  const [pid, setPid] = useState(data.pupils[0]?.id || "");
  const [date, setDate] = useState(addDaysISO(todayISO(), 3));
  const [time, setTime] = useState("16:00");
  const [weeks, setWeeks] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<MarkDraft>({ score: null, focus: [] });
  const [surah, setSurah] = useState(78);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(surahAyat(78));

  const schedule = async () => {
    if (!supabase || !pid) return;
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const me = user ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle() : null;
    const rows = Array.from({ length: weeks }, (_, k) => ({ child_id: pid, teacher_id: user?.id ?? null, teacher_name: (me?.data as { full_name?: string } | null)?.full_name ?? null, session_date: addDaysISO(date, 7 * k), session_time: time, created_by: user?.id ?? null }));
    const { error } = await supabase.from("quran_sessions").insert(rows);
    setBusy(false);
    if (error) onFail("Couldn't schedule that. Try again.");
    else onDone(`Scheduled ${weeks} session${weeks > 1 ? "s" : ""}.`);
  };

  const finish = async (s: Session) => {
    if (!supabase || draft.score === null) return;
    setBusy(true);
    const err = await saveMark({ child_id: s.child_id, surah, ayah_from: from, ayah_to: Math.max(from, to), score: draft.score, focus: draft.focus, setting: "one_to_one", session_date: s.session_date, session_id: s.id });
    if (!err) await supabase.from("quran_sessions").update({ done: true }).eq("id", s.id);
    setBusy(false);
    if (err) onFail(err);
    else {
      setOpenId(null);
      setDraft({ score: null, focus: [] });
      onDone("Session marked.");
    }
  };

  const noNext = data.pupils.filter((p) => !nextSession(data.sessions.filter((s) => s.child_id === p.id)));
  const name = (id: string) => data.pupils.find((p) => p.id === id)?.name || "Pupil";
  const upcoming = data.sessions.filter((s) => !s.done).sort((a, b) => (a.session_date + a.session_time).localeCompare(b.session_date + b.session_time));
  const max = surahAyat(surah);

  return (
    <div className="space-y-3">
      <div className={ui.card}>
        <h2 className="text-base font-semibold text-ink">Schedule a one-to-one recitation</h2>
        <p className="mt-1 text-sm text-ink/70">Actual recitation needs a teacher listening one to one. Book it like any lesson, and repeat it weekly if you want. The pupil and their parent see it.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <label className={`${ui.label} sm:col-span-2`}>
            Pupil
            <Select className={`${ui.input} mt-1`} value={pid} onChange={(e) => setPid(e.target.value)}>
              {data.pupils.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {pupilLevels(p)}</option>
              ))}
            </Select>
          </label>
          <label className={ui.label}>
            First date
            <input type="date" className={`${ui.input} mt-1`} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className={ui.label}>
            Time
            <input type="time" className={`${ui.input} mt-1`} value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className={ui.label}>
            Weeks in a row
            <input type="number" min={1} max={12} className={`${ui.input} mt-1`} value={weeks} onChange={(e) => setWeeks(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
          </label>
        </div>
        <div className="mt-4">
          <button type="button" className={ui.btnPrimary} disabled={busy || !pid} onClick={schedule}>Schedule</button>
        </div>
      </div>
      <div className={ui.card}>
        <h2 className="text-base font-semibold text-ink">No next session booked</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {noNext.length ? noNext.map((p) => <StatusChip key={p.id} tone="warn">{p.name} · {pupilLevels(p)}</StatusChip>) : <span className="text-sm text-ink/70">Everyone has a session booked.</span>}
        </div>
      </div>
      <div className={ui.card}>
        <h2 className="text-base font-semibold text-ink">Coming up</h2>
        <ul className="mt-2 space-y-2">
          {upcoming.map((s) => (
            <li key={s.id} className="border-t border-gold-light/60 pt-2 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink">
                <span>{fmt(s.session_date)} {s.session_time.slice(0, 5)} · {name(s.child_id)}</span>
                <span className="flex gap-2">
                  <button type="button" className={`${ui.btnSecondary} ${ui.sm}`} onClick={() => setOpenId(openId === s.id ? null : s.id)}>{openId === s.id ? "Close" : "Mark session"}</button>
                  <button
                    type="button"
                    className={`${ui.btnSecondary} ${ui.sm}`}
                    onClick={async () => {
                      const { error } = (await supabase?.from("quran_sessions").delete().eq("id", s.id)) || { error: null };
                      if (error) onFail("Couldn't cancel that.");
                      else onDone("Session cancelled.");
                    }}
                  >
                    Cancel
                  </button>
                </span>
              </div>
              {openId === s.id && (
                <div className="mt-3 space-y-3 rounded-xl bg-cream/60 p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className={`${ui.label} sm:col-span-3`}>
                      Surah recited
                      <Select className={`${ui.input} mt-1`} value={surah} onChange={(e) => { const n = Number(e.target.value); setSurah(n); setFrom(1); setTo(surahAyat(n)); }}>
                        {SURAH_OPTIONS.map((x) => (
                          <option key={x.n} value={x.n}>{x.label}</option>
                        ))}
                      </Select>
                    </label>
                    <label className={ui.label}>
                      From ayah
                      <input type="number" min={1} max={max} className={`${ui.input} mt-1`} value={from} onChange={(e) => setFrom(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />
                    </label>
                    <label className={ui.label}>
                      To ayah
                      <input type="number" min={from} max={max} className={`${ui.input} mt-1`} value={to} onChange={(e) => setTo(Math.max(from, Math.min(max, Number(e.target.value) || from)))} />
                    </label>
                  </div>
                  <ScoreAndFocus draft={draft} set={setDraft} />
                  <button type="button" className={ui.btnPrimary} disabled={busy || draft.score === null} onClick={() => finish(s)}>Save recitation mark</button>
                </div>
              )}
            </li>
          ))}
          {upcoming.length === 0 && <li className="text-sm text-ink/70">Nothing scheduled.</li>}
        </ul>
      </div>
    </div>
  );
}

// ── revision ────────────────────────────────────────────────────────────

function RevisionTab({ data }: { data: Data }) {
  const rows = data.pupils.map((p) => {
    const r = revisionRows(pupilStats(data.marks.filter((m) => m.child_id === p.id)));
    const due = r.filter((x) => x.status === "due");
    return { p, covered: r.length, due };
  });
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink/75">A surah counts as covered once it has been assessed once. Revision keeps it secure: it comes due again 3 days after a fail (0 to 4), 7 after a developing mark (5 or 6), 14 after a good mark (7 or 8) and 30 after an excellent one (9 or 10). Set revision homework from Set homework, or hear it in a one-to-one.</p>
      <div className={ui.card}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="text-xs text-ink/65">
                <th className="py-1 pr-3 font-medium">Pupil</th><th className="pr-3 font-medium">Covered</th><th className="pr-3 font-medium">Due now</th><th className="font-medium">Most overdue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, covered, due }) => (
                <tr key={p.id} className="border-t border-gold-light/60">
                  <td className="py-1.5 pr-3">{p.name}</td>
                  <td className="pr-3">{covered}</td>
                  <td className="pr-3"><StatusChip tone={due.length ? "warn" : "good"}>{due.length}</StatusChip></td>
                  <td>{due[0] ? `${surahName(due[0].surah)} (${due[0].overdue} days over)` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── class data ──────────────────────────────────────────────────────────

function DataTab({ data, pupilLevels, pupilsIn }: { data: Data; pupilLevels: (p: Pupil) => string; pupilsIn: (l: string) => Pupil[] }) {
  const rows = data.pupils.map((p) => ({ p, s: pupilStats(data.marks.filter((m) => m.child_id === p.id)), next: nextSession(data.sessions.filter((x) => x.child_id === p.id)) }));
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.levels.map((l) => {
          const ps = pupilsIn(l.id).map((p) => rows.find((r) => r.p.id === p.id)).filter((r) => r && r.s.count > 0);
          const a = avg(ps.map((r) => r!.s.overall as number));
          return (
            <div key={l.id} className="rounded-2xl border border-gold-light bg-white p-4">
              <p className="text-xs text-ink/65">{l.name}</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-ink">{a === null ? "–" : a}</p>
              <p className="text-xs text-ink/65">{ps.length} pupils with marks</p>
            </div>
          );
        })}
      </div>
      <div className={ui.card}>
        <h2 className="text-base font-semibold text-ink">Every pupil</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead>
              <tr className="text-xs text-ink/65">
                <th className="py-1 pr-3 font-medium">Pupil</th><th className="pr-3 font-medium">Group</th><th className="pr-3 font-medium">Average /10</th><th className="pr-3 font-medium">Marks</th><th className="pr-3 font-medium">Surahs covered</th><th className="pr-3 font-medium">Secure</th><th className="pr-3 font-medium">Work on</th><th className="font-medium">Next one to one</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, s, next }) => (
                <tr key={p.id} className="border-t border-gold-light/60 align-top">
                  <td className="py-1.5 pr-3">
                    <Link href={`/teach/pupils?pupil=${p.id}`} className="font-medium text-teal-700 hover:underline">{p.name}</Link>
                    {p.year ? ` (${p.year})` : ""}
                  </td>
                  <td className="pr-3">{pupilLevels(p)}</td>
                  <td className="pr-3 tabular-nums">{s.overall ?? "–"}</td>
                  <td className="pr-3">{s.count}</td>
                  <td className="pr-3">{s.covered}</td>
                  <td className="pr-3">{s.secure}</td>
                  <td className="pr-3">{s.focus.slice(0, 2).map(([k]) => focusLabel(k)).join(", ") || "–"}</td>
                  <td>{next ? <StatusChip tone="good">{fmt(next.session_date)} {next.session_time.slice(0, 5)}</StatusChip> : <StatusChip tone="warn">Not booked</StatusChip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
