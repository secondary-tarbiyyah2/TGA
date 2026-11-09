import { HALF_TERMS, TERMS, halfTermFromTitle, loadUnits, sortUnits, type CurriculumUnit, type HalfTerm, type WeekPlan } from "@/lib/learn/curriculumUnits";
import { lessonUnitsFor, lessonUnitOfLesson, specFor, syllabusFor, type SpecInfo, type SyllabusInfo } from "@/lib/learn/syllabusIndex";

// The Syllabus pages: each subject's curriculum, Years 1 to 11, read from the Curriculum
// planner (table curriculum_units, the source of truth) with the built syllabusIndex.json as
// the fallback when the planner cannot be reached. Mirrors scripts/syllabus/model.mjs, which
// builds the PDF and Word pack from the same units.

/** Subjects in the order of the pack: core, Islamic, then foundation. One entry per pack document. */
export const PLAN_SUBJECTS = [
  { slug: "english", name: "English", ks13: "english", ks4: ["english-language", "english-literature"] },
  { slug: "mathematics", name: "Mathematics", ks13: "mathematics", ks4: ["mathematics"] },
  { slug: "science", name: "Science", ks13: "science", ks4: ["gcse-science"] },
  { slug: "quran", name: "Qur'an and Tajweed", ks13: "quran", ks4: [] },
  { slug: "arabic", name: "Arabic", ks13: "arabic", ks4: ["arabic"] },
  { slug: "islamic-studies", name: "Islamic Studies", ks13: "islamic-studies", ks4: ["islamic-studies"] },
  { slug: "history", name: "History", ks13: "history", ks4: [] },
  { slug: "geography", name: "Geography", ks13: "geography", ks4: ["geography"] },
  { slug: "computing", name: "Computing", ks13: "computing", ks4: ["computing"] },
  { slug: "art", name: "Art and Design", ks13: "art", ks4: [] },
  { slug: "pshe", name: "PSHE", ks13: "pshe", ks4: [] },
  { slug: "business", name: "Business", ks13: null, ks4: ["business"] },
] as const;
export type PlanSubject = (typeof PLAN_SUBJECTS)[number];

export type PlanUnit = {
  key: string;
  /** The unit's own subject (e.g. english-literature inside English). */
  slug: string;
  subject: string;
  kind: "syllabus" | "spec";
  year: string;
  halfTerm: HalfTerm | null;
  term: string;
  ref: string;
  paper: string;
  title: string;
  focus: string[];
  skills: string[];
  keyTerms: string[];
  assess: string;
  prereq: string;
  leadsTo: string;
  weeks: WeekPlan[];
  resources: string;
  foundingYear: string;
  position: number;
  /** KS4 only: lesson ids matched to the unit's points ("y10/12"). */
  lessons: string[];
};

export type PlanSource = { live: boolean; units: PlanUnit[] };

export const FOUNDING_NOTE = "Founding year: live lessons run from Monday 11 January to Friday 9 July 2027 (induction week 4 to 8 January). Each year group is taught its Spring 1 to Summer 2 units; Autumn units start in September 2027.";

export const isFoundingHalfTerm = (h: string | null) => !!h && !h.startsWith("autumn");
/** "Autumn 1: Moon Zoom!" -> "Moon Zoom!" */
export const focusTitle = (t: string) => t.replace(/^\s*(autumn|spring|summer)\s*[12]\s*[:\-.]\s*/i, "").trim();
const htIndex = (h: string | null) => {
  const i = HALF_TERMS.findIndex((x) => x.key === h);
  return i < 0 ? HALF_TERMS.length : i;
};
export const termOf = (u: Pick<PlanUnit, "term">) => TERMS.find((t) => u.term.toLowerCase().startsWith(t.toLowerCase())) || "Autumn";

