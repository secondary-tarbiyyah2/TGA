"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tabs } from "@/components/learn/Tabs";
import { downloadDeck } from "@/lib/learn/curriculum";
import { QuestionCard } from "@/components/learn/revision/QuestionCard";
import { WithArabic } from "@/components/learn/WithArabic";
import {
  TONE,
  answerQuestion,
  band,
  finishRound,
  mediaUrl,
  pct,
  pupilUnit,
  pupilUnits,
  startRound,
  toSeconds,
  type AnswerResult,
  type PupilQuestion,
  type PupilUnit,
  type PupilUnitCard,
} from "@/lib/learn/revision";

const btn = "rounded-md border border-gold-light px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream disabled:opacity-50";
const btnPrimary = "rounded-md bg-teal-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50";

function MasteryDots({ level, label }: { level: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${label ? `${label}: ` : ""}${level} of 3 steps${level >= 3 ? ", mastered" : ""}`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-full border ${i < level ? "border-teal-700 bg-teal-700" : "border-gold-light bg-cream"}`} />
      ))}
    </span>
  );
}

/** Pupil home for Unit revision: units for their year, then one unit at a time. */
export function PupilRevision() {
  const [units, setUnits] = useState<PupilUnitCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(() => {
    const m = typeof window === "undefined" ? null : window.location.hash.match(/^#unit-([0-9a-f-]{36})$/);
    return m ? m[1] : null;
  });

  const load = useCallback(async () => {
    try {
      setUnits(await pupilUnits());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your units.");
      setUnits([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
  }, [load]);

  const openUnit = (id: string | null) => {
    setOpen(id);
    try {
      window.history.replaceState(null, "", id ? `#unit-${id}` : window.location.pathname);
    } catch {
      /* ignore */
    }
    window.scrollTo(0, 0);
    if (!id) load();
  };

  if (open) return <UnitView id={open} onBack={() => openUnit(null)} />;

  const bySubject = new Map<string, PupilUnitCard[]>();
  (units || []).forEach((u) => bySubject.set(u.subject, [...(bySubject.get(u.subject) || []), u]));

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {units === null && <div className="h-40 animate-pulse rounded-2xl bg-white" />}
      {units && units.length === 0 && !error && (
        <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/70">
          No revision units for your year yet. Your teachers add them as the year goes on.
        </p>
      )}
      {[...bySubject.entries()].map(([subject, list]) => (
        <section key={subject} aria-label={subject} className="space-y-3">
          <h2 className="text-h3 font-semibold text-ink">{subject}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((u) => {
              const last = u.last_quiz ? pct(u.last_quiz.correct, u.last_quiz.total) : null;
              const tone = last === null ? null : band(last);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => openUnit(u.id)}
                  className="flex flex-col gap-3 rounded-2xl border border-gold-light bg-white p-4 text-left hover:border-teal-700 focus-visible:border-teal-700"
                >
                  <span className="text-xs font-medium uppercase tracking-wide text-ink/55">{u.kind === "summary" ? (u.has_video ? "Video and summary" : "Summary") : "Lesson slides"}</span>
                  <span className="text-base font-semibold text-ink">{u.title}</span>
                  <span className="text-xs text-ink/65">
                    {u.topics} topic{u.topics === 1 ? "" : "s"} · {u.questions} quiz questions
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-cream" aria-hidden="true">
                    <span className="block h-full rounded-full bg-teal-700" style={{ width: `${u.topics ? Math.round((u.mastered / u.topics) * 100) : 0}%` }} />
                  </span>
                  <span className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-ink/65">
                      {u.mastered} of {u.topics} topics mastered
                    </span>
                    {tone ? <span className={`rounded-full px-2 py-0.5 font-semibold ${TONE[tone.tone].chip}`}>Quiz {last}%</span> : <span className="rounded-full bg-teal-100 px-2 py-0.5 font-semibold text-teal-900">Not started</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

type Tab = "summary" | "quiz" | "practice";

function UnitView({ id, onBack }: { id: string; onBack: () => void }) {
  const [unit, setUnit] = useState<PupilUnit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const [practiceTopic, setPracticeTopic] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUnit(await pupilUnit(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open that unit.");
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load when the unit changes
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className={btn}>
        ‹ All units
      </button>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {!unit && !error && <div className="h-40 animate-pulse rounded-2xl bg-white" />}
      {unit && (
        <>
          <div>
            <p className="text-sm text-ink/60">{unit.subject}</p>
            <h2 className="text-h2 font-semibold text-ink">{unit.title}</h2>
          </div>
          <Tabs
            items={[
              { key: "summary" as Tab, label: "1 · Summary" },
              { key: "quiz" as Tab, label: "2 · Quiz" },
              { key: "practice" as Tab, label: "3 · Practice coach" },
            ]}
            value={tab}
            onChange={(k) => {
              setTab(k);
              if (k !== "practice") setPracticeTopic(null);
            }}
            label="Revision steps"
          />
          {tab === "summary" && (unit.kind === "summary" ? <SummaryView unit={unit} onQuiz={() => setTab("quiz")} /> : <LessonSlidesView unit={unit} onQuiz={() => setTab("quiz")} />)}
          {tab === "quiz" && (
            <QuizView
              unit={unit}
              onDone={load}
              onPractice={(topic) => {
                setPracticeTopic(topic);
                setTab("practice");
              }}
            />
          )}
          {tab === "practice" && <PracticeView key={practiceTopic || "auto"} unit={unit} initialTopic={practiceTopic} onChange={load} />}
        </>
      )}
    </div>
  );
}

function SummaryView({ unit, onQuiz }: { unit: PupilUnit; onQuiz: () => void }) {
  const slides = unit.summary;
  const [i, setI] = useState(0);
  const ref = useRef<HTMLVideoElement>(null);
  const keepPlaying = useRef(false);
  const s = slides[i];
  // Newer packs give each slide its own chapter video; older ones have one
  // video for the unit, with a start time per slide.
  const chapters = slides.some((x) => x.video_path);
  const videoPath = chapters ? s?.video_path || null : unit.video_path;
  const [loaded, setLoaded] = useState<{ path: string; url: string | null } | null>(null);
  const video = loaded && loaded.path === videoPath ? loaded.url : null;

  useEffect(() => {
    if (!videoPath) return;
    let alive = true;
    mediaUrl(videoPath).then((url) => alive && setLoaded({ path: videoPath, url }));
    return () => {
      alive = false;
    };
  }, [videoPath]);

  const seek = (t: string | null | undefined, play = true) => {
    const v = ref.current;
    if (!v || !t) return;
    v.currentTime = toSeconds(t);
    if (play) v.play().catch(() => {});
  };

  const playChapter = () => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().catch(() => {});
  };

  const go = (k: number) => {
    const v = ref.current;
    const playing = !!v && !v.paused;
    setI(k);
    if (chapters) keepPlaying.current = playing;
    else if (playing) seek(slides[k]?.time);
  };

  if (!slides.length) return <p className="text-sm text-ink/65">No summary for this unit yet.</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <nav aria-label="Summary slides" className="space-y-1 rounded-2xl border border-gold-light bg-white p-3">
        {slides.map((x, k) => (
          <button
            key={x.title}
            type="button"
            onClick={() => go(k)}
            aria-current={k === i}
            className={`flex w-full items-start gap-3 rounded-lg p-2 text-left text-sm ${k === i ? "bg-teal-100 text-teal-900" : "text-ink hover:bg-cream"}`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cream text-xs font-semibold text-ink">{k + 1}</span>
            <span className="min-w-0">
              <span className="block font-medium">{x.title}</span>
              {chapters ? (
                x.video_path && (
                  <span className="block text-xs text-ink/60">
                    Chapter {k + 1}
                    {x.length ? ` · ${x.length}` : ""}
                  </span>
                )
              ) : (
                x.time && <span className="block text-xs text-ink/60">Video {x.time}</span>
              )}
            </span>
          </button>
        ))}
      </nav>
      <div className="min-w-0 space-y-4">
        {videoPath && (
          <div className="space-y-2 rounded-2xl border border-gold-light bg-white p-3">
            {video ? (
              <video
                key={videoPath}
                ref={ref}
                src={video}
                controls
                playsInline
                preload="metadata"
                onLoadedMetadata={(e) => {
                  // Moving to the next chapter while one was playing carries on playing.
                  if (keepPlaying.current) e.currentTarget.play().catch(() => {});
                  keepPlaying.current = false;
                }}
                className="aspect-video w-full rounded-lg bg-ink"
              />
            ) : (
              <div role="status" className="flex aspect-video w-full items-center justify-center rounded-lg bg-cream text-sm text-ink/60">
                Loading the video…
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink/65">
              {chapters ? (
                <>
                  <span>
                    Chapter {i + 1} of {slides.length}
                    {s?.length ? ` · ${s.length}` : ""} · {s?.title}
                  </span>
                  <button type="button" onClick={playChapter} className="rounded-full bg-gold-100 px-2.5 py-1 font-semibold text-gold-900 hover:bg-gold-300">
                    ▶ Play chapter {i + 1}
                  </button>
                </>
              ) : (
                <span>Tap a slide&apos;s video time to jump to that part.</span>
              )}
            </div>
          </div>
        )}
        <article className="space-y-4 rounded-2xl border-t-4 border-teal-700 bg-white p-5 shadow-sm ring-1 ring-gold-light">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-900">
              Slide {i + 1} of {slides.length}
            </span>
            {!chapters && s.time && unit.video_path && (
              <button type="button" onClick={() => seek(s.time)} className="rounded-full bg-gold-100 px-2.5 py-0.5 text-xs font-semibold text-gold-900 hover:bg-gold-300">
                ▶ Watch from {s.time}
              </button>
            )}
          </div>
          <div>
            {s.term && (
              <p lang="ar" dir="rtl" className="font-serif text-3xl leading-relaxed text-teal-700">
                {s.term}
              </p>
            )}
            <h3 className="text-xl font-semibold text-ink">{s.title}</h3>
            {s.transliteration && <p className="text-sm italic text-ink/70">{s.transliteration}</p>}
          </div>
          <ul className="list-disc space-y-2 pl-5 text-base text-ink">
            {s.points.map((p) => (
              <li key={p}>
                <WithArabic text={p} />
              </li>
            ))}
          </ul>
          {s.quote && (
            <blockquote className="rounded-r-xl border-l-4 border-gold-500 bg-gold-50 px-4 py-3">
              <p className="text-base text-ink">{s.quote.text}</p>
              <cite className="mt-1 block text-xs font-semibold not-italic text-gold-900">{s.quote.src}</cite>
            </blockquote>
          )}
          {!!s.keywords?.length && (
            <div className="flex flex-wrap gap-1.5" aria-label="Key words">
              {s.keywords.map((k) => (
                <span key={k} className="rounded-full bg-teal-100 px-2.5 py-0.5 text-sm font-medium text-teal-900">
                  <WithArabic text={k} />
                </span>
              ))}
            </div>
          )}
        </article>
        <div className="flex items-center justify-between gap-2">
          <button type="button" className={btn} disabled={i === 0} onClick={() => go(i - 1)}>
            ‹ Previous
          </button>
          <span className="text-sm tabular-nums text-ink/65">
            {i + 1} / {slides.length}
          </span>
          {i < slides.length - 1 ? (
            <button type="button" className={btnPrimary} onClick={() => go(i + 1)}>
              Next ›
            </button>
          ) : (
            <button type="button" className={btnPrimary} onClick={onQuiz}>
              Take the quiz
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LessonSlidesView({ unit, onQuiz }: { unit: PupilUnit; onQuiz: () => void }) {
  const [viewing, setViewing] = useState<{ no: number; url: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (viewing?.url) URL.revokeObjectURL(viewing.url);
  }, [viewing]);

  const view = async (no: number, path: string) => {
    setError(null);
    setViewing({ no, url: null });
    const blob = await downloadDeck(path);
    if (!blob) {
      setViewing(null);
      return setError("Couldn't open those slides. Try again.");
    }
    setViewing({ no, url: URL.createObjectURL(new Blob([blob], { type: "application/pdf" })) });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/70">Look back over the slides from each lesson in this unit, then take the quiz.</p>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <ol className="overflow-hidden rounded-2xl border border-gold-light bg-white">
        {unit.lessons.map((l) => (
          <li key={l.lesson_no} className="border-t border-gold-light/70 px-4 py-3 first:border-t-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cream text-sm font-semibold tabular-nums text-ink">{l.lesson_no}</span>
              <span className="min-w-[10rem] flex-1">
                <span className="block text-sm font-semibold text-ink">{l.title}</span>
                {!!l.objectives?.length && <span className="block text-xs text-ink/65">{l.objectives[0]}</span>}
              </span>
              {l.pdf_path ? (
                <button type="button" className={viewing?.no === l.lesson_no ? btnPrimary : btn} onClick={() => view(l.lesson_no, l.pdf_path as string)}>
                  View slides
                </button>
              ) : (
                <span className="text-xs text-ink/60">Slides coming soon</span>
              )}
            </div>
            {viewing?.no === l.lesson_no && (
              <div className="mt-3">
                {viewing.url ? (
                  <iframe src={viewing.url} title={`${l.title} slides`} className="h-[70vh] w-full rounded-lg border border-gold-light" />
                ) : (
                  <p className="p-6 text-center text-sm text-ink/60">Opening…</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="flex justify-end">
        <button type="button" className={btnPrimary} onClick={onQuiz}>
          I&apos;ve revised: take the quiz
        </button>
      </div>
    </div>
  );
}

type Round = { attempt: string; questions: PupilQuestion[]; i: number; results: Record<string, AnswerResult> };

function useRound(unitId: string, mode: "quiz" | "practice") {
  const [round, setRound] = useState<Round | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const start = async (topic?: string) => {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const r = await startRound(unitId, mode, topic);
      setRound({ attempt: r.attempt, questions: r.questions, i: 0, results: {} });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start.");
    } finally {
      setBusy(false);
    }
  };
  const answer = async (q: PupilQuestion, choice: number, hint: boolean) => {
    if (!round) throw new Error("No round");
    const res = await answerQuestion(round.attempt, q.id, choice, hint);
    setRound((r) => (r ? { ...r, results: { ...r.results, [q.id]: res } } : r));
    return res;
  };
  const next = async () => {
    if (!round) return;
    if (round.i + 1 < round.questions.length) return setRound({ ...round, i: round.i + 1 });
    try {
      await finishRound(round.attempt);
    } catch {
      /* the answers are already saved; finishing only stamps the time */
    }
    setDone(true);
  };
  return { round, busy, error, done, start, answer, next, reset: () => (setRound(null), setDone(false)) };
}

function Progress({ round }: { round: Round }) {
  return (
    <div className="flex gap-1" aria-hidden="true">
      {round.questions.map((q, k) => {
        const r = round.results[q.id];
        return <span key={q.id} className={`h-1.5 flex-1 rounded-full ${r ? (r.correct ? "bg-teal-700" : "bg-red-500") : k === round.i ? "bg-gold-300" : "bg-cream"}`} />;
      })}
    </div>
  );
}

function QuizView({ unit, onDone, onPractice }: { unit: PupilUnit; onDone: () => void; onPractice: (topic: string) => void }) {
  const { round, busy, error, done, start, answer, next, reset } = useRound(unit.id, "quiz");

  const byTopic = useMemo(() => {
    const m = new Map<string, { right: number; total: number }>();
    round?.questions.forEach((q) => {
      const r = round.results[q.id];
      if (!r) return;
      const t = m.get(q.topic) || { right: 0, total: 0 };
      t.total++;
      if (r.correct) t.right++;
      m.set(q.topic, t);
    });
    return m;
  }, [round]);

  useEffect(() => {
    if (done) onDone();
  }, [done, onDone]);

  if (!round)
    return (
      <div className="space-y-3 rounded-2xl border border-gold-light bg-white p-5">
        <h3 className="text-lg font-semibold text-ink">Unit quiz</h3>
        <p className="text-sm text-ink/70">
          Questions from every part of the unit. You&apos;ll see straight away whether you were right and why. At the end you get a score for each topic and the ones to practise.
        </p>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <button type="button" className={btnPrimary} onClick={() => start()} disabled={busy}>
          {busy ? "Starting…" : "Start the quiz"}
        </button>
      </div>
    );

  if (done) {
    const answered = Object.values(round.results);
    const right = answered.filter((r) => r.correct).length;
    const p = pct(right, round.questions.length);
    const b = band(p);
    const weak = [...byTopic.entries()].filter(([, v]) => v.right < v.total).sort((a, z) => a[1].right / a[1].total - z[1].right / z[1].total);
    return (
      <div className="space-y-4 rounded-2xl border border-gold-light bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xl font-semibold text-ink">
            You scored <span className="tabular-nums">{right}/{round.questions.length}</span> ({p}%)
          </h3>
          <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${TONE[b.tone].chip}`}>{b.label}</span>
        </div>
        <ul className="divide-y divide-gold-light/70">
          {[...byTopic.entries()].map(([topic, v]) => {
            const tp = pct(v.right, v.total);
            return (
              <li key={topic} className="grid grid-cols-[minmax(0,1fr)_7rem_3rem] items-center gap-3 py-2 text-sm">
                <span className="text-ink">{topic}</span>
                <span className="h-2 overflow-hidden rounded-full bg-cream" aria-hidden="true">
                  <span className={`block h-full rounded-full ${v.right === v.total ? "bg-green-600" : "bg-red-500"}`} style={{ width: `${tp}%` }} />
                </span>
                <span className="text-right tabular-nums text-ink/70">
                  {v.right}/{v.total}
                </span>
              </li>
            );
          })}
        </ul>
        {weak.length ? (
          <>
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <strong className="block">Focus on</strong>
              {weak.map(([t]) => t).join(" · ")}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} onClick={() => onPractice(weak[0][0])}>
                Practise “{weak[0][0]}”
              </button>
              <button type="button" className={btn} onClick={reset}>
                Retake the quiz
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-900">
              <strong className="block">Excellent, ma sha Allah.</strong>
              Every topic correct. Keep it fresh with the practice coach over the next few days.
            </p>
            <button type="button" className={btn} onClick={reset}>
              Retake the quiz
            </button>
          </>
        )}
      </div>
    );
  }

  const q = round.questions[round.i];
  return (
    <div className="space-y-4 rounded-2xl border border-gold-light bg-white p-5">
      <Progress round={round} />
      <div className="flex flex-wrap justify-between gap-2 text-xs text-ink/60">
        <span className="tabular-nums">
          Question {round.i + 1} of {round.questions.length}
        </span>
        <span>{q.topic}</span>
      </div>
      <QuestionCard
        key={q.id}
        q={q}
        onAnswer={(c, h) => answer(q, c, h)}
        footer={() => (
          <button type="button" className={btnPrimary} onClick={next} autoFocus>
            {round.i + 1 < round.questions.length ? "Next question" : "See my results"}
          </button>
        )}
      />
    </div>
  );
}

function PracticeView({ unit, initialTopic, onChange }: { unit: PupilUnit; initialTopic: string | null; onChange: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const suggested = useMemo(() => {
    const due = unit.topics.find((t) => t.level >= 3 && t.next_review_on && t.next_review_on <= today);
    if (due) return due.topic;
    return [...unit.topics].sort((a, b) => a.level - b.level || a.first - b.first)[0]?.topic || null;
  }, [unit.topics, today]);
  const [topic, setTopic] = useState<string | null>(initialTopic || suggested);
  const { round, busy, error, done, start, answer, next, reset } = useRound(unit.id, "practice");
  const [levels, setLevels] = useState<Record<string, number>>({});

  useEffect(() => {
    if (done) onChange();
  }, [done, onChange]);

  const level = (t: string) => levels[t] ?? unit.topics.find((x) => x.topic === t)?.level ?? 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-4 rounded-2xl border border-gold-light bg-white p-5">
        {!round && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-ink">{topic ? `Practise: ${topic}` : "Choose a topic"}</h3>
            <p className="text-sm text-ink/70">
              Short rounds on one topic. Questions you&apos;ve got wrong before come first. Stuck? Ask for a hint, then have another go.
            </p>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}
            <button type="button" className={btnPrimary} disabled={!topic || busy} onClick={() => topic && start(topic)}>
              {busy ? "Starting…" : "Start practising"}
            </button>
          </div>
        )}
        {round && !done && (
          <>
            <Progress round={round} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-900">{topic}</span>
              <MasteryDots level={topic ? level(topic) : 0} label={topic || undefined} />
            </div>
            <QuestionCard
              key={round.questions[round.i].id}
              q={round.questions[round.i]}
              allowHint
              onAnswer={async (c, h) => {
                const res = await answer(round.questions[round.i], c, h);
                if (topic) setLevels((l) => ({ ...l, [topic]: res.level }));
                return res;
              }}
              footer={() => (
                <button type="button" className={btnPrimary} onClick={next} autoFocus>
                  {round.i + 1 < round.questions.length ? "Next question" : "Finish this round"}
                </button>
              )}
            />
          </>
        )}
        {round && done && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-ink">
              Round done: {Object.values(round.results).filter((r) => r.correct).length} of {round.questions.length} right
            </h3>
            <p className="flex items-center gap-2 text-sm text-ink/75">
              {topic}: <MasteryDots level={topic ? level(topic) : 0} />
              {topic && level(topic) >= 3 ? "Mastered! It will come back for a quick review in a few days." : "Come back tomorrow to move up another step."}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} onClick={() => topic && start(topic)}>
                Another round
              </button>
              <button type="button" className={btn} onClick={reset}>
                Choose another topic
              </button>
            </div>
          </div>
        )}
      </div>
      <aside className="space-y-2 rounded-2xl border border-gold-light bg-white p-4" aria-label="Your topics">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/55">Your topics</h3>
        <ul className="space-y-1">
          {unit.topics.map((t) => {
            const lv = level(t.topic);
            const due = lv >= 3 && t.next_review_on && t.next_review_on <= today;
            return (
              <li key={t.topic}>
                <button
                  type="button"
                  disabled={!!round && !done}
                  onClick={() => {
                    setTopic(t.topic);
                    reset();
                  }}
                  aria-pressed={topic === t.topic}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm ${topic === t.topic ? "bg-teal-100 text-teal-900" : "text-ink hover:bg-cream"} disabled:opacity-60`}
                >
                  <span className="min-w-0">
                    {t.topic}
                    {due && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs text-amber-900">review</span>}
                  </span>
                  <MasteryDots level={lv} label={t.topic} />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="pt-2 text-xs text-ink/60">
          A topic moves up one step on each day you get it right without a hint. Three steps means mastered; it then comes back for review after 3 days, then a week.
        </p>
      </aside>
    </div>
  );
}
