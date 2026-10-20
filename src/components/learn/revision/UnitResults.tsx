"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TONE, band, pct, unitInsights, type Insights } from "@/lib/learn/revision";
import { ui } from "@/components/learn/ui";

const btn = `${ui.btnSecondary} ${ui.sm}`;

type TopicStat = { topic: string; right: number; total: number; p: number };

/**
 * Staff view of one unit's revision results: how the class did on each topic,
 * the questions most missed (and the wrong answer chosen most, which shows what
 * pupils are confusing), every pupil by topic, and a short reteach plan.
 */
export function UnitResults({ unitId }: { unitId: string }) {
  const [cls, setCls] = useState<string>("");
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await unitInsights(unitId, cls || null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the results.");
    }
  }, [unitId, cls]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load when the unit or class changes
    load();
  }, [load]);

  const stats = useMemo(() => {
    if (!data) return null;
    const qById = new Map(data.questions.map((q) => [q.id, q]));
    const topics = [...new Set(data.questions.map((q) => q.topic))];
    const taken = data.pupils.filter((p) => p.quiz && Object.keys(p.quiz.answers).length);
    const pupilPct = new Map<string, number>();
    const perTopic = new Map<string, { right: number; total: number }>();
    const perQ = new Map<string, { wrong: number; total: number; picks: Map<number, number> }>();
    for (const p of taken) {
      let right = 0;
      let total = 0;
      for (const [qid, chosen] of Object.entries(p.quiz!.answers)) {
        const q = qById.get(qid);
        if (!q) continue;
        const ok = chosen === q.answer;
        total++;
        if (ok) right++;
        const t = perTopic.get(q.topic) || { right: 0, total: 0 };
        t.total++;
        if (ok) t.right++;
        perTopic.set(q.topic, t);
        const s = perQ.get(qid) || { wrong: 0, total: 0, picks: new Map() };
        s.total++;
        if (!ok) {
          s.wrong++;
          s.picks.set(chosen, (s.picks.get(chosen) || 0) + 1);
        }
        perQ.set(qid, s);
      }
      pupilPct.set(p.id, pct(right, total));
    }
    const topicStats: TopicStat[] = topics
      .map((t) => {
        const s = perTopic.get(t) || { right: 0, total: 0 };
        return { topic: t, ...s, p: pct(s.right, s.total) };
      })
      .filter((t) => t.total > 0)
      .sort((a, b) => a.p - b.p);
    const missed = [...perQ.entries()]
      .filter(([, s]) => s.wrong > 0)
      .sort((a, b) => b[1].wrong - a[1].wrong)
      .slice(0, 4)
      .map(([qid, s]) => {
        const q = qById.get(qid)!;
        const top = [...s.picks.entries()].sort((a, b) => b[1] - a[1])[0];
        return { q, wrong: s.wrong, total: s.total, common: top ? { text: q.options[top[0]], n: top[1] } : null };
      });
    const avg = taken.length ? Math.round([...pupilPct.values()].reduce((a, b) => a + b, 0) / taken.length) : null;
    const under = taken.filter((p) => (pupilPct.get(p.id) ?? 0) < 60);
    const notTaken = data.pupils.filter((p) => !taken.includes(p));
    return { topics, taken, pupilPct, topicStats, missed, avg, under, notTaken, qById };
  }, [data]);

  if (error)
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
        {error}
      </p>
    );
  if (!data || !stats) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;

  const cellFor = (answers: Record<string, number>, topic: string) => {
    let right = 0;
    let total = 0;
    for (const [qid, chosen] of Object.entries(answers)) {
      const q = stats.qById.get(qid);
      if (!q || q.topic !== topic) continue;
      total++;
      if (chosen === q.answer) right++;
    }
    return { right, total };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          Class
          <select value={cls} onChange={(e) => setCls(e.target.value)} className="rounded-md border border-gold-light bg-white px-3 py-1.5 text-sm">
            <option value="">All my pupils in {data.unit.year === "reception" ? "Reception" : `Year ${data.unit.year.slice(1)}`}</option>
            {data.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={btn} onClick={load}>
          Refresh
        </button>
        {!data.unit.published && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Hidden from pupils</span>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={`${stats.taken.length}/${data.pupils.length}`} label="pupils have taken the quiz" />
        <Stat value={stats.avg === null ? "–" : `${stats.avg}%`} label="average score" tone={stats.avg === null ? undefined : band(stats.avg).tone} />
        <Stat value={stats.topicStats[0]?.topic || "–"} label={stats.topicStats[0] ? `weakest topic (${stats.topicStats[0].p}%)` : "weakest topic"} small />
        <Stat value={String(stats.under.length)} label="pupils under 60%" tone={stats.under.length ? "bad" : undefined} />
      </div>

      {stats.taken.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/70">
          No quiz results yet. They appear here as soon as pupils take the quiz in Unit revision.
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-gold-light bg-white p-4" aria-label="Topics, weakest first">
              <h3 className="mb-2 font-semibold text-ink">Topics, weakest first</h3>
              <ul className="divide-y divide-gold-light/70">
                {stats.topicStats.map((t) => (
                  <li key={t.topic} className="grid grid-cols-[minmax(0,1fr)_7rem_3rem] items-center gap-3 py-2 text-sm">
                    <span className="text-ink">{t.topic}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-cream" aria-hidden="true">
                      <span className={`block h-full rounded-full ${TONE[band(t.p).tone].bar}`} style={{ width: `${t.p}%` }} />
                    </span>
                    <span className="text-right tabular-nums text-ink/70">{t.p}%</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="space-y-2 rounded-2xl border border-gold-light bg-white p-4" aria-label="Most-missed questions">
              <h3 className="font-semibold text-ink">Most-missed questions</h3>
              {stats.missed.length === 0 && <p className="text-sm text-ink/65">Nobody has missed a question yet.</p>}
              {stats.missed.map((m) => (
                <div key={m.q.id} className="space-y-1 rounded-xl border border-gold-light/80 p-3 text-sm">
                  <p className="text-xs text-ink/60">
                    {m.q.topic} · missed by {m.wrong} of {m.total}
                  </p>
                  <p className="font-medium text-ink">{m.q.question}</p>
                  <p className="text-xs text-ink/75">
                    Right answer: <span className="font-semibold text-green-800">{m.q.options[m.q.answer]}</span>
                  </p>
                  {m.common && (
                    <p className="text-xs text-ink/75">
                      Most common wrong answer: <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-800">{m.common.text}</span> ({m.common.n})
                    </p>
                  )}
                </div>
              ))}
            </section>
          </div>

          <section className="space-y-2 rounded-2xl border border-gold-light bg-white p-4" aria-label="Pupils by topic">
            <h3 className="font-semibold text-ink">Pupils by topic</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-1 text-xs">
                <thead>
                  <tr>
                    <th scope="col" className="px-2 py-1 text-left font-semibold text-ink/70">
                      Pupil
                    </th>
                    {stats.topics.map((t) => (
                      <th key={t} scope="col" className="max-w-[7rem] px-1 py-1 text-left align-bottom font-medium text-ink/70">
                        <span className="line-clamp-3">{t}</span>
                      </th>
                    ))}
                    <th scope="col" className="px-2 py-1 text-right font-semibold text-ink/70">
                      Score
                    </th>
                    <th scope="col" className="px-2 py-1 text-right font-semibold text-ink/70">
                      Practice
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.taken.map((p) => {
                    const sp = stats.pupilPct.get(p.id) ?? 0;
                    return (
                      <tr key={p.id}>
                        <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-medium text-ink">
                          {p.name}
                        </th>
                        {stats.topics.map((t) => {
                          const c = cellFor(p.quiz!.answers, t);
                          const cls2 = c.total === 0 ? "bg-cream text-ink/50" : c.right === c.total ? "bg-green-50 text-green-800" : c.right === 0 ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900";
                          return (
                            <td key={t} className={`rounded-md px-1 py-1.5 text-center font-semibold tabular-nums ${cls2}`}>
                              {c.total ? `${c.right}/${c.total}` : "–"}
                            </td>
                          );
                        })}
                        <td className={`px-2 py-1 text-right font-semibold tabular-nums ${TONE[band(sp).tone].text}`}>{sp}%</td>
                        <td className="px-2 py-1 text-right tabular-nums text-ink/70">{p.practice}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {stats.notTaken.length > 0 && (
              <p className="text-xs text-ink/70">
                <span className="font-semibold">Not taken yet:</span> {stats.notTaken.map((p) => p.name).join(", ")}
              </p>
            )}
          </section>

          <section className="space-y-2 rounded-2xl border border-gold-light bg-white p-4" aria-label="Reteach plan">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-ink">Reteach plan</h3>
              <button type="button" className={btn} onClick={() => setPlan((v) => !v)} aria-expanded={plan}>
                {plan ? "Hide plan" : "Write reteach plan"}
              </button>
            </div>
            {plan ? (
              <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
                {stats.topicStats.slice(0, 2).map((t) => {
                  const q = stats.missed.find((m) => m.q.topic === t.topic);
                  return (
                    <li key={t.topic}>
                      <strong>Reteach “{t.topic}” ({t.p}% correct).</strong>{" "}
                      {q?.common ? `Pupils most often chose “${q.common.text}” for “${q.q.question}”: start by showing why that's wrong. ` : ""}
                      {q?.q.explanation ? `Key point: ${q.q.explanation}` : ""}
                    </li>
                  );
                })}
                {stats.missed[0] && (
                  <li>
                    <strong>Hinge check next lesson.</strong> Ask again on mini-whiteboards: “{stats.missed[0].q.question}”
                  </li>
                )}
                {stats.under.length > 0 && (
                  <li>
                    <strong>Small-group support</strong> for {stats.under.map((p) => p.name).join(", ")}: set the practice coach on “{stats.topicStats[0]?.topic}”.
                  </li>
                )}
              </ol>
            ) : (
              <p className="text-sm text-ink/65">A short plan built from the weakest topics and the wrong answers pupils chose most.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ value, label, tone, small }: { value: string; label: string; tone?: "good" | "warn" | "bad"; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-gold-light bg-white p-4">
      <p className={`${small ? "text-base leading-snug" : "text-2xl"} font-semibold tabular-nums ${tone ? TONE[tone].text : "text-ink"}`}>{value}</p>
      <p className="text-xs text-ink/65">{label}</p>
    </div>
  );
}
