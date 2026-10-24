"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { getEdgeFunctionUrl } from "@/lib/supabase/client";

/*
 * The child's side of the TGA entry assessment, opened from a one-time link
 * (/assessment/?t=…). No account needed. The paper and its answers stay on the
 * server: this page only ever receives the current part's questions, saves each
 * answer as it is given, and asks the server how much time is left, so
 * reloading the page or changing the clock changes nothing.
 */

type PublicItem = {
  id: string; strand: string; type: "mcq" | "numeric" | "text"; stem: string; svg?: string; choiceSvgs?: string[]; choices?: string[];
  say?: string; passageId?: string; unit?: string;
};
type Current = {
  key: string; title: string; intro: string; minutes: number; started: boolean; remaining: number;
  passages: { id: string; title: string; text: string }[]; writingPrompt?: { title: string; prompt: string };
  items: PublicItem[]; answers: Record<string, unknown>;
};
type State = {
  ok: boolean; error?: string; firstName: string; year: number; status: string; readAloud: boolean; largeText: boolean; finished: boolean;
  sections: { key: string; title: string; minutes: number; questions: number; done: boolean }[]; current?: Current;
};

async function call(body: Record<string, unknown>): Promise<State & { error?: string }> {
  const url = getEdgeFunctionUrl("entry-assessment");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, error: "not_configured" } as State;
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
    return (await res.json()) as State;
  } catch {
    return { ok: false, error: "network" } as State;
  }
}

