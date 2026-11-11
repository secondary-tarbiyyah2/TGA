"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "@/components/learn/Icon";

/*
 * The accessibility centre for the public site and the portal (owner, Nov
 * 2026: "accessibility needs to be better, more realistic and more useful").
 *
 *  - Quick profiles: one tap for a set of settings (low vision, dyslexia,
 *    focus, motion sensitive, keyboard).
 *  - Text: size (four steps), a more readable font, easy reading spacing.
 *  - Colour: high contrast, softer or no colour, dark mode (portal only).
 *  - Reading aids: a reading guide or mask that follows the pointer or the
 *    focused item, highlighted links and focus, outlined headings, a large
 *    cursor, reduced motion.
 *  - Tools: read the page (or the selected text) aloud with the browser's own
 *    voice, jump to any heading, keyboard shortcuts, the accessibility
 *    statement.
 *
 * Settings apply at once as attributes on <html> (styles in globals.css,
 * "View settings") and are remembered on this device under "tga-view".
 * Alt+A opens the centre from anywhere.
 */

const KEY = "tga-view";
type Size = 0 | 1 | 2 | 3;
type Saturation = "normal" | "low" | "mono";
type Guide = "off" | "line" | "mask";
type Font = "standard" | "readable";
type View = {
  size: Size;
  reading: boolean;
  contrast: boolean;
  motion: boolean;
  dark: boolean;
  links: boolean;
  font: Font;
  saturation: Saturation;
  guide: Guide;
  headings: boolean;
  cursor: boolean;
};
const OFF: View = { size: 0, reading: false, contrast: false, motion: false, dark: false, links: false, font: "standard", saturation: "normal", guide: "off", headings: false, cursor: false };

/** Older saves had `text: boolean` for "Larger text"; that is size 1 now. */
function read(): View {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || "{}") as Partial<View> & { text?: boolean };
    const size: Size = raw.size === 1 || raw.size === 2 || raw.size === 3 ? raw.size : raw.text ? 1 : 0;
    return {
      size,
      reading: !!raw.reading,
      contrast: !!raw.contrast,
      motion: !!raw.motion,
      dark: !!raw.dark,
      links: !!raw.links,
      font: raw.font === "readable" ? "readable" : "standard",
      saturation: raw.saturation === "low" || raw.saturation === "mono" ? raw.saturation : "normal",
      guide: raw.guide === "line" || raw.guide === "mask" ? raw.guide : "off",
      headings: !!raw.headings,
      cursor: !!raw.cursor,
    };
  } catch {
    return OFF;
  }
}

function write(v: View) {
  try {
    // `text` kept so a page still running the old code reads the same choice.
    window.localStorage.setItem(KEY, JSON.stringify({ ...v, text: v.size > 0 }));
  } catch {
    /* private mode: applies for this visit only */
  }
}

const SIZE_ATTR = ["", "large", "larger", "largest"] as const;

function apply(v: View) {
  const r = document.documentElement;
  r.toggleAttribute("data-large-text", v.size > 0);
  if (v.size >= 2) r.setAttribute("data-text-size", SIZE_ATTR[v.size]);
  else r.removeAttribute("data-text-size");
  r.toggleAttribute("data-reading", v.reading);
  r.toggleAttribute("data-contrast", v.contrast);
  r.toggleAttribute("data-reduce-motion", v.motion);
  r.toggleAttribute("data-dark", v.dark);
  r.toggleAttribute("data-links", v.links);
  r.toggleAttribute("data-readable-font", v.font === "readable");
  if (v.saturation === "normal") r.removeAttribute("data-saturation");
  else r.setAttribute("data-saturation", v.saturation);
  r.toggleAttribute("data-headings", v.headings);
  r.toggleAttribute("data-big-cursor", v.cursor);
}

/** How many settings differ from the default (dark mode only counts in the portal). */
function changedCount(v: View, portal: boolean): number {
  return (
    (v.size ? 1 : 0) +
    (v.reading ? 1 : 0) +
    (v.contrast ? 1 : 0) +
    (v.motion ? 1 : 0) +
    (v.links ? 1 : 0) +
    (v.font !== "standard" ? 1 : 0) +
    (v.saturation !== "normal" ? 1 : 0) +
    (v.guide !== "off" ? 1 : 0) +
    (v.headings ? 1 : 0) +
    (v.cursor ? 1 : 0) +
    (portal && v.dark ? 1 : 0)
  );
}

