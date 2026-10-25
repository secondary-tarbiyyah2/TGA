// Read-aloud for the entry assessment, using the browser's own voices.
//
// Picks the most natural British voice the device has (Microsoft "Natural"
// voices such as Sonia, Libby or Ryan in Edge, then Google UK English in
// Chrome, then Apple's UK voices, then any en-GB, then any English), speaks
// in short chunks (some browsers cut long utterances off) and stops at once
// when asked: every call to speak() or stop() cancels what came before.

export type SpeakOptions = { rate?: number; onEnd?: () => void; onStart?: () => void };

let chosen: SpeechSynthesisVoice | null = null;
let loading: Promise<void> | null = null;
let generation = 0;

function synth(): SpeechSynthesis | null {
  try {
    return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  } catch {
    return null;
  }
}

const NATURAL_GB = /(sonia|libby|ryan|maisie|thomas|abbi|alfie|bella|elliot|ethan|hollie|noah|oliver|olivia)/i;
/** Higher is better. */
export function voiceRank(v: { name: string; lang: string; localService?: boolean }): number {
  const n = v.name.toLowerCase();
  const l = v.lang.toLowerCase().replace("_", "-");
  if (l === "en-gb" && /natural/.test(n) && NATURAL_GB.test(n)) return 100;
  if (l === "en-gb" && /natural|online/.test(n)) return 92;
  if (/google uk english female/.test(n)) return 86;
  if (/google uk english/.test(n)) return 85;
  if (l === "en-gb" && /(enhanced|premium)/.test(n)) return 80;
  if (l === "en-gb" && /(serena|daniel|kate|stephanie|martha|arthur|oliver|jamie)/.test(n)) return 75;
  if (l === "en-gb") return 65;
  if (l.startsWith("en-") && /natural|online/.test(n)) return 50;
  if (/^en-(ie|au|nz)/.test(l)) return 40;
  if (l.startsWith("en")) return 30;
  return 0;
}

export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  let best: SpeechSynthesisVoice | null = null, score = 0;
  for (const v of voices) {
    const r = voiceRank(v);
    if (r > score) { score = r; best = v; }
  }
  return best;
}

/** Waits (briefly) for the voice list, which loads asynchronously in Chrome and Edge. */
export function loadVoices(): Promise<void> {
  const s = synth();
  if (!s) return Promise.resolve();
  if (chosen) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve) => {
    const take = () => {
      const v = s.getVoices();
      if (v.length) chosen = pickVoice(v);
      return v.length > 0;
    };
    if (take()) return resolve();
    const done = () => { take(); s.removeEventListener?.("voiceschanged", done); resolve(); };
    s.addEventListener?.("voiceschanged", done);
    setTimeout(done, 2000);
  });
  return loading;
}

/** Split into sentence-sized chunks of at most ~200 characters. */
export function chunks(parts: string[]): string[] {
  const out: string[] = [];
  for (const p of parts) {
    const sentences = p.match(/[^.!?]+[.!?]+["”’)]*\s*|[^.!?]+$/g) || [p];
    let buf = "";
    for (const s of sentences) {
      if ((buf + s).length > 200 && buf) { out.push(buf.trim()); buf = ""; }
      buf += s;
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out;
}

export function stopSpeaking() {
  generation++;
  try { synth()?.cancel(); } catch { /* nothing to stop */ }
}

export function isSpeechAvailable(): boolean {
  return !!synth();
}

/** Speak a list of phrases in order. Returns false if speech isn't available. */
export async function speak(parts: string[], opts: SpeakOptions = {}): Promise<boolean> {
  const s = synth();
  stopSpeaking();
  if (!s) return false;
  const mine = generation;
  await loadVoices();
  if (mine !== generation) return true; // stopped while the voices loaded
  const list = chunks(parts.filter(Boolean));
  let i = 0;
  const next = () => {
    if (mine !== generation) return;
    if (i >= list.length) { opts.onEnd?.(); return; }
    const u = new SpeechSynthesisUtterance(list[i++]);
    if (chosen) { u.voice = chosen; u.lang = chosen.lang; } else u.lang = "en-GB";
    u.rate = opts.rate ?? 0.95;
    u.pitch = 1;
    u.volume = 1;
    u.onend = next;
    u.onerror = () => { if (mine === generation) opts.onEnd?.(); };
    try { s.speak(u); } catch { opts.onEnd?.(); }
  };
  opts.onStart?.();
  // Chrome sometimes leaves the engine paused after cancel(); resume first.
  try { s.resume(); } catch { /* fine */ }
  next();
  return true;
}
