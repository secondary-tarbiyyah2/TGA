// How the assessment was sat: turns the event log, answer timings and breaks
// into a short, calm summary for staff. It never accuses: most moments away
// from a test at home are innocent (a sibling, the doorbell), so the wording
// says what happened and when it is worth a conversation. Breaks are allowed
// and never count against the pupil; during a break the questions are hidden
// and the clock is paused, so the log just notes them.
import type { Item } from "./core.ts";

export type AssessEvent = { t: string; type: string; section?: string; brk?: boolean; detail?: string };
export type BreakLog = { section: string; start: string; end?: string; allowedMs: number };
/** leftLimit: the part was ended because the pupil left it as many times as staff allowed (access.leaveLimit). */
export type SectionLog = { key: string; started: string; ended: string; timedOut: boolean; leftLimit?: boolean };

/**
 * Times the pupil left a running part (not during a break): a hidden tab, or
 * another window in front (a blur with no hidden within 1.5 s). The same rule
 * as the staff report's "Left the assessment" count and the pupil's on-screen count.
 */
export function countLeaves(events: AssessEvent[], section: string, since: string | null): number {
  const from = since ? new Date(since).getTime() : 0;
  const live = events.filter((e) => e.section === section && !e.brk && new Date(e.t).getTime() >= from);
  let n = 0;
  for (const e of live) {
    if (e.type === "hidden") n++;
    else if (e.type === "blur" && !live.some((x) => x.type === "hidden" && Math.abs(new Date(x.t).getTime() - new Date(e.t).getTime()) < 1500)) n++;
  }
  return n;
}
export type IntegrityRating = "No concerns" | "Some concerns" | "Review needed";

export type IntegrityInput = {
  sections: { key: string; title: string; candidate: boolean; items: Item[] }[];
  /** ms: time on the question measured by the page; g: gap since the previous saved answer, measured by the server. */
  responses: Record<string, { value: unknown; ms?: number; t?: string; g?: number }>;
  events: AssessEvent[];
  sectionsLog: SectionLog[];
  breaks: BreakLog[];
};

export type IntegritySummary = {
  rating: IntegrityRating;
  points: number;
  counts: {
    away: number; awaySeconds: number; blur: number; fullscreenExits: number; copy: number; paste: number; rightClick: number; shortcuts: number;
    otherSessions: number; breaks: number; breakSeconds: number; rapid: number; timed: number; longestSameLetter: number; mcqAnswered: number;
  };
  notes: string[];
  timeline: { t: string; section?: string; text: string; kind: "info" | "note" | "break" }[];
  /** Kept for older reports and the pupil-record sync. */
  tabHides: number; fastAnswers: number; answered: number; unanswered: number; timedOutSections: string[];
  /** Parts ended early because the pupil left them too many times (staff setting). */
  endedForLeaving?: string[];
};