const CHANGE_EVENT = "tga:view-change";
const OPEN_EVENT = "tga:open-accessibility";

/** The saved choice, kept in step across every control on the page. */
function useView(): [View, (next: View) => void] {
  const [view, setView] = useState<View>(OFF);
  useEffect(() => {
    const v = read();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the saved choice once after mount
    setView(v);
    apply(v);
    const sync = () => setView(read());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const update = useCallback((next: View) => {
    setView(next);
    apply(next);
    write(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [view, update];
}

/** Restores the saved view settings as soon as any page with a header opens. */
export function useRestoreView() {
  useEffect(() => {
    apply(read());
  }, []);
}

/** Opens the accessibility centre from anywhere (e.g. a link in the page). */
export function openAccessibility() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

// ── Read aloud (the browser's own speech, nothing sent anywhere) ─────────

type SpeechState = "idle" | "playing" | "paused";
const SPEECH_EVENT = "tga:speech";
const speech = { state: "idle" as SpeechState, rate: 1, label: "" };

function setSpeech(state: SpeechState, label = speech.label) {
  speech.state = state;
  speech.label = label;
  window.dispatchEvent(new Event(SPEECH_EVENT));
}

function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/** Splits text into sentence-sized pieces (long single utterances stall in some browsers). */
function chunks(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  const parts = clean.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [clean];
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + p).length > 220 && cur) {
      out.push(cur.trim());
      cur = "";
    }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function speak(text: string, label: string) {
  if (!speechSupported() || !text.trim()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const voices = synth.getVoices();
  const voice = voices.find((v) => v.lang === "en-GB") ?? voices.find((v) => v.lang.startsWith("en"));
  const pieces = chunks(text);
  pieces.forEach((piece, i) => {
    const u = new SpeechSynthesisUtterance(piece);
    u.lang = "en-GB";
    if (voice) u.voice = voice;
    u.rate = speech.rate;
    if (i === pieces.length - 1) u.onend = () => setSpeech("idle");
    u.onerror = () => setSpeech("idle");
    synth.speak(u);
  });
  setSpeech("playing", label);
}

function pageText(): string {
  const main = document.querySelector("main") ?? document.body;
  return (main as HTMLElement).innerText;
}

function useSpeech(): SpeechState {
  const [state, setState] = useState<SpeechState>("idle");
  useEffect(() => {
    const sync = () => setState(speech.state);
    window.addEventListener(SPEECH_EVENT, sync);
    return () => window.removeEventListener(SPEECH_EVENT, sync);
  }, []);
  return state;
}

// ── Pieces ───────────────────────────────────────────────────────────

/** "A large, a small": the display icon (Lucide a-large-small). */
export function DisplayIcon({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 14h-5" />
      <path d="M16 16v-3.5a2.5 2.5 0 0 1 5 0V16" />
      <path d="M4.5 13h6" />
      <path d="m3 16 4.5-9 4.5 9" />
    </svg>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="px-1 pb-1.5 pt-3 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-gold-900 first:pt-0">{children}</h3>;
}

/**
 * A row of choices for one setting. A radio group: arrow keys move and
 * choose, and only the chosen option is in the Tab order.
 */
function Segmented<T extends string | number>({ label, hint, choices, value, onChange }: { label: string; hint?: string; choices: { value: T; label: ReactNode; name: string }[]; value: T; onChange: (v: T) => void }) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, choices.findIndex((c) => c.value === value));
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    const next = step ? (index + step + choices.length) % choices.length : e.key === "Home" ? 0 : e.key === "End" ? choices.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(choices[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className="view-choice rounded-xl border border-gold-light/70 bg-white p-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p id={`${id}-l`} className="text-sm font-semibold text-ink">{label}</p>
        {hint && <p id={`${id}-h`} className="text-right text-xs text-ink/70">{hint}</p>}
      </div>
      <div role="radiogroup" aria-labelledby={`${id}-l`} aria-describedby={hint ? `${id}-h` : undefined} onKeyDown={onKey} className="flex gap-1 rounded-lg bg-cream p-1">
        {choices.map((c, i) => {
          const on = c.value === value;
          return (
            <button
              key={String(c.value)}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.name}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(c.value)}
              className={`min-h-10 flex-1 rounded-md px-2 text-sm font-semibold transition-colors ${on ? "bg-ink-900 text-white shadow-sm" : "text-ink/80 hover:bg-white"}`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One on/off setting, as a switch with an icon and a short description. */
function Toggle({ icon, label, hint, on, onChange }: { icon: IconName; label: string; hint: string; on: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-describedby={`${id}-h`}
      onClick={() => onChange(!on)}
      className={`view-choice flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${on ? "border-ink-900 bg-white ring-1 ring-ink-900" : "border-gold-light/70 bg-white hover:border-ink/30"}`}
    >
      <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${on ? "bg-ink-900 text-gold-300" : "bg-gold-50 text-gold-900"}`}>
        <Icon name={icon} size="sm" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span id={`${id}-h`} className="block text-xs leading-snug text-ink/70">{hint}</span>
      </span>
      <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-forest-700" : "bg-ink/20"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${on ? "left-[1.375rem]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

type Profile = { key: string; label: string; icon: IconName; hint: string; patch: Partial<View> };
const PROFILES: Profile[] = [
  { key: "vision", label: "Low vision", icon: "eye", hint: "Larger text, high contrast, clear links, big cursor", patch: { size: 2, contrast: true, links: true, cursor: true } },
  { key: "dyslexia", label: "Dyslexia friendly", icon: "bookOpen", hint: "Readable font, wider spacing, larger text", patch: { font: "readable", reading: true, size: 1 } },
  { key: "focus", label: "Focus", icon: "target", hint: "Reading mask, softer colours, no animation", patch: { guide: "mask", saturation: "low", motion: true } },
  { key: "motion", label: "Motion sensitive", icon: "pause", hint: "Stops animations and sliding effects", patch: { motion: true } },
  { key: "keyboard", label: "Keyboard", icon: "keyboard", hint: "Strong focus outline, outlined headings", patch: { links: true, headings: true } },
];

const profileOn = (v: View, p: Profile) => (Object.keys(p.patch) as (keyof View)[]).every((k) => v[k] === p.patch[k]);

/** Headings in the page, for "Jump to a section". */
function useHeadings(open: boolean) {
  const [list, setList] = useState<{ el: HTMLElement; text: string; level: number }[]>([]);
  useEffect(() => {
    if (!open) return;
    const found = Array.from(document.querySelectorAll<HTMLElement>("main h1, main h2, main h3"))
      .filter((h) => h.offsetParent !== null && !h.closest("[aria-hidden='true'], [role='dialog']") && h.innerText.trim())
      .slice(0, 40)
      .map((el) => ({ el, text: el.innerText.trim().replace(/\s+/g, " "), level: Number(el.tagName[1]) }));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the page's headings when the panel opens
    setList(found);
  }, [open]);
  return list;
}

const SHORTCUTS: [string, string][] = [
  ["Alt + A", "Open this accessibility centre"],
  ["Ctrl + K or /", "Search the site"],
  ["Tab / Shift + Tab", "Move between links and buttons"],
  ["Esc", "Close a menu or window"],
];

/** The accessibility options. Remembered on this device; dark mode only shows (and applies) in the portal. */
export function ViewSettingsPanel({ className = "", portal = false, showReset = true, onNavigate }: { className?: string; portal?: boolean; showReset?: boolean; onNavigate?: () => void }) {
  const [view, setView] = useView();
  const [said, setSaid] = useState("");
  const state = useSpeech();
  const [rate, setRate] = useState(1);
  const selection = useRef("");
  const [hasSelection, setHasSelection] = useState(false);
  const [showHeadings, setShowHeadings] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const headings = useHeadings(showHeadings);

  useEffect(() => {
    // The text selected before the panel opened (clicking in the panel can clear it).
    selection.current = window.getSelection()?.toString().trim() ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only facts, read once after mount
    setHasSelection(!!selection.current);
    setCanSpeak(speechSupported());
  }, []);

  const set = (patch: Partial<View>, message: string) => {
    setView({ ...view, ...patch });
    setSaid(message);
  };
  const count = changedCount(view, portal);

  return (
    <div className={`text-ink ${className}`}>
      <SectionTitle>Quick profiles</SectionTitle>
      <ul className="grid gap-2 sm:grid-cols-2">
        {PROFILES.map((p) => {
          const on = profileOn(view, p);
          return (
            <li key={p.key}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() =>
                  on
                    ? set(Object.fromEntries(Object.keys(p.patch).map((k) => [k, OFF[k as keyof View]])) as Partial<View>, `${p.label} profile off.`)
                    : set(p.patch, `${p.label} profile on.`)
                }
                className={`view-choice flex h-full w-full items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${on ? "border-ink-900 bg-ink-900 text-white" : "border-gold-light/70 bg-white hover:border-ink/30"}`}
              >
                <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${on ? "bg-gold-300 text-ink-900" : "bg-gold-50 text-gold-900"}`}>
                  <Icon name={p.icon} size="sm" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{p.label}</span>
                  <span className={`block text-xs leading-snug ${on ? "text-white/85" : "text-ink/70"}`}>{p.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <SectionTitle>Text</SectionTitle>
      <div className="space-y-2">
        <Segmented<Size>
          label="Text size"
          hint="Everything on the page grows"
          value={view.size}
          onChange={(size) => set({ size }, `Text size ${["100", "115", "130", "150"][size]} percent.`)}
          choices={[
            { value: 0, name: "Text size 100 percent", label: <span className="text-[13px]">100%</span> },
            { value: 1, name: "Text size 115 percent", label: <span className="text-[14px]">115%</span> },
            { value: 2, name: "Text size 130 percent", label: <span className="text-[15px]">130%</span> },
            { value: 3, name: "Text size 150 percent", label: <span className="text-[16px]">150%</span> },
          ]}
        />
        <Toggle icon="languages" label="Readable font" hint="A plain, open typeface that many people with dyslexia find easier" on={view.font === "readable"} onChange={(on) => set({ font: on ? "readable" : "standard" }, on ? "Readable font on." : "Readable font off.")} />
        <Toggle icon="fileText" label="Easy reading" hint="Wider line, letter and word spacing on a softer page" on={view.reading} onChange={(on) => set({ reading: on }, on ? "Easy reading on." : "Easy reading off.")} />
      </div>

      <SectionTitle>Colour</SectionTitle>
      <div className="space-y-2">
        <Toggle icon="sun" label="High contrast" hint="Darker text and stronger lines" on={view.contrast} onChange={(on) => set({ contrast: on }, on ? "High contrast on." : "High contrast off.")} />
        <Segmented<Saturation>
          label="Colour strength"
          hint="Calmer colours for tired eyes"
          value={view.saturation}
          onChange={(saturation) => set({ saturation }, `Colour ${saturation === "normal" ? "normal" : saturation === "low" ? "softer" : "off"}.`)}
          choices={[
            { value: "normal", name: "Normal colour", label: "Normal" },
            { value: "low", name: "Softer colour", label: "Softer" },
            { value: "mono", name: "No colour (greyscale)", label: "Greyscale" },
          ]}
        />
        {portal && <Toggle icon="moon" label="Dark mode" hint="Easier on the eyes in the evening" on={view.dark} onChange={(on) => set({ dark: on }, on ? "Dark mode on." : "Dark mode off.")} />}
      </div>

      <SectionTitle>Reading aids</SectionTitle>
      <div className="space-y-2">
        <Segmented<Guide>
          label="Reading guide"
          hint="Follows your pointer, finger or the item you are on"
          value={view.guide}
          onChange={(guide) => set({ guide }, guide === "off" ? "Reading guide off." : guide === "line" ? "Reading line on." : "Reading mask on.")}
          choices={[
            { value: "off", name: "Reading guide off", label: "Off" },
            { value: "line", name: "Reading line", label: "Line" },
            { value: "mask", name: "Reading mask", label: "Mask" },
          ]}
        />
        <Toggle icon="externalLink" label="Highlight links and focus" hint="Underline every link and show a bold outline on the item you are on" on={view.links} onChange={(on) => set({ links: on }, on ? "Links highlighted." : "Link highlighting off.")} />
        <Toggle icon="listChecks" label="Outline headings" hint="Mark every heading so the page structure is easy to see" on={view.headings} onChange={(on) => set({ headings: on }, on ? "Headings outlined." : "Heading outlines off.")} />
        <Toggle icon="target" label="Large cursor" hint="A bigger mouse pointer that is easier to find" on={view.cursor} onChange={(on) => set({ cursor: on }, on ? "Large cursor on." : "Large cursor off.")} />
        <Toggle icon="pause" label="Reduce motion" hint="Stops animations, sliding and scrolling effects" on={view.motion} onChange={(on) => set({ motion: on }, on ? "Reduced motion on." : "Reduced motion off.")} />
      </div>

      <SectionTitle>Tools</SectionTitle>
      <div className="space-y-2">
        <div className="view-choice rounded-xl border border-gold-light/70 bg-white p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Icon name="volume" size="sm" className="h-4 w-4 text-gold-900" /> Read aloud
          </p>
          {canSpeak ? (
            <>
              <p className="mt-0.5 text-xs text-ink/70">Uses your device&apos;s own voice. Nothing is sent anywhere.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {state === "idle" ? (
                  <>
                    <button type="button" onClick={() => speak(pageText(), "this page")} className="min-h-10 rounded-full bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-700">
                      Read this page
                    </button>
                    <button
                      type="button"
                      disabled={!hasSelection}
                      onClick={() => speak(selection.current, "the selected text")}
                      className="min-h-10 rounded-full border border-gold-500 px-4 text-sm font-semibold text-ink-900 hover:bg-gold-100 disabled:cursor-not-allowed disabled:border-gold-light disabled:text-ink/50"
                    >
                      Read selected text
                    </button>
                  </>
                ) : (
                  <SpeechButtons state={state} />
                )}
              </div>
              {!hasSelection && state === "idle" && <p className="mt-1.5 text-xs text-ink/70">Tip: select some text on the page first to hear just that part.</p>}
              <div className="mt-2">
                <Segmented<number>
                  label="Speed"
                  value={rate}
                  onChange={(r) => {
                    setRate(r);
                    speech.rate = r;
                  }}
                  choices={[
                    { value: 0.8, name: "Slow", label: "Slow" },
                    { value: 1, name: "Normal speed", label: "Normal" },
                    { value: 1.25, name: "Fast", label: "Fast" },
                  ]}
                />
              </div>
            </>
          ) : (
            <p className="mt-0.5 text-xs text-ink/70">This browser can&apos;t read aloud. Try Chrome, Edge or Safari, or your device&apos;s screen reader.</p>
          )}
        </div>

        <div className="view-choice rounded-xl border border-gold-light/70 bg-white p-3">
          <button type="button" aria-expanded={showHeadings} onClick={() => setShowHeadings((s) => !s)} className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-ink">
            <span className="flex items-center gap-2">
              <Icon name="layers" size="sm" className="h-4 w-4 text-gold-900" /> Jump to a section
            </span>
            <Icon name="chevronDown" size="sm" className={`h-4 w-4 transition-transform ${showHeadings ? "rotate-180" : ""}`} />
          </button>
          {showHeadings && (
            <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto">
              {headings.length === 0 && <li className="text-xs text-ink/70">No sections on this page.</li>}
              {headings.map((h, i) => (
                <li key={i} style={{ paddingLeft: `${(h.level - 1) * 0.75}rem` }}>
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate?.();
                      window.setTimeout(() => {
                        if (!h.el.hasAttribute("tabindex")) h.el.setAttribute("tabindex", "-1");
                        h.el.scrollIntoView({ block: "start" });
                        h.el.focus({ preventScroll: true });
                      }, 50);
                    }}
                    className="w-full rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-gold-50"
                  >
                    {h.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="view-choice rounded-xl border border-gold-light/70 bg-white p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Icon name="keyboard" size="sm" className="h-4 w-4 text-gold-900" /> Keyboard shortcuts
          </p>
          <dl className="mt-2 space-y-1 text-xs">
            {SHORTCUTS.map(([k, d]) => (
              <div key={k} className="flex items-baseline justify-between gap-3">
                <dt>
                  <kbd className="rounded border border-gold-light bg-cream px-1.5 py-0.5 font-mono text-[0.7rem] text-ink">{k}</kbd>
                </dt>
                <dd className="text-right text-ink/75">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
        {!portal ? (
          <Link href="/accessibility" onClick={onNavigate} className="text-sm font-medium text-gold-900 underline underline-offset-2">
            Accessibility statement
          </Link>
        ) : (
          <span />
        )}
        {showReset && (
          <button
            type="button"
            disabled={count === 0}
            onClick={() => set({ ...OFF, dark: portal ? false : view.dark }, "All settings reset.")}
            className="rounded-md px-1 text-sm font-medium text-forest-700 underline-offset-2 hover:underline disabled:cursor-default disabled:text-ink/50 disabled:no-underline"
          >
            Reset all{count ? ` (${count} on)` : ""}
          </button>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {said}
      </p>
    </div>
  );
}

function SpeechButtons({ state, compact = false }: { state: SpeechState; compact?: boolean }) {
  const btn = compact ? "min-h-9 rounded-full px-3 text-sm font-semibold" : "min-h-10 rounded-full px-4 text-sm font-semibold";
  return (
    <>
      {state === "playing" ? (
        <button
          type="button"
          onClick={() => {
            window.speechSynthesis.pause();
            setSpeech("paused");
          }}
          className={`${btn} bg-ink-900 text-white hover:bg-ink-700`}
        >
          Pause
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            window.speechSynthesis.resume();
            setSpeech("playing");
          }}
          className={`${btn} bg-ink-900 text-white hover:bg-ink-700`}
        >
          Resume
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          window.speechSynthesis.cancel();
          setSpeech("idle");
        }}
        className={`${btn} border border-gold-500 text-ink-900 hover:bg-gold-100`}
      >
        Stop
      </button>
    </>
  );
}

// ── Overlays: the reading guide and the read-aloud player ────────────────

function ReadingGuide({ mode }: { mode: Guide }) {
  const [y, setY] = useState<number | null>(null);
  useEffect(() => {
    if (mode === "off") return;
    const move = (e: PointerEvent) => setY(e.clientY);
    const focus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el?.getBoundingClientRect) return;
      const r = el.getBoundingClientRect();
      setY(r.top + r.height / 2);
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", move, { passive: true });
    window.addEventListener("focusin", focus);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move);
      window.removeEventListener("focusin", focus);
    };
  }, [mode]);
  if (mode === "off" || y === null) return null;
  const band = 72;
  if (mode === "line") {
    return (
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 z-[120]" style={{ top: y - band / 2, height: band }}>
        <div className="h-full border-y-2 border-gold-500 bg-gold-300/15" />
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[120]">
      <div className="absolute inset-x-0 top-0 bg-ink-900/55" style={{ height: Math.max(0, y - band / 2) }} />
      <div className="absolute inset-x-0 bottom-0 bg-ink-900/55" style={{ top: y + band / 2 }} />
    </div>
  );
}

function SpeechPlayer() {
  const state = useSpeech();
  if (state === "idle") return null;
  return (
    <div role="region" aria-label="Read aloud" className="fixed bottom-4 left-4 z-[115] flex items-center gap-2 rounded-full border border-gold-light/70 bg-white/95 py-1.5 pl-4 pr-1.5 shadow-warm backdrop-blur">
      <Icon name="volume" size="sm" className="h-4 w-4 text-gold-900" />
      <span className="text-sm font-medium text-ink">{state === "playing" ? `Reading ${speech.label}` : "Paused"}</span>
      <SpeechButtons state={state} compact />
    </div>
  );
}

/** The reading guide and the read-aloud player, drawn over the page while on. Mount once per page. */
function Overlays() {
  const [view] = useView();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- portals only after mount
  useEffect(() => setMounted(true), []);
  useEffect(() => () => {
    if (speechSupported()) window.speechSynthesis.cancel();
  }, []);
  if (!mounted) return null;
  return createPortal(
    <>
      <ReadingGuide mode={view.guide} />
      <SpeechPlayer />
    </>,
    document.body,
  );
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The accessibility button (a quiet icon in the public header, a text link in
 * the public footer, and the portal top bar) and its panel: a side panel on
 * wide screens, a sheet from the bottom on phones. Focus stays inside while
 * it is open, Esc or Done closes it, and focus goes back to the button.
 * Alt+A opens it from anywhere.
 */
export function ViewSettingsMenu({ variant = "site" }: { variant?: "site" | "portal" | "footer" }) {
  const portal = variant === "portal";
  const footer = variant === "footer";
  const [open, setOpen] = useState(false);
  const [view] = useView();
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => trigger.current?.focus(), 0);
  }, []);

  // Alt+A and openAccessibility(): the header (or portal) copy answers; the footer copy doesn't.
  useEffect(() => {
    if (footer) return;
    const show = () => setOpen(true);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyA") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener(OPEN_EVENT, show);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, show);
      window.removeEventListener("keydown", onKey);
    };
  }, [footer]);

  useEffect(() => {
    if (!open) return;
    const el = dialog.current;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    el?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  const count = changedCount(view, portal);
  // The accessible name must contain the visible label (WCAG 2.5.3).
  const name = portal ? "Display and accessibility options" : "Accessibility and display options";
  const label = count ? `${name} (${count} on)` : name;

  return (
    <>
      {!footer && <Overlays />}
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title="Accessibility (Alt + A): text size, readable font, contrast, reading guide, read aloud and more"
        onClick={() => setOpen(true)}
        className={
          portal
            ? "portal-topbar-btn relative"
            : footer
              ? "relative inline-flex items-center gap-1.5 rounded text-cream/75 transition-colors hover:text-cream focus-visible:outline-gold-light"
              : "relative inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-medium text-ink/70 transition-colors hover:bg-gold-100 hover:text-ink"
        }
      >
        <DisplayIcon className={footer ? "h-4 w-4" : portal ? "" : "h-[18px] w-[18px]"} />
        {portal && (
          <span aria-hidden="true" className="hidden xl:inline">
            Display
          </span>
        )}
        {footer && <span aria-hidden="true">Accessibility and display</span>}
        {!portal && !footer && (
          <span aria-hidden="true" className="hidden 2xl:inline">
            Accessibility
          </span>
        )}
        {count > 0 && (
          <span
            aria-hidden="true"
            className={`absolute flex min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[0.6rem] font-bold leading-4 text-ink-900 ${footer ? "-right-4 -top-1" : portal ? "-right-1 -top-1 border-2 border-[var(--portal-canvas)]" : "-right-0.5 -top-0.5 ring-2 ring-cream"}`}
          >
            {count}
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <div
            className={`${portal ? "portal " : ""}fixed inset-0 z-[110] flex items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-stretch sm:justify-end`}
            onMouseDown={(e) => e.target === e.currentTarget && close()}
          >
            <div
              ref={dialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              className="view-dialog flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-gold-light/70 bg-cream shadow-warm focus:outline-none sm:max-h-none sm:max-w-md sm:rounded-none sm:rounded-l-3xl"
            >
              <div className="relative overflow-hidden border-b border-gold-light/70 bg-ink-900 px-5 pb-4 pt-5 text-white">
                <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gold-500/25 blur-2xl" />
                <div className="relative flex items-start gap-3">
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-300 text-ink-900">
                    <DisplayIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 id={titleId} className="text-lg font-semibold leading-tight">
                      Accessibility centre
                    </h2>
                    <p className="mt-0.5 text-sm text-white/80">
                      Changes apply straight away and are remembered on this device. {count ? `${count} on.` : ""}
                    </p>
                  </div>
                  <button type="button" onClick={close} aria-label="Close" className="-mr-1 rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6l-12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                <ViewSettingsPanel portal={portal} onNavigate={close} />
              </div>
              <div className="border-t border-gold-light/70 bg-white px-5 py-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
                <button type="button" onClick={close} className="w-full rounded-full bg-gold-500 px-4 py-2.5 text-sm font-semibold text-ink-900 hover:brightness-95">
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
