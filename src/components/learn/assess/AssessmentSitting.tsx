"use client";

import { Loading } from "@/components/learn/kit";
import { Icon } from "@/components/learn/Icon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { getEdgeFunctionUrl } from "@/lib/supabase/client";
import { MathText, mathPlain } from "@/components/learn/assess/MathText";
import { itemSpeech, passageSpeech } from "@/components/learn/assess/mathSpeech";
import { isSpeechAvailable, loadVoices, speak, stopSpeaking } from "@/components/learn/assess/speech";

/*
 * The child's side of the TGA entry assessment, opened from a one-time link
 * (/assessment/?t=…). No account needed. The paper and its answers stay on the
 * server: this page only ever receives the current part's questions, saves each
 * answer as it is given, and asks the server how much time is left, so
 * reloading the page or changing the clock changes nothing.
 *
 * Fair-sitting measures (all noted for staff): full screen, copy/paste/
 * right-click and shortcuts blocked on the questions, one window at a time.
 * A browser can't stop a child switching tab or window, so leaving is made
 * visible instead: the questions are covered the moment the page loses
 * focus, and the child must press "Return to my assessment" (which puts
 * full screen back) to carry on. Each time is counted on screen; the
 * hidden/blur events are already logged and counted in the staff report. Breaks are
 * allowed: the clock pauses and the questions are hidden until the child
 * carries on.
 */

type PublicItem = {
  id: string; strand: string; type: "mcq" | "numeric" | "text"; stem: string; svg?: string; choiceSvgs?: string[]; choices?: string[];
  say?: string; passageId?: string; unit?: string; speakChoices?: boolean; speakPunctuation?: boolean;
};
type Current = {
  key: string; title: string; intro: string; minutes: number; started: boolean; remaining: number; questions: number;
  breaksLeft: number; onBreak: { startedAt: string; allowedSec: number; leftSec: number } | null;
  passages: { id: string; title: string; text: string }[]; writingPrompt?: { title: string; prompt: string };
  items: PublicItem[]; answers: Record<string, unknown>;
};
type State = {
  ok: boolean; error?: string; session?: string; firstName: string; year: number; status: string; readAloud: boolean; autoRead: boolean; largeText: boolean;
  breakRules?: { perSection: number; minutes: number }; finished: boolean;
  /** Staff setting: the part ends once it has been left this many times. */
  leaveLimit?: number | null; lastEndedForLeaving?: string | null;
  sections: { key: string; title: string; minutes: number; questions: number; done: boolean }[]; current?: Current;
};
type Light = { ok: boolean; error?: string; finished?: boolean; section?: string | null; started?: boolean; remaining?: number | null; onBreak?: boolean };
type Api = <T = State>(body: Record<string, unknown>) => Promise<T & { ok: boolean; error?: string }>;

async function post<T>(body: Record<string, unknown>): Promise<T & { ok: boolean; error?: string }> {
  const url = getEdgeFunctionUrl("entry-assessment");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, error: "not_configured" } as unknown as T & { ok: boolean };
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
    return (await res.json()) as T & { ok: boolean };
  } catch {
    return { ok: false, error: "network" } as unknown as T & { ok: boolean };
  }
}

const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
const LETTERS = "ABCDEFGH";
const sessionKey = (t: string) => `tga-ea-window:${t.slice(0, 16)}`;
const readStore = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const writeStore = (k: string, v: string | null) => { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch { /* private mode */ } };

const ERRORS: Record<string, string> = {
  not_found: "This link isn't valid. Please check you have the whole link from the email, or ask the school for a new one.",
  expired: "This link has expired. Please ask the school for a new one.",
  void: "This assessment has been cancelled by the school. If you weren't expecting this, please get in touch.",
  network: "We couldn't reach the school's server. Check your internet connection and try again.",
  not_configured: "The assessment isn't available right now. Please try again later.",
};

// ── full screen ──
type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };
function enterFullscreen(): boolean {
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) { el.requestFullscreen().catch(() => {}); return true; }
    if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); return true; }
  } catch { /* not allowed here */ }
  return false;
}
const inFullscreen = () => !!(document.fullscreenElement || (document as FsDoc).webkitFullscreenElement);
function leaveFullscreen() {
  try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else (document as FsDoc).webkitExitFullscreen?.(); } catch { /* fine */ }
}

// ── read aloud ──
function useVoice() {
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const available = useMemo(() => (typeof window === "undefined" ? false : isSpeechAvailable()), []);
  useEffect(() => { loadVoices(); }, []);
  const stop = useCallback(() => { stopSpeaking(); setSpeakingKey(null); }, []);
  const play = useCallback((key: string, parts: string[], rate?: number) => {
    setSpeakingKey(key);
    speak(parts, { rate, onEnd: () => setSpeakingKey((k) => (k === key ? null : k)) }).then((ok) => { if (!ok) setSpeakingKey(null); });
  }, []);
  const toggle = useCallback((key: string, parts: string[], rate?: number) => {
    if (speakingKey === key) stop();
    else play(key, parts, rate);
  }, [speakingKey, play, stop]);
  // Never keep talking after the page is hidden or closed.
  useEffect(() => {
    const off = () => { if (document.hidden) stop(); };
    const bye = () => stopSpeaking();
    document.addEventListener("visibilitychange", off);
    window.addEventListener("pagehide", bye);
    window.addEventListener("beforeunload", bye);
    return () => { document.removeEventListener("visibilitychange", off); window.removeEventListener("pagehide", bye); window.removeEventListener("beforeunload", bye); stopSpeaking(); };
  }, [stop]);
  return { available, speakingKey, play, toggle, stop };
}
type Voice = ReturnType<typeof useVoice>;

