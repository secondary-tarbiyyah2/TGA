import raw from "./syllabusIndex.json";

export type SpecUnit = { ref: string; title: string; paper: string; year: string; points: string[] };
export type SpecInfo = { subject: string; board: string; code: string; status: string; units: SpecUnit[] };
export type HubNode = { subject: string; ref: string; note: string };
export type Hub = { id: string; title: string; hook: string; nodes: HubNode[] };

const data = raw as unknown as { specs: Record<string, SpecInfo>; hubs: Hub[] };

export const specFor = (slug: string): SpecInfo | undefined => data.specs[slug];
export const specStatus = (slug: string): string | undefined => data.specs[slug]?.status;

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