const fromRow = (u: CurriculumUnit, specLessons: (slug: string, ref: string) => string[]): PlanUnit => ({
  key: u.id,
  slug: u.subject_slug,
  subject: u.subject,
  kind: u.kind,
  year: u.year,
  halfTerm: u.kind === "syllabus" ? u.half_term || halfTermFromTitle(u.title) : null,
  term: u.term || "",
  ref: u.ref || "",
  paper: u.paper || "",
  title: u.title,
  focus: u.focus || [],
  skills: u.skills || [],
  keyTerms: u.key_terms || [],
  assess: u.assess || "",
  prereq: u.prereq || "",
  leadsTo: u.leads_to || "",
  weeks: Array.isArray(u.weeks) ? u.weeks : [],
  resources: u.resources || "",
  foundingYear: u.founding_year || "",
  position: u.position,
  lessons: u.kind === "spec" && u.ref ? specLessons(u.subject_slug, u.ref) : [],
});

const specLessonsFromIndex = (slug: string, ref: string) => specFor(slug)?.units.find((x) => x.ref === ref)?.lessons || [];

/** The built index, as units (used when the planner is unavailable). */
export function unitsFromIndex(): PlanUnit[] {
  const out: PlanUnit[] = [];
  for (const s of PLAN_SUBJECTS) {
    const syl = s.ks13 ? syllabusFor(s.ks13) : undefined;
    if (syl && s.ks13) {
      let pos = 0;
      for (const [y, us] of Object.entries(syl.years))
        for (const u of us)
          out.push({
            key: `${s.ks13}/${y}/${pos}`,
            slug: s.ks13,
            subject: syl.subject,
            kind: "syllabus",
            year: y,
            halfTerm: ((u.halfTerm as HalfTerm) || halfTermFromTitle(u.unit)) ?? null,
            term: "",
            ref: "",
            paper: "",
            title: u.unit,
            focus: u.focus,
            skills: u.skills,
            keyTerms: u.keyTerms,
            assess: u.assess,
            prereq: u.prereq || "",
            leadsTo: u.leadsTo || "",
            weeks: u.weeks || [],
            resources: u.resources || "",
            foundingYear: u.foundingYear || "",
            position: pos++,
            lessons: [],
          });
    }
    for (const k of s.ks4) {
      const sp = specFor(k);
      sp?.units.forEach((u, pos) =>
        out.push({ key: `${k}/${u.ref}`, slug: k, subject: sp.subject, kind: "spec", year: u.year.toLowerCase(), halfTerm: null, term: u.term || "", ref: u.ref, paper: u.paper, title: u.title, focus: u.points, skills: [], keyTerms: u.keyTerms || [], assess: "", prereq: "", leadsTo: "", weeks: u.weeks || [], resources: "", foundingYear: "", position: pos, lessons: u.lessons }),
      );
    }
  }
  return out;
}

/** Live units from the Curriculum planner, or the built index if the planner cannot be read. */
export async function loadPlan(): Promise<PlanSource> {
  try {
    const rows = await loadUnits();
    if (rows.length) return { live: true, units: sortUnits(rows).map((u) => fromRow(u, specLessonsFromIndex)) };
  } catch {
    /* fall back to the published copy */
  }
  return { live: false, units: unitsFromIndex() };
}

export type SubjectPlan = {
  subject: PlanSubject;
  syllabus: SyllabusInfo | undefined;
  specs: { slug: string; info: SpecInfo }[];
  /** Years 1 to 9 units by year, each in half-term order. */
  years: Record<string, PlanUnit[]>;
  /** Years 10 and 11 units by spec slug, then year. */
  specUnits: Record<string, Record<string, PlanUnit[]>>;
  yearKeys: string[];
  unitCount: number;
};

const YEAR_ORDER = ["reception", "y1", "y2", "y3", "y4", "y5", "y6", "y7", "y8", "y9", "y10", "y11"];