export function AssessmentSitting() {
  const [token, setToken] = useState<string | null>(null);
  const [st, setSt] = useState<State | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [practiced, setPracticed] = useState(false);
  const [large, setLarge] = useState(false);
  const [restBetween, setRestBetween] = useState(false);
  const session = useRef<string | null>(null);
  const fsTried = useRef(false);
  const [positions, setPositions] = useState<Record<string, number>>({});
  const voice = useVoice();
  const rate = st && st.year <= 2 ? 0.9 : 0.95;

  const api: Api = useCallback(async <T,>(body: Record<string, unknown>) => {
    const r = await post<T>({ ...body, token, session: session.current });
    if (!r.ok && r.error === "other_session") setConflict(true);
    return r;
  }, [token]);

  const load = useCallback(async (t: string, extra: Record<string, unknown> = {}) => {
    const s = await post<State>({ action: "state", token: t, session: session.current, ...extra });
    if (!s.ok && s.error === "other_session") { setConflict(true); setSt((old) => old || ({ ok: true, firstName: (s as { firstName?: string }).firstName || "" } as State)); return s; }
    if (s.ok && s.session) { session.current = s.session; writeStore(sessionKey(t), s.session); }
    setConflict(false);
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
    session.current = readStore(sessionKey(t));
    // A duplicated browser tab copies this window's token: the copy must take over properly instead.
    let bc: BroadcastChannel | null = null;
    const me = Math.random().toString(36).slice(2);
    try {
      bc = new BroadcastChannel(`tga-ea:${t.slice(0, 16)}`);
      bc.onmessage = (e) => {
        const d = e.data as { kind: string; from: string; to?: string; session?: string | null };
        if (d.kind === "hello" && d.from !== me && d.session && d.session === session.current) bc?.postMessage({ kind: "taken", from: me, to: d.from });
        if (d.kind === "taken" && d.to === me) { session.current = null; writeStore(sessionKey(t), null); setConflict(true); }
      };
      bc.postMessage({ kind: "hello", from: me, session: session.current });
    } catch { /* older browsers: the server still allows one window only */ }
    const timer = setTimeout(() => load(t, { device: navigator.userAgent.slice(0, 300), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }), 300);
    return () => { clearTimeout(timer); bc?.close(); };
  }, [load]);

  // Leave full screen once everything is finished.
  const finished = !!st?.finished;
  useEffect(() => {
    if (finished && inFullscreen()) leaveFullscreen();
  }, [finished]);

  const startSection = async () => {
    if (!token) return;
    setBusy(true);
    voice.stop();
    // Full screen needs the button press itself, so ask before waiting for the server.
    if (!inFullscreen()) {
      const ok = enterFullscreen();
      if (!ok && !fsTried.current) api({ action: "event", type: "fullscreen_unavailable" });
    }
    fsTried.current = true;
    const s = await api({ action: "start_section" });
    setBusy(false);
    if (s.ok) setSt(s);
  };

  const shell = (children: React.ReactNode, wide = false) => <Shell large={large} onLarge={() => setLarge((l) => !l)} wide={wide}>{children}</Shell>;

  if (!st) return shell(<Loading label="Loading your assessment…" bare />);
  if (conflict) {
    return shell(
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-2xl font-semibold text-ink">This assessment is open in another window</h1>
        <p className="mt-3 text-lg text-ink/75">It can only be used in one window at a time. If you have closed the other window, or want to carry on here instead, press the button.</p>
        <button type="button" onClick={() => token && load(token, { takeover: true, device: navigator.userAgent.slice(0, 300) })} className="mt-6 rounded-full bg-gold-700 px-7 py-3 text-lg font-semibold text-white hover:bg-gold-900">Use this window instead</button>
        <p className="mt-6 text-sm text-ink/60">Your answers so far are saved.</p>
      </div>,
    );
  }
  if (!st.ok) return shell(<Message title="We can't open this assessment" body={ERRORS[st.error || ""] || "Something went wrong. Please try again, or contact the school."} />);

  const first = st.firstName;
  if (st.finished) {
    return shell(
      <div className="mx-auto max-w-xl py-16 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gold-100 text-gold-900" aria-hidden="true"><Icon name="check" className="h-10 w-10" strokeWidth={2.25} /></div>
        <h1 className="mt-6 text-3xl font-semibold text-ink">Well done, {first}!</h1>
        <p className="mt-3 text-lg text-ink/75">You have finished every part. Thank you for working so hard. Your teachers will look at your answers, and the school will be in touch with your family.</p>
        <p className="mt-6 text-sm text-ink/60">You can close this page now.</p>
      </div>,
    );
  }

  const cur = st.current!;
  const doneCount = st.sections.filter((s) => s.done).length;
  const notStartedAtAll = doneCount === 0 && !cur.started;
  const young = st.year <= 2;

  // A break during a timed part: nothing of the test is on screen, and the clock is paused.
  if (cur.started && cur.onBreak) {
    return shell(
      <BreakScreen
        key={cur.onBreak.startedAt}
        seconds={cur.onBreak.leftSec}
        timed
        young={young}
        onDone={async () => { const s = await api({ action: "break_end" }); if (s.ok) setSt(s); else if (token) load(token); }}
      />,
    );
  }

  if (!cur.started) {
    if (restBetween) return shell(<BreakScreen seconds={(st.breakRules?.minutes ?? 3) * 60} young={young} onDone={() => setRestBetween(false)} />);
    const intro = `Next: ${cur.title}. ${cur.intro}`;
    return shell(
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
            <p className="mt-3 text-lg text-ink/75">Have a rest before the next part if you like. The clock only runs during a part.</p>
            {st.lastEndedForLeaving && (
              <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-ink">
                {st.lastEndedForLeaving} ended because you left it {st.leaveLimit ? `${st.leaveLimit} times` : "too many times"}. Your answers up to then are saved. Please stay on the page during the next part.
              </p>
            )}
          </>
        )}

        <ol className="mt-8 space-y-2">
          {st.sections.map((s, i) => (
            <li key={s.key} className={`flex items-center justify-between rounded-2xl border px-5 py-4 ${s.key === cur.key ? "border-gold-500 bg-white shadow-sm" : "border-gold-light/70 bg-white/60"}`}>
              <span className="flex items-center gap-3">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${s.done ? "bg-green-100 text-green-800" : s.key === cur.key ? "bg-gold-700 text-white" : "bg-cream text-ink/60"}`}>{s.done ? <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}</span>
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
              <li>Sit somewhere quiet{st.readAloud ? ", with the sound turned on: questions can be read out loud" : ""}.</li>
              <li>{young ? "A grown-up can help you use the mouse or screen, but not with the answers." : "Work on your own. You may use paper for working out, but not a calculator."}</li>
              <li>The test fills the screen. Please stay on this page until you finish a part.{st.leaveLimit ? ` If you leave a part ${st.leaveLimit} times, that part ends.` : ""}</li>
              {(st.breakRules?.perSection ?? 0) > 0 && <li>If you need a rest during a part, press <b>Take a break</b>. The clock stops while you rest.</li>}
              <li>If a question is too hard, choose your best answer and move on. Some questions are meant for older children.</li>
              <li>Your answers save as you go. If the internet drops, just open the link again.</li>
            </ul>
            {!practiced && <Practice onDone={() => setPracticed(true)} readAloud={st.readAloud} voice={voice} young={young} rate={rate} />}
          </div>
        )}

        {!notStartedAtAll && young && (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-light bg-white p-5">
            <p className="text-lg text-ink">Time for a little rest first?</p>
            <button type="button" onClick={() => setRestBetween(true)} className="rounded-full border-2 border-gold-500 bg-white px-6 py-3 text-lg font-semibold text-ink hover:bg-gold-50">Take a break first</button>
          </div>
        )}

        <div className="mt-8 rounded-2xl bg-ink-900 p-6 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-gold-300">Next: {cur.title}</p>
              <p className="mt-1 text-lg">{cur.intro}</p>
            </div>
            {st.readAloud && voice.available && <SpeakButton on={voice.speakingKey === "intro"} onClick={() => voice.toggle("intro", [intro], rate)} label="Read this out loud" dark />}
          </div>
          <p className="mt-2 text-sm text-white/70">{cur.questions ?? cur.items.length} {cur.questions === 1 ? "task" : "questions"} · {cur.minutes} minutes. The clock starts when you press the button.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={startSection} disabled={busy || (notStartedAtAll && !practiced)} className="w-full rounded-full bg-gold-500 px-6 py-4 text-lg font-semibold text-ink-900 hover:brightness-95 disabled:opacity-50 sm:w-auto">
              {busy ? "Starting…" : notStartedAtAll && !practiced ? "Try the practice question first" : `Start ${cur.title}`}
            </button>
            {!notStartedAtAll && !young && <button type="button" onClick={() => setRestBetween(true)} className="rounded-full border border-white/30 px-5 py-3 font-medium text-white hover:bg-white/10">Take a break first</button>}
          </div>
        </div>
      </div>,
    );
  }

  return (
    <Section
      key={cur.key}
      api={api}
      st={st}
      cur={cur}
      large={large}
      voice={voice}
      rate={rate}
      start={positions[cur.key]}
      onPosition={(k) => setPositions((p) => (p[cur.key] === k ? p : { ...p, [cur.key]: k }))}
      onLarge={() => setLarge((l) => !l)}
      onState={setSt}
      reload={() => (token ? load(token) : Promise.resolve(st))}
    />
  );
}

function Practice({ onDone, readAloud, voice, young, rate }: { onDone: () => void; readAloud: boolean; voice: Voice; young: boolean; rate: number }) {
  const [picked, setPicked] = useState<string | null>(null);
  const item: PublicItem = { id: "practice", strand: "practice", type: "mcq", stem: "Which of these is a fruit?", choices: ["chair", "apple", "shoe", "cloud"] };
  return (
    <div className="mt-5 rounded-xl border border-dashed border-gold-light p-4">
      <p className="text-sm font-semibold text-gold-700">Practice question (it doesn&apos;t count)</p>
      <div className="mt-2 flex items-center gap-2">
        <p className="flex-1 text-lg font-medium text-ink">{item.stem}</p>
        {readAloud && voice.available && <SpeakButton on={voice.speakingKey === "practice"} onClick={() => voice.toggle("practice", itemSpeech(item), rate)} />}
      </div>
      <Options item={item} value={picked} young={young} onPick={(c) => setPicked(c)} />
      {picked && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className={picked === "apple" ? "text-green-800" : "text-ink/75"}>{picked === "apple" ? "That's right! Tap an answer, then press Next." : "Good try. In the real questions, just pick your best answer and press Next."}</p>
          <button type="button" onClick={() => { voice.stop(); onDone(); }} className="rounded-full bg-gold-700 px-5 py-2 font-semibold text-white">I&apos;m ready</button>
        </div>
      )}
    </div>
  );
}

function SpeakButton({ on, onClick, label = "Read the question out loud", dark }: { on: boolean; onClick: () => void; label?: string; dark?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={on ? "Stop reading" : label} title={on ? "Stop" : "Read out loud"} className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border ${dark ? "border-white/30 bg-white/10 text-gold-300 hover:bg-white/20" : on ? "border-gold-700 bg-gold-700 text-white" : "border-gold-light bg-white text-gold-700 hover:bg-gold-50"}`}>
      {on ? (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></svg>
      )}
    </button>
  );
}

/** Lettered answer buttons, the same for every subject. Big targets for the youngest. */
function Options({ item, value, onPick, young }: { item: PublicItem; value: unknown; onPick: (v: string) => void; young: boolean }) {
  if (item.choiceSvgs) {
    return (
      <div role="radiogroup" aria-label="Answers" className={`mt-6 grid gap-3 ${young ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-5"}`}>
        {item.choiceSvgs.map((svg, k) => {
          const label = item.choices?.[k] || LETTERS[k];
          const on = value === label;
          return (
            <button key={label} type="button" role="radio" aria-checked={on} aria-label={`Option ${label}`} onClick={() => onPick(label)} className={`relative flex flex-col items-center rounded-2xl border-2 p-3 transition ${on ? "border-gold-700 bg-gold-50 ring-2 ring-gold-700/30" : "border-gold-light bg-white hover:border-gold-500"}`}>
              <span className={`absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${on ? "bg-gold-700 text-white" : "bg-cream text-ink/70"}`}>{label}</span>
              <span className={`pointer-events-none ${young ? "[&_svg]:h-28 [&_svg]:w-28" : "[&_svg]:h-20 [&_svg]:w-20"}`} dangerouslySetInnerHTML={{ __html: svg }} />
            </button>
          );
        })}
      </div>
    );
  }
  const choices = item.choices || [];
  const short = choices.every((c) => c.length <= 22);
  return (
    <div role="radiogroup" aria-label="Answers" className={`mt-6 grid gap-3 ${young || short ? "sm:grid-cols-2" : ""} ${young ? "grid-cols-2" : ""}`}>
      {choices.map((c, k) => {
        const on = value === c;
        return (
          <button key={c} type="button" role="radio" aria-checked={on} aria-label={`Option ${LETTERS[k]}: ${mathPlain(c)}`} onClick={() => onPick(c)} className={`flex items-center gap-4 rounded-2xl border-2 text-left transition ${young ? "min-h-[5.5rem] px-4 py-4 text-2xl" : "min-h-[3.75rem] px-4 py-3 text-lg"} ${on ? "border-gold-700 bg-gold-50 font-semibold ring-2 ring-gold-700/30" : "border-gold-light bg-white hover:border-gold-500"}`}>
            <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-bold ${young ? "h-11 w-11 text-xl" : "h-9 w-9 text-base"} ${on ? "bg-gold-700 text-white" : "bg-cream text-ink/70"}`}>{LETTERS[k]}</span>
            <MathText text={c} className="min-w-0 break-words" />
          </button>
        );
      })}
    </div>
  );
}

type Step = { kind: "passage"; passageId: string } | { kind: "item"; index: number };

function Section({ api, st, cur, large, voice, rate, start, onPosition, onLarge, onState, reload }: {
  api: Api; st: State; cur: Current; large: boolean; voice: Voice; rate: number; start?: number; onPosition: (k: number) => void;
  onLarge: () => void; onState: (s: State) => void; reload: () => Promise<State>;
}) {
  const young = st.year <= 2;
  // The reading text comes first, before its questions.
  const steps = useMemo<Step[]>(() => {
    const out: Step[] = [];
    const seen = new Set<string>();
    cur.items.forEach((it, index) => {
      if (it.passageId && !seen.has(it.passageId) && cur.passages.some((p) => p.id === it.passageId)) { seen.add(it.passageId); out.push({ kind: "passage", passageId: it.passageId }); }
      out.push({ kind: "item", index });
    });
    return out;
  }, [cur.items, cur.passages]);
  const [k, setK] = useState(() => {
    if (start !== undefined && start < steps.length) return start;
    const firstOpen = steps.findIndex((s) => s.kind === "item" && cur.answers[cur.items[s.index].id] === undefined);
    if (firstOpen < 0) return Math.max(0, steps.length - 1);
    return firstOpen > 0 && steps[firstOpen - 1].kind === "passage" ? firstOpen - 1 : firstOpen;
  });
  const [answers, setAnswers] = useState<Record<string, unknown>>(cur.answers);
  const [left, setLeft] = useState(cur.remaining);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirming, setConfirming] = useState(false);
  const [showText, setShowText] = useState(false);
  const [fsLost, setFsLost] = useState(false);
  // Times the child left this page (tab, window or app switch) in this part.
  const [away, setAway] = useState(false);
  const [awayCount, setAwayCount] = useState(0);
  // The server ended this part because it was left as many times as staff allow.
  const [endedForLeaving, setEndedForLeaving] = useState(false);
  const [breakPrompt, setBreakPrompt] = useState<"no" | "show" | "dismissed">("no");
  const shownAt = useRef(0);
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const step = steps[k];
  const item = step?.kind === "item" ? cur.items[step.index] : null;
  const passageId = step?.kind === "passage" ? step.passageId : item?.passageId;
  const passage = useMemo(() => cur.passages.find((p) => p.id === passageId), [cur.passages, passageId]);
  const itemNo = item ? cur.items.indexOf(item) + 1 : 0;
  const total = cur.items.length;

  const speechFor = useCallback((s: Step | undefined): string[] => {
    if (!s) return [];
    if (s.kind === "passage") { const p = cur.passages.find((x) => x.id === s.passageId); return p ? ["Read the text first. Then answer the questions.", ...passageSpeech(p.title, p.text)] : []; }
    return itemSpeech(cur.items[s.index], total > 1 ? cur.items.indexOf(cur.items[s.index]) + 1 : undefined, total > 1 ? total : undefined);
  }, [cur.items, cur.passages, total]);

  // Each step: note when it was shown, read it out for the youngest, and stop reading when moving on.
  useEffect(() => {
    shownAt.current = Date.now();
    onPosition(k);
    if (st.autoRead && voice.available) voice.play(`step-${k}`, speechFor(steps[k]), rate);
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when the step changes
  }, [k]);

  // Display clock. The server keeps the real time; it is checked every 30 seconds.
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left === 0) reload().then((s) => s.ok && onState(s));
  }, [left, reload, onState]);
  useEffect(() => {
    const t = setInterval(async () => {
      const r = await api<Light>({ action: "ping" });
      if (!r.ok) return;
      if (r.finished || r.section !== cur.key || r.onBreak) { reload().then((s) => s.ok && onState(s)); return; }
      if (typeof r.remaining === "number") setLeft(r.remaining);
    }, 30_000);
    return () => clearInterval(t);
  }, [api, cur.key, reload, onState]);

  // ── fair sitting: note leaving the window, block copying, keep full screen ──
  useEffect(() => {
    const last: Record<string, number> = {};
    const log = (type: string, detail?: string) => {
      const now = Date.now();
      if (now - (last[type] || 0) < 1000) return;
      last[type] = now;
      api<{ ended?: boolean }>({ action: "event", type, detail }).then((r) => { if (r.ended) setEndedForLeaving(true); });
    };
    const inText = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "TEXTAREA" || t.tagName === "INPUT");
    const leave = () => {
      setAway((was) => {
        if (!was) setAwayCount((n) => n + 1);
        return true;
      });
    };
    const onVis = () => {
      log(document.hidden ? "hidden" : "visible");
      if (document.hidden) leave();
    };
    const onBlur = () => {
      log("blur");
      // Opening the browser's own print dialog also blurs; that is logged as "print" already.
      leave();
    };
    const onFocus = () => log("focus");
    const onFs = () => { if (inFullscreen()) { setFsLost(false); log("fullscreen_enter"); } else { setFsLost(true); log("fullscreen_exit"); } };
    const onCopy = (e: ClipboardEvent) => { if (inText(e.target) && e.type !== "paste") return; e.preventDefault(); log(e.type); };
    const onMenu = (e: MouseEvent) => { e.preventDefault(); log("contextmenu"); };
    const onDrag = (e: DragEvent) => { if (!inText(e.target)) e.preventDefault(); };
    const onDrop = (e: DragEvent) => { e.preventDefault(); log("paste", "drop"); };
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const textField = inText(e.target);
      const blocked = (mod && ["c", "x", "v", "p", "s", "u", "f", "g"].includes(key) && !(textField && ["c", "x"].includes(key)))
        || (mod && key === "a" && !textField)
        || (mod && e.shiftKey && ["i", "j", "c", "k"].includes(key))
        || e.key === "F12" || e.key === "F3";
      if (blocked) { e.preventDefault(); log(key === "v" ? "paste" : key === "p" ? "print" : "shortcut", `${e.metaKey ? "Cmd" : "Ctrl"}${e.shiftKey ? "+Shift" : ""}+${e.key.length === 1 ? e.key.toUpperCase() : e.key}`.replace(/^(Ctrl|Cmd)\+F(12|3)$/, "F$2")); }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === "PrintScreen") log("shortcut", "PrintScreen"); };
    const onPrint = () => log("print");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    document.addEventListener("copy", onCopy, true);
    document.addEventListener("cut", onCopy, true);
    document.addEventListener("paste", onCopy, true);
    document.addEventListener("contextmenu", onMenu, true);
    document.addEventListener("dragstart", onDrag, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("beforeprint", onPrint);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("cut", onCopy, true);
      document.removeEventListener("paste", onCopy, true);
      document.removeEventListener("contextmenu", onMenu, true);
      document.removeEventListener("dragstart", onDrag, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("beforeprint", onPrint);
    };
  }, [api]);

  const save = useCallback(async (itemId: string, value: unknown) => {
    setSaving("saving");
    const r = await api<{ ok: boolean }>({ action: "answer", itemId, value, ms: Date.now() - shownAt.current });
    setSaving(r.ok ? "saved" : "error");
    if (!r.ok && ["wrong_section", "not_started", "on_break"].includes(r.error || "")) reload().then((s) => s.ok && onState(s));
  }, [api, reload, onState]);

  const answer = (value: unknown, debounce = false) => {
    if (!item) return;
    setAnswers((a) => ({ ...a, [item.id]: value }));
    if (textTimer.current) clearTimeout(textTimer.current);
    if (debounce) textTimer.current = setTimeout(() => save(item.id, value), 1200);
    else save(item.id, value);
  };
  const flush = async () => {
    if (textTimer.current && item) {
      clearTimeout(textTimer.current);
      textTimer.current = null;
      await save(item.id, answers[item.id] ?? "");
    }
  };
  const go = async (to: number) => {
    voice.stop();
    await flush();
    const next = Math.max(0, Math.min(steps.length - 1, to));
    setK(next);
    setShowText(false);
    // Offer the youngest a rest halfway through a part.
    if (young && breakPrompt === "no" && cur.breaksLeft > 0 && steps[next]?.kind === "item" && (steps[next] as { index: number }).index >= Math.floor(total / 2)) setBreakPrompt("show");
  };
  const takeBreak = async () => {
    voice.stop();
    await flush();
    const s = await api({ action: "break_start" });
    if (s.ok) onState(s);
  };
  const submit = async () => {
    voice.stop();
    await flush();
    const s = await api({ action: "submit_section" });
    if (s.ok) onState(s);
  };

  const answeredOf = (id: string) => answers[id] !== undefined && answers[id] !== "";
  const unanswered = cur.items.filter((it) => !answeredOf(it.id)).length;
  const warn = left <= 60 ? "bg-red-600 text-white" : left <= 180 ? "bg-amber-100 text-amber-900" : "bg-white text-ink";
  const isLast = k >= steps.length - 1;

  const passagePanel = passage && (
    <article aria-label={`The text: ${passage.title}`} className="rounded-2xl border border-gold-light bg-white p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">{passage.title}</h2>
        {st.readAloud && voice.available && <SpeakButton on={voice.speakingKey === `passage-${passage.id}`} onClick={() => voice.toggle(`passage-${passage.id}`, passageSpeech(passage.title, passage.text), rate)} label="Read the text out loud" />}
      </div>
      <div className={`mt-3 space-y-3 leading-relaxed text-ink/90 ${young ? "text-2xl leading-loose" : "text-[1.05rem]"}`}>{passage.text.split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)}</div>
    </article>
  );

  return (
    <Shell large={large} onLarge={onLarge} wide>
      <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-gold-light bg-cream/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">{cur.title}</p>
            <p className="text-sm text-ink/70">{step?.kind === "passage" ? "Read the text" : total === 1 ? "One task" : `Question ${itemNo} of ${total}`}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-ink/55 sm:inline" aria-live="polite">{saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : saving === "error" ? "Not saved yet, it will try again" : ""}</span>
            {cur.breaksLeft > 0 && <button type="button" onClick={takeBreak} className="rounded-full border border-gold-light bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-50">Take a break</button>}
            <span className={`rounded-full px-4 py-1.5 font-mono text-lg font-semibold tabular-nums ring-1 ring-gold-light ${warn}`} role="timer" aria-label={`${Math.ceil(Math.max(0, left) / 60)} minutes left`}>{mmss(left)}</span>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Jump to a question">
          {steps.map((s, i) => s.kind === "item" ? (
            <button key={i} type="button" onClick={() => go(i)} aria-label={`Question ${s.index + 1}${answeredOf(cur.items[s.index].id) ? ", answered" : ""}`} aria-current={i === k ? "step" : undefined} className={`h-3.5 w-3.5 rounded-full ${i === k ? "ring-2 ring-gold-700 ring-offset-1" : ""} ${answeredOf(cur.items[s.index].id) ? "bg-gold-700" : "bg-gold-light"}`} />
          ) : (
            <button key={i} type="button" onClick={() => go(i)} aria-label="The text" aria-current={i === k ? "step" : undefined} className={`h-3.5 rounded-full bg-teal-700/30 px-2 text-[0.6rem] font-bold leading-[0.9rem] text-teal-900 ${i === k ? "ring-2 ring-gold-700 ring-offset-1" : ""}`}>TEXT</button>
          ))}
        </div>
      </div>

      {breakPrompt === "show" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-700/20 bg-teal-50 px-5 py-3">
          <p className="text-lg text-ink">You are halfway! Would you like a short break?</p>
          <span className="flex gap-2">
            <button type="button" onClick={() => { setBreakPrompt("dismissed"); takeBreak(); }} className="rounded-full bg-teal-700 px-5 py-2 font-semibold text-white">Yes, a break</button>
            <button type="button" onClick={() => setBreakPrompt("dismissed")} className="rounded-full border border-gold-light bg-white px-5 py-2 font-medium">No, carry on</button>
          </span>
        </div>
      )}

      {/* Question content: no selecting, copying or right-clicking. */}
      <div className="select-none" onCopy={(e) => e.preventDefault()}>
        {step?.kind === "passage" && passage ? (
          <div className="mx-auto max-w-3xl space-y-5">
            <p className="text-lg text-ink/80">Read the text carefully. The questions come next, and you can look back at the text at any time.</p>
            {passagePanel}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => go(k - 1)} disabled={k === 0} className="rounded-full border border-gold-light bg-white px-5 py-3 font-medium text-ink disabled:opacity-40">← Back</button>
              <button type="button" onClick={() => go(k + 1)} className="rounded-full bg-gold-700 px-7 py-3 text-lg font-semibold text-white hover:bg-gold-900">I&apos;ve read it. Start the questions →</button>
            </div>
          </div>
        ) : item ? (
          <div className={`grid gap-6 ${passage ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" : ""}`}>
            {passage && (
              <>
                <div className="lg:hidden">
                  <button type="button" onClick={() => setShowText((v) => !v)} aria-expanded={showText} className="w-full rounded-xl border border-gold-light bg-white px-4 py-3 text-left font-semibold text-teal-800">{showText ? "Hide the text ▲" : `Show the text: ${passage.title} ▼`}</button>
                  {showText && <div className="mt-3">{passagePanel}</div>}
                </div>
                <div className="hidden lg:block lg:sticky lg:top-32 lg:max-h-[calc(100vh-10rem)] lg:self-start lg:overflow-y-auto">{passagePanel}</div>
              </>
            )}

            <section aria-labelledby="q-stem" className={`rounded-2xl border border-gold-light bg-white p-5 sm:p-7 ${passage ? "" : "mx-auto w-full max-w-3xl"}`}>
              <div className="flex items-start gap-3">
                <h1 id="q-stem" className={`flex-1 whitespace-pre-line font-semibold leading-snug text-ink ${young ? "text-3xl" : "text-xl sm:text-2xl"}`}>
                  {item.type === "text" && cur.writingPrompt ? <span className="mb-1 block text-base font-semibold uppercase tracking-wide text-gold-700">{cur.writingPrompt.title}</span> : null}
                  <MathText text={item.stem} />
                </h1>
                {(st.readAloud || item.say) && voice.available && <SpeakButton on={voice.speakingKey === `step-${k}`} onClick={() => voice.toggle(`step-${k}`, speechFor(step), rate)} label={item.say ? "Hear the word" : "Read the question out loud"} />}
              </div>
              {item.svg && <div className="mt-4 overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: item.svg }} />}

              {item.type === "mcq" && <Options item={item} value={answers[item.id]} young={young} onPick={(c) => answer(c)} />}
              {item.type === "numeric" && (
                <label className="mt-6 flex items-center gap-3">
                  <span className="sr-only">Your answer</span>
                  {item.unit === "£" && <span className="text-2xl text-ink/70">£</span>}
                  <input inputMode="decimal" autoComplete="off" value={String(answers[item.id] ?? "")} onChange={(e) => answer(e.target.value, true)} onBlur={(e) => answer(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(k + 1); }} className="w-52 select-text rounded-xl border-2 border-gold-light px-4 py-3 text-2xl tabular-nums focus:border-gold-700" placeholder="Answer" />
                  {item.unit && item.unit !== "£" && <span className="text-xl text-ink/70">{item.unit}</span>}
                </label>
              )}
              {item.type === "text" && (
                <div className="mt-4">
                  <p className="mb-2 text-sm text-ink/65">Plan for a few minutes first. Check your spelling and punctuation at the end. Pasting is switched off: write in your own words.</p>
                  <textarea value={String(answers[item.id] ?? "")} onChange={(e) => answer(e.target.value, true)} onPaste={(e) => e.preventDefault()} rows={14} spellCheck={false} autoCorrect="off" autoCapitalize="sentences" aria-label="Your writing" className="w-full select-text rounded-xl border-2 border-gold-light p-4 text-lg leading-relaxed focus:border-gold-700" placeholder="Write your answer here…" />
                  <p className="mt-1 text-right text-sm text-ink/60">{String(answers[item.id] ?? "").trim().split(/\s+/).filter(Boolean).length} words</p>
                </div>
              )}

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-gold-light/60 pt-5">
                <button type="button" onClick={() => go(k - 1)} disabled={k === 0} className={`rounded-full border border-gold-light bg-white font-medium text-ink disabled:opacity-40 ${young ? "px-7 py-4 text-xl" : "px-5 py-3"}`}>← Back</button>
                {!isLast ? (
                  <button type="button" onClick={() => go(k + 1)} className={`rounded-full bg-gold-700 font-semibold text-white hover:bg-gold-900 ${young ? "px-9 py-4 text-2xl" : "px-7 py-3 text-lg"}`}>Next →</button>
                ) : (
                  <button type="button" onClick={() => { voice.stop(); setConfirming(true); }} className={`rounded-full bg-ink-900 font-semibold text-white ${young ? "px-9 py-4 text-2xl" : "px-7 py-3 text-lg"}`}>Finish {cur.title}</button>
                )}
              </div>
            </section>
          </div>
        ) : null}
      </div>

      {away && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink p-4" role="alertdialog" aria-modal="true" aria-labelledby="away-title" aria-describedby="away-body">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-xl">
            <h2 id="away-title" className="text-xl font-semibold text-ink">{endedForLeaving ? `${cur.title} has ended` : "You left the assessment"}</h2>
            <p id="away-body" className="mt-2 text-ink/75">
              {endedForLeaving
                ? `You left this part ${st.leaveLimit ?? awayCount} times, so it has ended. Your answers up to now are saved.`
                : `Please stay on this page until you have finished. Your teacher can see each time you leave${awayCount > 0 ? ` (${awayCount} ${awayCount === 1 ? "time" : "times"} so far)` : ""}.`}
              {!endedForLeaving && st.leaveLimit ? ` If you leave ${st.leaveLimit} times, this part ends.` : ""}
            </p>
            <button
              type="button"
              autoFocus
              onClick={() => {
                setAway(false);
                enterFullscreen();
                // Picks up a part the server has ended in the meantime.
                if (st.leaveLimit) reload().then((s) => s.ok && onState(s));
              }}
              className="mt-5 rounded-full bg-gold-700 px-6 py-3 text-lg font-semibold text-white"
            >
              {endedForLeaving ? "Carry on" : "Return to my assessment"}
            </button>
          </div>
        </div>
      )}

      {fsLost && !confirming && !away && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/60 p-4" role="dialog" aria-modal="true" aria-labelledby="fs-title">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-xl">
            <h2 id="fs-title" className="text-xl font-semibold text-ink">Back to full screen</h2>
            <p className="mt-2 text-ink/75">The assessment works best in full screen. Press the button to carry on where you were.</p>
            <button type="button" onClick={() => { if (!enterFullscreen()) setFsLost(false); }} className="mt-5 rounded-full bg-gold-700 px-6 py-3 text-lg font-semibold text-white">Carry on</button>
            <button type="button" onClick={() => setFsLost(false)} className="mt-3 block w-full text-sm text-ink/60 underline">Carry on without full screen</button>
          </div>
        </div>
      )}

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

const CALM = [
  "Breathe in slowly through your nose…",
  "…and breathe out slowly through your mouth.",
  "Stretch your arms up high, then let them drop.",
  "Roll your shoulders back three times.",
  "Wiggle your fingers and your toes.",
  "Have a sip of water if you have some.",
  "Look at something far away for a moment.",
];

/** A calm rest screen. Nothing of the test is shown. During a timed part the clock is paused on the server. */
function BreakScreen({ seconds, onDone, timed, young }: { seconds: number; onDone: () => void | Promise<void>; timed?: boolean; young?: boolean }) {
  const [left, setLeft] = useState(seconds);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    stopSpeaking();
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, []);
  const tip = CALM[Math.floor((seconds - left) / 6) % CALM.length];
  const over = left <= 0;
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-12 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-teal-800">Break time</p>
      <h1 className={`mt-2 font-semibold text-ink ${young ? "text-4xl" : "text-3xl"}`}>{over ? (timed ? "Break time is over" : "Ready when you are") : "Time to rest"}</h1>
      <div className="relative my-10 flex h-56 w-56 items-center justify-center" aria-hidden="true">
        <span className="absolute inset-0 rounded-full bg-teal-700/10 motion-safe:animate-[breathe_12s_ease-in-out_infinite]" />
        <span className="absolute inset-8 rounded-full bg-teal-700/15 motion-safe:animate-[breathe_12s_ease-in-out_infinite]" />
        <span className="relative font-mono text-4xl font-semibold tabular-nums text-teal-900">{over ? "0:00" : mmss(left)}</span>
      </div>
      <p className={`min-h-[3.5rem] text-ink/80 ${young ? "text-2xl" : "text-xl"}`} aria-live="polite">{over ? (timed ? "The clock has started again. Press the button when you are ready." : "Press the button when you are ready.") : tip}</p>
      {timed && !over && <p className="mt-2 text-sm text-ink/60">The clock is paused while you rest. The questions are hidden.</p>}
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); await onDone(); setBusy(false); }} className={`mt-8 rounded-full bg-gold-700 font-semibold text-white hover:bg-gold-900 disabled:opacity-60 ${young ? "px-10 py-5 text-2xl" : "px-8 py-4 text-lg"}`}>{busy ? "One moment…" : "I'm ready to carry on"}</button>
      <style>{`@keyframes breathe { 0%, 100% { transform: scale(0.82); } 50% { transform: scale(1.08); } }`}</style>
    </div>
  );
}

function Shell({ children, large, onLarge, wide }: { children: React.ReactNode; large: boolean; onLarge?: () => void; wide?: boolean }) {
  return (
    <div className={`min-h-screen bg-cream ${large ? "text-[1.15rem] [&_.text-lg]:text-xl [&_.text-xl]:text-2xl [&_.text-2xl]:text-3xl" : ""}`}>
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
