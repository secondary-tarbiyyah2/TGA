import raw from "./syllabusIndex.json";

/** pl: for each point, the ids ("y10/12") of the lessons that teach it; lessons: every lesson id mapped to the unit. */
export type SpecUnit = { ref: string; title: string; paper: string; year: string; points: string[]; pl: string[][]; lessons: string[] };
export type Paper = { paper: string; title: string; duration: string; marks: number | string; weight: string; content: string; format: string };
export type SpecInfo = {
  subject: string;
  board: string;
  code: string;
  label: string;
  status: string;
  statusNote: string;
  qualification: string;
  tiers: string;
  nonExam: string;
  assessment: Paper[];
  aos: { code: string; desc: string; weight: string }[];
  commandWords: { word: string; meaning: string }[];
  gaps: string[];
  units: SpecUnit[];
};
export type SyllabusUnit = { unit: string; focus: string[]; skills: string[]; keyTerms: string[]; assess: string };
export type SyllabusInfo = { subject: string; framework: string; status: string; statusNote: string; years: Record<string, SyllabusUnit[]> };
export type HubNode = { subject: string; ref: string; note: string };
export type Hub = { id: string; title: string; hook: string; nodes: HubNode[] };

const data = raw as unknown as { specs: Record<string, SpecInfo>; syllabi: Record<string, SyllabusInfo>; hubs: Hub[] };

export const specFor = (slug: string): SpecInfo | undefined => data.specs[slug];
export const syllabusFor = (slug: string): SyllabusInfo | undefined => data.syllabi[slug];
export const specStatus = (slug: string): string | undefined => data.specs[slug]?.status ?? data.syllabi[slug]?.status;
export const allHubs = (): Hub[] => data.hubs;

/** Syllabus units for a year whose name overlaps the library unit's name (Reception to Year 9). */
export function matchSyllabusUnits(slug: string, year: string, unitName: string, max = 3): SyllabusUnit[] {
  const units = data.syllabi[slug]?.years[year] || [];
  const uw = new Set(words(unitName));
  return units
    .map((u) => {
      const tw = words(u.unit);
      return { u, score: tw.length ? tw.filter((w) => uw.has(w)).length / tw.length : 0 };
    })
    .filter((x) => x.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.u);
}

const STOP = new Set(["the", "and", "of", "in", "to", "a", "for", "unit", "spec", "section", "topic", "topics", "with", "on", "an"]);
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

/** Spec units that look like the library unit: a spec reference in its name, else title word overlap. Suggestions only. */
export function matchSpecUnits(slug: string, unitName: string, max = 4): SpecUnit[] {
  const spec = specFor(slug);
  if (!spec) return [];
  const refs = new Set((unitName.match(/\d+(?:\.\d+)+|\b\d[A-Z]\b/g) || []).map((r) => r.toLowerCase()));
  const uw = new Set(words(unitName));
  const scored = spec.units.map((u) => {
    let score = 0;
    if (refs.has(u.ref.toLowerCase())) score += 5;
    const tw = words(u.title);
    const shared = tw.filter((w) => uw.has(w)).length;
    if (tw.length) score += (shared / tw.length) * 3;
    return { u, score };
  });
  return scored
    .filter((s) => s.score >= 1.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((s) => s.u);
}

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").trim();

/** Hubs that include this subject. Subject names are matched loosely ("English" matches "English Language"). */
export function hubsForSubject(subjectName: string): Hub[] {
  const n = norm(subjectName);
  if (!n) return [];
  return data.hubs.filter((h) => h.nodes.some((x) => { const m = norm(x.subject); return m === n || m.startsWith(n) || n.startsWith(m); }));
}

export const sameSubject = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  return x === y || x.startsWith(y) || y.startsWith(x);
};

/**
 * One consistent board label per KS4 subject ("Pearson Edexcel 4BS1"). A lesson's own board text is replaced only when it
 * agrees with the specification (no code, or the spec's code). A different code, e.g. an older AQA or UK GCSE lesson, is left as written.
 */
export function boardLabel(slug: string, board: string | null, year: string): string | null {
  const spec = data.specs[slug];
  const b = (board || "").trim();
  if (!spec || (year !== "y10" && year !== "y11")) return b || null;
  const codes = b.match(/\b\d[A-Z0-9]{3,4}\b|\b8\d{3}\b/g) || [];
  const specCodes = spec.code.match(/\b\d[A-Z0-9]{3,4}\b|\b8\d{3}\b/g) || [];
  const agrees = !b || codes.length === 0 ? true : codes.every((c) => specCodes.includes(c));
  return agrees ? spec.label : b;
}