export function subjectPlan(subject: PlanSubject, units: PlanUnit[]): SubjectPlan {
  const syllabus = subject.ks13 ? syllabusFor(subject.ks13) : undefined;
  const specs = (subject.ks4 as readonly string[]).map((slug): { slug: string; info: SpecInfo | undefined } => ({ slug, info: specFor(slug) })).filter((x): x is { slug: string; info: SpecInfo } => !!x.info);
  const years: Record<string, PlanUnit[]> = {};
  units
    .filter((u) => u.kind === "syllabus" && u.slug === subject.ks13)
    .sort((a, b) => htIndex(a.halfTerm) - htIndex(b.halfTerm) || a.position - b.position)
    .forEach((u) => (years[u.year] ||= []).push(u));
  const specUnits: SubjectPlan["specUnits"] = {};
  units
    .filter((u) => u.kind === "spec" && (subject.ks4 as readonly string[]).includes(u.slug))
    .sort((a, b) => a.position - b.position)
    .forEach((u) => ((specUnits[u.slug] ||= {})[u.year] ||= []).push(u));
  const yearKeys = [...new Set([...Object.keys(years), ...Object.values(specUnits).flatMap((m) => Object.keys(m))])].sort((a, b) => YEAR_ORDER.indexOf(a) - YEAR_ORDER.indexOf(b));
  const unitCount = Object.values(years).reduce((n, l) => n + l.length, 0) + Object.values(specUnits).reduce((n, m) => n + Object.values(m).reduce((k, l) => k + l.length, 0), 0);
  return { subject, syllabus, specs, years, specUnits, yearKeys, unitCount };
}

/** Units of a year in teaching order (KS4: by term, then the board's order). */
export function unitsOfYear(p: SubjectPlan, year: string): PlanUnit[] {
  if (p.years[year]) return p.years[year];
  const out: PlanUnit[] = [];
  for (const s of p.specs) {
    const list = p.specUnits[s.slug]?.[year] || [];
    for (const t of TERMS) out.push(...list.filter((u) => termOf(u) === t));
  }
  return out;
}

const STOP = new Set(["the", "and", "of", "in", "to", "a", "for", "unit", "with", "on", "an", "our", "my", "from", "autumn", "spring", "summer", "part"]);
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

export type LessonLink = { slug: string; year: string; unit: string; count: number; matched: boolean };

/**
 * Lesson library units to link from a unit: for KS4, the units of the lessons matched to its
 * points; for Years 1 to 9, the year's units with a matching name first, then the rest.
 */
export function lessonLinks(u: PlanUnit): LessonLink[] {
  const all = lessonUnitsFor(u.slug, u.year);
  if (u.kind === "spec") {
    const names = new Set(u.lessons.map((id) => lessonUnitOfLesson(u.slug, id)).filter(Boolean) as string[]);
    return all.filter(([name]) => names.has(name)).map(([unit, count]) => ({ slug: u.slug, year: u.year, unit, count, matched: true }));
  }
  const mine = new Set(words(focusTitle(u.title)));
  return all
    .map(([unit, count]) => {
      const w = words(unit.replace(/^unit\s*\d+\s*:\s*/i, ""));
      const shared = w.filter((x) => mine.has(x)).length;
      return { slug: u.slug, year: u.year, unit, count, matched: shared > 0 && shared / Math.max(1, Math.min(w.length, mine.size)) >= 0.5 };
    })
    .sort((a, b) => Number(b.matched) - Number(a.matched));
}

/** Where a subject's pack documents live in the lesson-decks bucket (scripts/syllabus/build.mjs). */
export const PACK_ROOT = "syllabus-pack";
export const PACK_SUBJECT_DIR = (slug: string) => `${PACK_ROOT}/01_Subjects/${slug}`;
export const PACK_OVERVIEW_DIR = `${PACK_ROOT}/00_Start_Here`;
export const PACK_MATRIX_DIR = `${PACK_ROOT}/02_Cross_Curricular_Matrices`;