export const RAPID_MS = 2500;
const LETTERS = "ABCDEFGH";
const secs = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 1000);
const dur = (s: number) => (s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

const LABEL: Record<string, string> = {
  hidden: "Left the test window",
  visible: "Came back to the test",
  blur: "Another window was in front",
  focus: "Test window active again",
  fullscreen_exit: "Left full screen",
  fullscreen_enter: "Full screen on",
  fullscreen_unavailable: "Full screen not available on this device",
  copy: "Tried to copy",
  cut: "Tried to cut",
  paste: "Tried to paste",
  contextmenu: "Right-clicked",
  shortcut: "Pressed a blocked shortcut",
  print: "Tried to print",
  resize: "Window resized",
  session_new: "Opened the assessment",
  session_resumed: "Opened again later (earlier window closed)",
  session_takeover: "Moved to a new window or device while the first was still open",
  session_conflict: "A second window tried to use the assessment",
  break_start: "Break started",
  break_end: "Break ended",
};

export function summariseIntegrity(input: IntegrityInput): IntegritySummary {
  const { events, breaks, sectionsLog } = input;
  const titles = new Map(input.sections.map((s) => [s.key, s.title]));
  const auto = input.sections.filter((s) => s.candidate).flatMap((s) => s.items.filter((i) => i.type !== "text"));
  const resp = input.responses || {};

  // Away from the test while a part was running (not during a break).
  let away = 0, awaySeconds = 0, blur = 0;
  const live = events.filter((e) => e.section && !e.brk);
  for (let i = 0; i < live.length; i++) {
    const e = live[i];
    if (e.type === "hidden") {
      away++;
      const back = live.slice(i + 1).find((x) => x.type === "visible");
      awaySeconds += back ? secs(e.t, back.t) : 0;
    } else if (e.type === "blur") {
      // A blur on its own (the page still visible, e.g. another window on top) is counted separately.
      const nearHidden = live.some((x) => x.type === "hidden" && Math.abs(new Date(x.t).getTime() - new Date(e.t).getTime()) < 1500);
      if (!nearHidden) blur++;
    }
  }
  const count = (types: string[]) => live.filter((e) => types.includes(e.type)).length;
  const fullscreenExits = count(["fullscreen_exit"]);
  const copy = count(["copy", "cut"]);
  const paste = count(["paste"]);
  const rightClick = count(["contextmenu"]);
  const shortcuts = count(["shortcut", "print"]);
  const takeovers = events.filter((e) => e.type === "session_takeover").length;
  const conflicts = events.filter((e) => e.type === "session_conflict").length;
  const otherSessions = takeovers + conflicts;
  const breakSeconds = breaks.reduce((p, b) => p + Math.min(b.end ? secs(b.start, b.end) : 0, b.allowedMs / 1000 + 3600), 0);

  // Answer timing and patterns.
  const took = (r: { ms?: number; g?: number }) => (typeof r.ms === "number" ? r.ms : r.g);
  const timedResp = auto.map((i) => resp[i.id]).filter((r) => r && typeof took(r) === "number" && r.value !== "" && r.value !== null);
  const rapid = timedResp.filter((r) => (took(r) as number) < RAPID_MS).length;
  let longestSameLetter = 0, mcqAnswered = 0;
  for (const s of input.sections.filter((x) => x.candidate)) {
    let run = 0, last = "";
    for (const it of s.items) {
      if (it.type !== "mcq") continue;
      const v = resp[it.id]?.value;
      const idx = v === undefined || v === null || v === "" ? -1 : (it.choices || []).indexOf(String(v));
      if (idx < 0) { run = 0; last = ""; continue; }
      mcqAnswered++;
      const letter = LETTERS[idx];
      run = letter === last ? run + 1 : 1;
      last = letter;
      longestSameLetter = Math.max(longestSameLetter, run);
    }
  }
  const unanswered = auto.filter((i) => resp[i.id] === undefined || resp[i.id].value === "" || resp[i.id].value === null).length;
  const timedOutSections = sectionsLog.filter((l) => l.timedOut).map((l) => titles.get(l.key) || l.key);
  const endedForLeaving = sectionsLog.filter((l) => l.leftLimit).map((l) => titles.get(l.key) || l.key);

  // Points: only patterns that, together, are worth a conversation.
  let points = 0;
  if (away >= 8 || awaySeconds >= 300) points += 3;
  else if (away >= 4 || awaySeconds >= 90) points += 2;
  else if (away >= 2 || awaySeconds >= 30) points += 1; // one brief moment away is not worth flagging
  // Moving to a new window is usually innocent (a closed tab, a change of device); two windows both trying to answer is less so.
  if (endedForLeaving.length) points += 2;
  if (conflicts >= 1) points += 2;
  else if (takeovers >= 1) points += 1;
  if (paste >= 3) points += 2;
  else if (paste >= 1) points += 1;
  if (copy >= 3) points += 1;
  if (fullscreenExits >= 3) points += 1;
  if (shortcuts >= 3) points += 1;
  const rapidShare = timedResp.length >= 8 ? rapid / timedResp.length : 0;
  if (rapidShare > 0.3) points += 2;
  else if (rapidShare > 0.15) points += 1;
  if (mcqAnswered >= 10 && longestSameLetter >= 7) points += 2;
  else if (mcqAnswered >= 10 && longestSameLetter >= 6) points += 1;
  const rating: IntegrityRating = points === 0 ? "No concerns" : points <= 2 ? "Some concerns" : "Review needed";

  const notes: string[] = [];
  if (away) notes.push(`The test window was left ${away} time${away === 1 ? "" : "s"} during timed parts (about ${dur(awaySeconds)} in all). Short moments away are common at home; if results look unexpected, a gentle word with the family may help.`);
  if (endedForLeaving.length) notes.push(`${endedForLeaving.join(", ")} ended early because the pupil left ${endedForLeaving.length === 1 ? "it" : "them"} as many times as the school allows. Unanswered questions in ${endedForLeaving.length === 1 ? "that part" : "those parts"} count as wrong, so ${endedForLeaving.length === 1 ? "its" : "their"} results may underestimate the pupil.`);
  if (blur) notes.push(`Another window was in front of the test ${blur} time${blur === 1 ? "" : "s"} while it stayed open.`);
  if (otherSessions) notes.push("The assessment was opened in a second window or on another device while it was in progress. Only one window can answer at a time, so this may simply have been a change of device.");
  if (paste) notes.push(`Pasting was tried ${paste} time${paste === 1 ? "" : "s"} (it is switched off, so nothing was pasted). Worth reading the writing with this in mind.`);
  if (copy >= 1) notes.push(`Copying question text was tried ${copy} time${copy === 1 ? "" : "s"} (it is switched off).`);
  if (fullscreenExits) notes.push(`Full screen was left ${fullscreenExits} time${fullscreenExits === 1 ? "" : "s"}.`);
  if (shortcuts) notes.push(`Blocked keyboard shortcuts were pressed ${shortcuts} time${shortcuts === 1 ? "" : "s"}.`);
  if (rapidShare > 0.15) notes.push(`${rapid} of ${timedResp.length} answers were given in under ${RAPID_MS / 1000} seconds. This can mean guessing or tiredness, so the lowest results may underestimate what the pupil can do.`);
  if (mcqAnswered >= 10 && longestSameLetter >= 6) notes.push(`${longestSameLetter} answers in a row used the same letter. The options are shuffled for every pupil, so this is unusual by chance; it can be a sign of tiredness.`);
  if (unanswered / Math.max(1, auto.length) > 0.2) notes.push(`${unanswered} questions were left unanswered${timedOutSections.length ? ` (time ran out in ${timedOutSections.join(", ")})` : ""}.`);
  if (breaks.length) notes.push(`${breaks.length} break${breaks.length === 1 ? " was" : "s were"} taken (${dur(breakSeconds)} in all). Breaks are allowed: the clock pauses and the questions are hidden, so they are not a concern.`);
  if (!notes.length || rating === "No concerns") notes.unshift("No concerns: the assessment was completed in one window at a steady pace.");

  // Timeline (most useful first 80 entries).
  const timeline: IntegritySummary["timeline"] = [];
  for (const l of sectionsLog) {
    timeline.push({ t: l.started, section: l.key, text: `${titles.get(l.key) || l.key} started`, kind: "info" });
    timeline.push({ t: l.ended, section: l.key, text: `${titles.get(l.key) || l.key} finished${l.leftLimit ? " (ended: left too many times)" : l.timedOut ? " (time ran out)" : ""}`, kind: "info" });
  }
  for (const e of events) {
    if (["visible", "focus", "resize", "fullscreen_enter"].includes(e.type)) continue;
    let text = LABEL[e.type] || e.type;
    if (e.type === "hidden") {
      const back = events.find((x) => x.type === "visible" && new Date(x.t) > new Date(e.t));
      if (back) text += ` for ${dur(secs(e.t, back.t))}`;
    }
    if (e.type === "break_end") {
      const b = breaks.find((x) => x.end === e.t);
      if (b) text += ` after ${dur(secs(b.start, b.end as string))}`;
    }
    if (e.detail) text += ` (${e.detail})`;
    if (e.brk && e.type !== "break_start" && e.type !== "break_end") text += " during a break";
    const kind = e.type.startsWith("break_") ? "break" : e.type.startsWith("session_new") || e.type === "session_resumed" || e.type === "fullscreen_unavailable" ? "info" : "note";
    timeline.push({ t: e.t, section: e.section, text, kind });
  }
  timeline.sort((a, b) => a.t.localeCompare(b.t));

  return {
    rating, points,
    counts: { away, awaySeconds: Math.round(awaySeconds), blur, fullscreenExits, copy, paste, rightClick, shortcuts, otherSessions, breaks: breaks.length, breakSeconds: Math.round(breakSeconds), rapid, timed: timedResp.length, longestSameLetter, mcqAnswered },
    notes,
    timeline: timeline.slice(0, 120),
    tabHides: away, fastAnswers: rapid, answered: auto.length - unanswered, unanswered, timedOutSections, endedForLeaving,
  };
}