function speak(text: string) {
  try {
    const s = window.speechSynthesis;
    if (!s) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    u.rate = 0.85;
    const v = s.getVoices().find((x) => x.lang === "en-GB") || s.getVoices().find((x) => x.lang.startsWith("en"));
    if (v) u.voice = v;
    s.speak(u);
  } catch {
    /* speech not available on this device */
  }
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

const ERRORS: Record<string, string> = {
  not_found: "This link isn't valid. Please check you have the whole link from the email, or ask the school for a new one.",
  expired: "This link has expired. Please ask the school for a new one.",
  void: "This assessment has been cancelled by the school. If you weren't expecting this, please get in touch.",
  network: "We couldn't reach the school's server. Check your internet connection and try again.",
  not_configured: "The assessment isn't available right now. Please try again later.",
};

export function AssessmentSitting() {
  const [token, setToken] = useState<string | null>(null);
  const [st, setSt] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [practiced, setPracticed] = useState(false);
  const [large, setLarge] = useState(false);

  const load = useCallback(async (t: string, extra: Record<string, unknown> = {}) => {
    const s = await call({ action: "state", token: t, ...extra });
    setSt(s);
    if (s.ok) setLarge((l) => l || s.largeText);
    return s;
  }, []);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the link once on arrival
    setToken(t);
    if (!t) {
      setSt({ ok: false, error: "not_found" } as State);
      return;
    }
    load(t, { device: navigator.userAgent.slice(0, 300), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  }, [load]);

  // Leaving the page during a timed part is noted (it's shown to staff, not to the child).
  useEffect(() => {
    if (!token) return;
    const on = () => call({ action: "event", token, type: document.hidden ? "hidden" : "visible" });
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [token]);

  const startSection = async () => {
    if (!token) return;
    setBusy(true);
    const s = await call({ action: "start_section", token });
    setBusy(false);
    if (s.ok) setSt(s);
  };

  if (!st) return <Shell large={large}><p className="py-20 text-center text-ink/70">Loading your assessment…</p></Shell>;
  if (!st.ok) return <Shell large={large}><Message title="We can't open this assessment" body={ERRORS[st.error || ""] || "Something went wrong. Please try again, or contact the school."} /></Shell>;

  const first = st.firstName;
  if (st.finished) {
    return (
      <Shell large={large}>
        <div className="mx-auto max-w-xl py-16 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gold-100 text-4xl" aria-hidden="true">✓</div>
          <h1 className="mt-6 text-3xl font-semibold text-ink">Well done, {first}!</h1>
          <p className="mt-3 text-lg text-ink/75">You have finished every part. Thank you for working so hard. Your teachers will look at your answers, and the school will be in touch with your family.</p>
          <p className="mt-6 text-sm text-ink/60">You can close this page now.</p>
        </div>
      </Shell>
    );
  }

  const cur = st.current!;
  const doneCount = st.sections.filter((s) => s.done).length;
  const notStartedAtAll = doneCount === 0 && !cur.started;

  if (!cur.started) {
    return (
      <Shell large={large} onLarge={() => setLarge((l) => !l)}>
        <div className="mx-auto max-w-2xl py-10">
          {notStartedAtAll ? (
            <>
              <p className="text-sm font-semibold uppercase tracking-wider text-gold-700">Entry assessment · Year {st.year}</p>
              <h1 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">Assalamu alaykum, {first}!</h1>
              <p className="mt-3 text-lg text-ink/75">This helps your teachers get to know you, so they can put you in the right groups from your very first day. It is not a test you can pass or fail. Just do your best.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold uppercase tracking-wider text-gold-700">Part {doneCount + 1} of {st.sections.length}</p>
              <h1 className="mt-2 text-3xl font-semibold text-ink">Great work so far, {first}.</h1>
              <p className="mt-3 text-lg text-ink/75">Take a break if you need one: have a drink, stretch, then start the next part when you&apos;re ready. The clock only runs during a part.</p>
            </>
          )}

          <ol className="mt-8 space-y-2">
            {st.sections.map((s, i) => (
              <li key={s.key} className={`flex items-center justify-between rounded-2xl border px-5 py-4 ${s.key === cur.key ? "border-gold-500 bg-white shadow-sm" : "border-gold-light/70 bg-white/60"}`}>
                <span className="flex items-center gap-3">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${s.done ? "bg-green-100 text-green-800" : s.key === cur.key ? "bg-gold-700 text-white" : "bg-cream text-ink/60"}`}>{s.done ? "✓" : i + 1}</span>
                  <span className="font-medium text-ink">{s.title}</span>
                </span>
                <span className="text-sm text-ink/65">{s.questions} {s.questions === 1 ? "task" : "questions"} · {s.minutes} min</span>
              </li>
            ))}
          </ol>

          {notStartedAtAll && (
            <div className="mt-8 rounded-2xl border border-gold-light bg-white p-5">
              <h2 className="font-semibold text-ink">Before you start</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-ink/80">
                <li>Sit somewhere quiet, with {st.readAloud ? "the sound turned on (some questions are read out loud)" : "nothing else open on your device"}.</li>
                <li>{st.year <= 2 ? "A grown-up can help you use the mouse or screen, but not with the answers." : "Work on your own. You may use paper for working out, but not a calculator."}</li>
                <li>If a question is too hard, choose your best answer and move on. Some questions are meant for older children.</li>
                <li>Your answers save as you go. If the internet drops, just open the link again.</li>
              </ul>
              {!practiced && <Practice onDone={() => setPracticed(true)} readAloud={st.readAloud} />}
            </div>
          )}

          <div className="mt-8 rounded-2xl bg-ink-900 p-6 text-white">
            <p className="text-sm text-gold-300">Next: {cur.title}</p>
            <p className="mt-1 text-lg">{cur.intro}</p>
            <p className="mt-2 text-sm text-white/70">{(() => { const n = cur.items.length || st.sections.find((s) => s.key === cur.key)?.questions || 0; return `${n} ${n === 1 ? "task" : "questions"}`; })()} · {cur.minutes} minutes. The clock starts when you press the button.</p>
            <button type="button" onClick={startSection} disabled={busy || (notStartedAtAll && !practiced)} className="mt-5 w-full rounded-full bg-gold-500 px-6 py-4 text-lg font-semibold text-ink-900 hover:brightness-95 disabled:opacity-50 sm:w-auto">
              {busy ? "Starting…" : notStartedAtAll && !practiced ? "Try the practice question first" : `Start ${cur.title}`}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return <Section key={cur.key} token={token!} st={st} cur={cur} large={large} onLarge={() => setLarge((l) => !l)} onState={setSt} reload={() => load(token!)} />;
}

function Practice({ onDone, readAloud }: { onDone: () => void; readAloud: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  const q = "Which of these is a fruit?";
  return (
    <div className="mt-5 rounded-xl border border-dashed border-gold-light p-4">
      <p className="text-sm font-semibold text-gold-700">Practice question (it doesn&apos;t count)</p>
      <div className="mt-2 flex items-center gap-2">
        <p className="text-lg font-medium text-ink">{q}</p>
        {readAloud && <SpeakButton text={q} />}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {["chair", "apple", "shoe", "cloud"].map((c) => (
          <button key={c} type="button" onClick={() => setPicked(c)} className={`rounded-xl border-2 px-4 py-3 text-lg ${picked === c ? "border-gold-700 bg-gold-50 font-semibold" : "border-gold-light bg-white hover:border-gold-500"}`}>{c}</button>
        ))}
      </div>
      {picked && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className={picked === "apple" ? "text-green-800" : "text-ink/75"}>{picked === "apple" ? "That's right! Tap an answer, then press Next." : "Good try. In the real questions, just pick your best answer and press Next."}</p>
          <button type="button" onClick={onDone} className="rounded-full bg-gold-700 px-5 py-2 font-semibold text-white">I&apos;m ready</button>
        </div>
      )}
    </div>
  );
}

function SpeakButton({ text }: { text: string }) {
  return (
    <button type="button" onClick={() => speak(text)} aria-label="Read the question out loud" title="Read out loud" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold-light bg-white text-gold-700 hover:bg-gold-50">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></svg>
    </button>
  );
}

function Section({ token, st, cur, large, onLarge, onState, reload }: { token: string; st: State; cur: Current; large: boolean; onLarge: () => void; onState: (s: State) => void; reload: () => Promise<State> }) {
  const [i, setI] = useState(() => Math.max(0, cur.items.findIndex((it) => cur.answers[it.id] === undefined)));
  const [answers, setAnswers] = useState<Record<string, unknown>>(cur.answers);
  const [left, setLeft] = useState(cur.remaining);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirming, setConfirming] = useState(false);
  const [showPassage, setShowPassage] = useState(true);
  const shownAt = useRef(0);
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const item = cur.items[i];
  const passage = useMemo(() => cur.passages.find((p) => p.id === item?.passageId), [cur.passages, item]);

  useEffect(() => {
    shownAt.current = Date.now();
    if (st.readAloud && item?.say) speak(item.say);
  }, [i, item, st.readAloud]);

  // Count down locally; when time is up, the server closes the part.
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left === 0) reload().then((s) => s.ok && onState(s));
  }, [left, reload, onState]);

  const save = useCallback(async (itemId: string, value: unknown) => {
    setSaving("saving");
    const r = await call({ action: "answer", token, itemId, value, ms: Date.now() - shownAt.current });
    setSaving(r.ok ? "saved" : "error");
    if (!r.ok && (r.error === "wrong_section" || r.error === "not_started")) reload().then((s) => s.ok && onState(s));
  }, [token, reload, onState]);

  const answer = (value: unknown, debounce = false) => {
    if (!item) return;
    setAnswers((a) => ({ ...a, [item.id]: value }));
    if (textTimer.current) clearTimeout(textTimer.current);
    if (debounce) textTimer.current = setTimeout(() => save(item.id, value), 1200);
    else save(item.id, value);
  };

  const submit = async () => {
    if (textTimer.current && item) {
      clearTimeout(textTimer.current);
      await save(item.id, answers[item.id] ?? "");
    }
    const s = await call({ action: "submit_section", token });
    if (s.ok) onState(s);
  };

  const unanswered = cur.items.filter((it) => answers[it.id] === undefined || answers[it.id] === "").length;
  const warn = left <= 60 ? "bg-red-600 text-white" : left <= 180 ? "bg-amber-100 text-amber-900" : "bg-white text-ink";

  return (
    <Shell large={large} onLarge={onLarge} wide>
      <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-gold-light bg-cream/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">{cur.title}</p>
            <p className="text-sm text-ink/70">{cur.items.length === 1 ? "One task" : `Question ${i + 1} of ${cur.items.length}`}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink/55" aria-live="polite">{saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : saving === "error" ? "Not saved, retrying when you answer again" : ""}</span>
            <span className={`rounded-full px-4 py-1.5 font-mono text-lg font-semibold tabular-nums ring-1 ring-gold-light ${warn}`} role="timer" aria-label={`${Math.ceil(left / 60)} minutes left`}>{mmss(Math.max(0, left))}</span>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1" aria-label="Jump to a question">
          {cur.items.map((it, k) => (
            <button key={it.id} type="button" onClick={() => setI(k)} aria-label={`Question ${k + 1}${answers[it.id] !== undefined && answers[it.id] !== "" ? ", answered" : ""}`} className={`h-3.5 w-3.5 rounded-full ${k === i ? "ring-2 ring-gold-700 ring-offset-1" : ""} ${answers[it.id] !== undefined && answers[it.id] !== "" ? "bg-gold-700" : "bg-gold-light"}`} />
          ))}
        </div>
      </div>

      <div className={`grid gap-6 ${passage ? "lg:grid-cols-2" : ""}`}>
        {passage && (
          <article className="order-last rounded-2xl border border-gold-light bg-white p-5 lg:order-none lg:sticky lg:top-28 lg:max-h-[70vh] lg:overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-ink">{passage.title}</h2>
              <div className="flex gap-2">
                {st.readAloud && <SpeakButton text={`${passage.title}. ${passage.text}`} />}
                <button type="button" className="text-sm font-medium text-gold-700 underline lg:hidden" onClick={() => setShowPassage((v) => !v)}>{showPassage ? "Hide" : "Show"} the text</button>
              </div>
            </div>
            {showPassage && <div className="mt-3 space-y-3 leading-relaxed text-ink/90">{passage.text.split(/\n\n+/).map((p, k) => <p key={k}>{p}</p>)}</div>}
          </article>
        )}

        {item && (
          <div className="rounded-2xl border border-gold-light bg-white p-5 sm:p-7">
            <div className="flex items-start gap-3">
              <h1 className="flex-1 whitespace-pre-line text-xl font-semibold leading-snug text-ink sm:text-2xl">{item.stem}</h1>
              {(st.readAloud || item.say) && <SpeakButton text={item.say || item.stem} />}
            </div>
            {item.svg && <div className="mt-4 overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: item.svg }} />}

            {item.type === "mcq" && item.choiceSvgs && (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                {item.choiceSvgs.map((svg, k) => {
                  const label = item.choices?.[k] || String(k);
                  const on = answers[item.id] === label;
                  return (
                    <button key={label} type="button" onClick={() => answer(label)} aria-pressed={on} aria-label={`Option ${label}`} className={`flex flex-col items-center rounded-2xl border-2 p-2 ${on ? "border-gold-700 bg-gold-50" : "border-gold-light bg-white hover:border-gold-500"}`}>
                      <span className="[&_svg]:h-20 [&_svg]:w-20" dangerouslySetInnerHTML={{ __html: svg }} />
                      <span className="mt-1 text-sm font-semibold text-ink/70">{label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {item.type === "mcq" && !item.choiceSvgs && (
              <div className={`mt-5 grid gap-3 ${(item.choices || []).every((c) => c.length < 24) ? "sm:grid-cols-2" : ""}`}>
                {(item.choices || []).map((c) => {
                  const on = answers[item.id] === c;
                  return (
                    <button key={c} type="button" onClick={() => answer(c)} aria-pressed={on} className={`rounded-2xl border-2 px-5 py-4 text-left text-lg ${on ? "border-gold-700 bg-gold-50 font-semibold" : "border-gold-light bg-white hover:border-gold-500"}`}>
                      {c}
                    </button>
                  );
                })}
              </div>
            )}
            {item.type === "numeric" && (
              <label className="mt-5 flex items-center gap-3">
                <span className="sr-only">Your answer</span>
                {item.unit === "£" && <span className="text-2xl text-ink/70">£</span>}
                <input inputMode="decimal" autoComplete="off" value={String(answers[item.id] ?? "")} onChange={(e) => answer(e.target.value, true)} onBlur={(e) => answer(e.target.value)} className="w-48 rounded-xl border-2 border-gold-light px-4 py-3 text-2xl tabular-nums focus:border-gold-700" placeholder="Answer" />
                {item.unit && item.unit !== "£" && <span className="text-xl text-ink/70">{item.unit}</span>}
              </label>
            )}
            {item.type === "text" && (
              <div className="mt-4">
                {cur.writingPrompt && <p className="mb-2 text-sm text-ink/65">Plan for a few minutes first. Check your spelling and punctuation at the end.</p>}
                <textarea value={String(answers[item.id] ?? "")} onChange={(e) => answer(e.target.value, true)} onPaste={() => call({ action: "event", token, type: "paste" })} rows={14} spellCheck={false} autoCorrect="off" autoCapitalize="sentences" className="w-full rounded-xl border-2 border-gold-light p-4 text-lg leading-relaxed focus:border-gold-700" placeholder="Write your answer here…" />
                <p className="mt-1 text-right text-sm text-ink/60">{String(answers[item.id] ?? "").trim().split(/\s+/).filter(Boolean).length} words</p>
              </div>
            )}

            <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => setI((k) => Math.max(0, k - 1))} disabled={i === 0} className="rounded-full border border-gold-light bg-white px-5 py-3 font-medium text-ink disabled:opacity-40">← Back</button>
              {i < cur.items.length - 1 ? (
                <button type="button" onClick={() => setI((k) => k + 1)} className="rounded-full bg-gold-700 px-7 py-3 text-lg font-semibold text-white hover:bg-gold-900">Next →</button>
              ) : (
                <button type="button" onClick={() => setConfirming(true)} className="rounded-full bg-ink-900 px-7 py-3 text-lg font-semibold text-white">Finish {cur.title}</button>
              )}
            </div>
          </div>
        )}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="finish-title">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h2 id="finish-title" className="text-xl font-semibold text-ink">Finish {cur.title}?</h2>
            <p className="mt-2 text-ink/75">{unanswered ? `You haven’t answered ${unanswered} question${unanswered === 1 ? "" : "s"}. You can go back and have a try, or finish now.` : "You’ve answered every question."} Once you finish, you can&apos;t come back to this part.</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="rounded-full border border-gold-light px-5 py-2.5 font-medium">Go back</button>
              <button type="button" onClick={submit} className="rounded-full bg-gold-700 px-5 py-2.5 font-semibold text-white">Finish</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, large, onLarge, wide }: { children: React.ReactNode; large: boolean; onLarge?: () => void; wide?: boolean }) {
  return (
    <div className={`min-h-screen bg-cream ${large ? "text-[1.15rem] [&_.text-lg]:text-xl [&_.text-xl]:text-2xl" : ""}`}>
      <header className="border-b border-gold-light bg-white">
        <div className={`mx-auto flex h-16 items-center justify-between px-4 sm:px-6 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
          <Image src="/brand/ga-wordmark.png" alt="Tarbiyyah Global Academy" width={130} height={40} priority />
          {onLarge && (
            <button type="button" onClick={onLarge} aria-pressed={large} className="rounded-full border border-gold-light px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream">
              <span aria-hidden="true" className="font-serif font-bold">Aa</span> {large ? "Normal text" : "Bigger text"}
            </button>
          )}
        </div>
      </header>
      <main className={`mx-auto px-4 pb-16 sm:px-6 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>{children}</main>
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-3 text-ink/75">{body}</p>
      <p className="mt-6 text-sm text-ink/60">globalacademy@tarbiyyah.co.uk · 020 3719 8697</p>
    </div>
  );
}
