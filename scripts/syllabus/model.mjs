// The syllabus pack's document model: one curriculum document per subject (Years 1 to 11) and a
// whole-school overview. Built from content/syllabus (kept in step with the portal's Curriculum
// planner by the sync). Renderers turn the model into PDF (render-pdf.mjs, via HTML) and Word
// (render-docx.mjs), so both formats share one structure.
//
// A document is { title, subtitle, accent, kicker, facts, sections: [{ id, title, blocks, wide? }] }.
// Blocks: p, lead, note, bullets, kv, table, ltp (half-term grid), route (KS4 term grid),
// unit (a Years 1-9 unit page), specunit (a KS4 specification unit), callout, h3, yearhead.
import { clean } from "./lib.mjs";
import { themeFor } from "../lessons/deck-parts.mjs";

export const HALF_TERMS = [
  { key: "autumn1", label: "Autumn 1" },
  { key: "autumn2", label: "Autumn 2" },
  { key: "spring1", label: "Spring 1" },
  { key: "spring2", label: "Spring 2" },
  { key: "summer1", label: "Summer 1" },
  { key: "summer2", label: "Summer 2" },
];
export const YEAR_KEYS = ["reception", "y1", "y2", "y3", "y4", "y5", "y6", "y7", "y8", "y9", "y10", "y11"];
export const yearName = (y) => (y === "reception" ? "Reception" : /^y\d+$/i.test(y) ? `Year ${String(y).slice(1)}` : clean(y));
const stepYear = (k) => (/^Y?\d+$/i.test(k) ? `Year ${k.replace(/^Y/i, "")}` : k);

/** The founding year (owner, 9 Nov 2026): induction 4 to 8 Jan, live lessons from Mon 11 Jan to Fri 9 Jul 2027. */
export const FOUNDING_YEAR =
  "Founding year: the school opens in January 2027 (induction week 4 to 8 January, first live lessons Monday 11 January, term ends Friday 9 July). In 2026 to 2027 each year group is taught its Spring 1 to Summer 2 units; Autumn units are taught in full from September 2027.";

/** Subjects in the order staff and inspectors expect: core, then Islamic, then foundation. */
export const SUBJECTS = [
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
];

/** "Autumn 1: Dinosaur Planet" -> "autumn1". */
export function halfTermOf(u) {
  if (u.halfTerm && HALF_TERMS.some((h) => h.key === u.halfTerm)) return u.halfTerm;
  const m = String(u.unit || "").match(/^\s*(autumn|spring|summer)\s*([12])\b/i);
  return m ? `${m[1].toLowerCase()}${m[2]}` : null;
}
/** The unit title without its "Autumn 1:" prefix. */
export const focusTitle = (t) => clean(t).replace(/^\s*(autumn|spring|summer)\s*[12]\s*[:\-.]\s*/i, "");
const htLabel = (k) => HALF_TERMS.find((h) => h.key === k)?.label || "Not yet placed";
const isAutumn = (k) => k === "autumn1" || k === "autumn2";

/** Group the loaded files by subject. */
export function subjectsFrom(pack) {
  const k13 = new Map(pack.ks13.map((d) => [d.slug, d]));
  const k4 = new Map(pack.ks4.map((d) => [d.slug, d]));
  return SUBJECTS.map((s) => ({ ...s, syl: s.ks13 ? k13.get(s.ks13) || null : null, specs: s.ks4.map((x) => k4.get(x)).filter(Boolean) })).filter((s) => s.syl || s.specs.length);
}

const sortedYears = (yearMap) => Object.keys(yearMap || {}).sort((a, b) => YEAR_KEYS.indexOf(a) - YEAR_KEYS.indexOf(b));
/** "Pearson Edexcel International GCSE (9-1) English Literature (4ET1)", without repeating the board when the qualification already names it. */
const qualName = (board, qual) => {
  const q = clean(qual);
  const b = clean(board).replace(/\s*\(.*?\)\s*/g, " ").trim();
  return new RegExp(`^${b.split(" ")[0]}`, "i").test(q) ? q : `${b} ${q}`;
};
const examLabel = (d) => (d.examEntry ? `${qualName(d.examEntry.board, d.examEntry.qualification)} (${d.examEntry.code})` : `${qualName(d.board, d.qualification)} (${clean(d.code)})`);
const taughtLabel = (d) => `${qualName(d.board, d.qualification)} (${clean(d.code)})`;
const specShort = (d) => (d.examEntry ? `${d.examEntry.board} ${d.examEntry.code}` : `${clean(d.board).replace(/\s*\(.*?\)\s*/g, " ").trim()} ${clean(d.code)}`);

/** Units of a year by half term: { autumn1: [u...], ..., none: [u...] }. */
function byHalfTerm(units) {
  const out = Object.fromEntries([...HALF_TERMS.map((h) => [h.key, []]), ["none", []]]);
  units.forEach((u) => out[halfTermOf(u) || "none"].push(u));
  return out;
}

const TERM_ORDER = ["Autumn", "Spring", "Summer"];
const termOf = (u) => TERM_ORDER.find((t) => clean(u.term).toLowerCase().startsWith(t.toLowerCase())) || "Autumn";

function ltpBlock(syl) {
  const years = sortedYears(syl.yearMap).filter((y) => y !== "y10" && y !== "y11");
  return {
    t: "ltp",
    caption: `${syl.subject}: long-term plan, ${yearName(years[0])} to ${yearName(years[years.length - 1])}`,
    columns: HALF_TERMS.map((h) => h.label),
    autumnNote: "From September 2027",
    rows: years.map((y) => {
      const g = byHalfTerm(syl.yearMap[y]);
      return { label: yearName(y), cells: HALF_TERMS.map((h) => g[h.key].map((u) => focusTitle(u.unit))), extra: g.none.map((u) => focusTitle(u.unit)) };
    }),
  };
}

function routeBlock(spec) {
  const cell = (y, t) => spec.units.filter((u) => u.year === y && termOf(u) === t).map((u) => `${u.ref}  ${clean(u.title)}`);
  return {
    t: "route",
    caption: `${spec.subject}: ${taughtLabel(spec)}${spec.examEntry ? `, entered for ${specShort(spec)}` : ""}`,
    columns: TERM_ORDER,
    rows: ["Y10", "Y11"].map((y) => ({ label: yearName(y.toLowerCase()), cells: TERM_ORDER.map((t) => cell(y, t)) })),
  };
}

function unitBlock(u, year, coverageUnits) {
  const ht = halfTermOf(u);
  return {
    t: "unit",
    halfTerm: htLabel(ht),
    founding: ht ? (isAutumn(ht) ? "From September 2027" : "Taught in the founding year") : "",
    year: yearName(year),
    title: focusTitle(u.unit),
    knowledge: (u.focus || []).map(clean).filter(Boolean),
    skills: (u.skills || []).map(clean).filter(Boolean),
    vocabulary: (u.keyTerms || []).map(clean).filter(Boolean),
    assess: clean(u.assess),
    prior: clean(u.prereq),
    leadsTo: clean(u.leadsTo),
    resources: clean(u.resources),
    foundingYear: clean(u.foundingYear),
    weeks: (Array.isArray(u.weeks) ? u.weeks : []).map((w, i) => ({ week: String(w.week ?? i + 1), lessons: (w.lessons || []).map(clean).filter(Boolean), vocabulary: (w.vocabulary || []).map(clean).filter(Boolean), home: clean(w.home) })),
    lessons: coverageUnits || [],
  };
}

const lessonId = (id) => id.replace(/^y(\d+)\/(\d+)$/, "Y$1 L$2");

function specUnitBlock(spec, u, cov) {
  const cu = cov?.units?.find((x) => x.ref === u.ref);
  const links = (spec.links || []).filter((l) => l.unitRef && clean(l.unitRef) === clean(u.ref)).map((l) => `${l.with}: ${clean(l.topic)}`);
  return {
    t: "specunit",
    ref: clean(u.ref),
    title: clean(u.title),
    meta: [u.paper, yearName(String(u.year).toLowerCase()), u.term].filter(Boolean).map(clean).join(" · "),
    points: (u.points || []).map(clean),
    keyTerms: (u.keyTerms || []).map(clean),
    lessons: cu ? cu.lessons.map(lessonId) : [],
    covered: cu ? `${cu.covered} of ${cu.total} points matched to lessons` : "",
    weeks: (Array.isArray(u.weeks) ? u.weeks : []).map((w, i) => ({ week: String(w.week ?? i + 1), lessons: (w.lessons || []).map(clean).filter(Boolean), vocabulary: (w.vocabulary || []).map(clean).filter(Boolean), home: clean(w.home) })),
    links,
  };
}

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** One subject's curriculum document, Years 1 to 11. */
export function subjectDocument(s, coverage = {}) {
  const th = themeFor(s.slug === "english" ? "english" : s.ks13 || s.ks4[0]);
  const syl = s.syl;
  const specs = s.specs;
  const years = syl ? sortedYears(syl.yearMap) : [];
  const span = [years[0], specs.length ? "y11" : years[years.length - 1]].filter(Boolean);
  const yearSpan = span.length ? `${yearName(span[0])} to ${yearName(span[span.length - 1])}` : "";
  const unitCount = years.reduce((n, y) => n + syl.yearMap[y].length, 0) + specs.reduce((n, d) => n + d.units.length, 0);
  const sections = [];

  // 1 Intent
  {
    const blocks = [];
    blocks.push({ t: "lead", text: `${s.name} at Tarbiyyah Global Academy is part of a British curriculum taught with tarbiyyah: nurturing character and faith alongside knowledge. This document sets out what is taught in each year, in what order, and how it is checked.` });
    if (syl?.purpose?.length) blocks.push({ t: "h3", text: "Why we teach it" }, { t: "bullets", items: syl.purpose.map(clean) });
    const links = (syl?.links || []).filter((l) => /islam|qur|arabic/i.test(l.with));
    if (links.length) {
      blocks.push({ t: "h3", text: "How it connects with Qur'an, Arabic and Islamic Studies" });
      blocks.push({ t: "table", head: ["Subject", "Topic", "Years", "How they connect"], widths: [1.3, 1.8, 0.8, 4], rows: links.map((l) => [l.with, clean(l.topic), clean(l.years), clean(l.how)]) });
    }
    const facts = [];
    if (syl) facts.push(["Years 1 to 9", clean(syl.framework)]);
    specs.forEach((d) => facts.push([`Years 10 and 11${specs.length > 1 ? `: ${d.subject}` : ""}`, d.examEntry ? `Taught from ${taughtLabel(d)}; pupils are entered for ${examLabel(d)}` : taughtLabel(d)]));
    if (!specs.length && years.length) facts.push(["Years 10 and 11", syl?.toKS4 ? "No examined course in this pack; see Progression." : "Not taught as a separate subject."]);
    facts.push(["Status", [syl, ...specs].filter(Boolean).map((d) => `${d.status}${[syl, ...specs].filter(Boolean).length > 1 ? ` (${d.kind === "spec" ? d.subject : "Years 1 to 9"})` : ""}`).join("; ")]);
    blocks.push({ t: "h3", text: "At a glance" }, { t: "kv", rows: facts });
    blocks.push({ t: "callout", title: "Founding year 2027", text: FOUNDING_YEAR });
    sections.push({ id: "intent", title: "Intent", blocks });
  }

  // 2 Long-term plan
  if (syl || specs.length) {
    const blocks = [];
    if (syl && years.some((y) => y !== "y10" && y !== "y11")) {
      blocks.push({ t: "p", text: "One unit for each half term. Columns shaded gold are taught in the founding year (Spring 1 to Summer 2, 2027); Autumn units start in September 2027.", muted: true });
      blocks.push(ltpBlock(syl));
    }
    sections.push({ id: "ltp", title: "Long-term plan", blocks, wide: true });
    if (specs.length) {
      const rb = [{ t: "p", text: "Years 10 and 11 follow the awarding body's specification. Units sit in the term the school recommends; the board allows flexible sequencing. References are the board's own.", muted: true }];
      specs.forEach((d) => rb.push(routeBlock(d)));
      sections.push({ id: "route", title: "Specification route, Years 10 and 11", blocks: rb, wide: true });
    }
  }

  // 3 Years 1 to 9, unit by unit
  if (syl) {
    for (const y of years) {
      const g = byHalfTerm(syl.yearMap[y]);
      const ordered = [...HALF_TERMS.flatMap((h) => g[h.key]), ...g.none];
      const blocks = [{ t: "yearhead", year: yearName(y), strip: HALF_TERMS.map((h) => ({ label: h.label, title: g[h.key].map((u) => focusTitle(u.unit)).join("; "), founding: !isAutumn(h.key) })), count: `${plural(ordered.length, "unit")}${g.none.length === 0 && HALF_TERMS.every((h) => g[h.key].length === 1) ? ", one for each half term" : ""}` }];
      ordered.forEach((u) => blocks.push(unitBlock(u, y)));
      sections.push({ id: `year-${y}`, title: `${yearName(y)}`, group: "Units year by year", blocks });
    }
  }

  // 4 Years 10 and 11, specification units
  for (const d of specs) {
    const cov = coverage[d.slug];
    for (const y of ["Y10", "Y11"]) {
      const us = d.units.filter((u) => u.year === y);
      if (!us.length) continue;
      const blocks = [];
      if (y === "Y10" && d === specs[0] && syl?.toKS4) blocks.push({ t: "callout", title: "From Year 9 to Year 10", text: clean(syl.toKS4) });
      blocks.push({ t: "p", text: `${taughtLabel(d)}${d.examEntry ? `, entered for ${specShort(d)}` : ""}. Points are paraphrased from the board's specification; numbers after the reference are this document's own. Always teach from the board's own document.`, muted: true });
      TERM_ORDER.forEach((t) => {
        const tu = us.filter((u) => termOf(u) === t);
        if (!tu.length) return;
        blocks.push({ t: "h3", text: `${t} term` });
        tu.forEach((u) => blocks.push(specUnitBlock(d, u, cov)));
      });
      sections.push({ id: `spec-${d.slug}-${y.toLowerCase()}`, title: `${yearName(y.toLowerCase())}${specs.length > 1 ? `: ${d.subject}` : ""}`, group: "Units year by year", blocks });
    }
  }

  // 5 Progression
  if (syl?.progression?.length || (syl?.toKS4 && !specs.length)) {
    const blocks = [];
    if (syl.progression?.length) {
      const cols = [...new Set(syl.progression.flatMap((p) => Object.keys(p.steps || {})))].sort((a, b) => YEAR_KEYS.indexOf(a.toLowerCase().replace(/^year\s*/, "y")) - YEAR_KEYS.indexOf(b.toLowerCase().replace(/^year\s*/, "y")));
      blocks.push({ t: "p", text: "How the key ideas of the subject build from year to year. Each strand shows the milestone reached by the end of that year.", muted: true });
      blocks.push({ t: "progression", columns: cols.map(stepYear), rows: syl.progression.map((p) => ({ label: clean(p.thread), cells: cols.map((c) => clean(p.steps?.[c])) })) });
    }
    if (syl.toKS4 && !specs.length) blocks.push({ t: "h3", text: "Looking ahead to Years 10 and 11" }, { t: "p", text: clean(syl.toKS4) });
    sections.push({ id: "progression", title: "Progression across the years", blocks, wide: (syl.progression || []).length > 0 });
  }

  // 6 Assessment
  {
    const blocks = [];
    if (syl) {
      blocks.push({ t: "p", text: "Every unit ends with a check of what pupils know and can do. Formal assessments use Teams Forms; revision quizzes run in the portal.", muted: true });
      blocks.push({ t: "h3", text: "How each unit is checked, Years 1 to 9" });
      const rows = [];
      for (const y of years) {
        const g = byHalfTerm(syl.yearMap[y]);
        [...HALF_TERMS.flatMap((h) => g[h.key].map((u) => [h.label, u])), ...g.none.map((u) => ["", u])].forEach(([h, u], i) => rows.push([i === 0 ? yearName(y) : "", h, focusTitle(u.unit), clean(u.assess) || "Not recorded"]));
      }
      blocks.push({ t: "table", head: ["Year", "Half term", "Unit", "How it is checked"], widths: [0.8, 0.9, 2.6, 3.4], rows, groupFirst: true });
    }
    for (const d of specs) {
      blocks.push({ t: "h3", text: `${d.subject}: how it is examined` });
      if (d.examEntry) {
        const x = d.examEntry;
        blocks.push({ t: "callout", title: `Exam entry: ${examLabel(d)}`, text: clean(x.summary || ""), items: (x.notes || []).map(clean) });
        blocks.push({ t: "kv", rows: [["Papers", clean(x.papers)], ["Exam series", clean(x.series)], ["Tiers", clean(x.tier)], ["Private candidates", clean(x.privateCandidates)]].filter((r) => r[1]) });
        blocks.push({ t: "p", text: `The course is taught from ${taughtLabel(d)}, examined as follows:`, muted: true });
      }
      blocks.push({ t: "table", head: ["Paper", "Title", "Time", "Marks", "Weight", "What is examined"], widths: [0.9, 1.6, 0.9, 0.6, 0.6, 3.4], rows: (d.assessment || []).map((a) => [a.paper, clean(a.title), clean(a.duration), String(a.marks), clean(a.weight), `${clean(a.content)}${a.format ? `. ${clean(a.format)}` : ""}`]) });
      if (d.nonExam && !/^none/i.test(d.nonExam)) blocks.push({ t: "kv", rows: [["Non-examined", clean(d.nonExam)]] });
      if ((d.aos || []).length) blocks.push({ t: "table", head: ["Objective", "What it assesses", "Weight"], widths: [0.8, 5.4, 0.9], rows: d.aos.map((a) => [a.code, clean(a.desc), clean(a.weight)]) });
      if ((d.commandWords || []).length) blocks.push({ t: "terms", title: "Command words", items: d.commandWords.map((c) => [c.word, clean(c.meaning)]) });
    }
    sections.push({ id: "assessment", title: "Assessment overview", blocks });
  }

  // 7 Coverage
  {
    const blocks = [];
    for (const d of specs) {
      const c = coverage[d.slug];
      if (!c) continue;
      blocks.push({ t: "h3", text: `${d.subject}: specification coverage` });
      blocks.push({ t: "p", text: `${c.covered} of ${c.points} specification points are matched to one or more of our ${c.lessonCount} lessons. Matches are suggested from the lesson wording and signed off by a teacher in the Lesson library.`, muted: true });
      blocks.push({ t: "table", head: ["Ref", "Unit", "Year", "Points matched", "Lessons"], widths: [0.8, 2.6, 0.5, 0.9, 2.6], rows: c.units.map((u) => [u.ref, clean(u.title), u.year || "", `${u.covered} of ${u.total}`, u.lessons.length ? u.lessons.map(lessonId).join(", ") : "None yet"]), flag: 3 });
    }
    if (syl?.keyStages?.length) {
      blocks.push({ t: "h3", text: `${clean(syl.framework)}` });
      blocks.push({ t: "p", text: "The statutory content the units above are planned to cover, paraphrased and grouped by key stage. The year allocation of units is the school's recommended sequence.", muted: true });
      for (const ks of syl.keyStages) blocks.push({ t: "table", head: [`${ks.ks}: ${clean(ks.years)}`, "What pupils should be taught"], widths: [1.6, 5.4], rows: ks.strands.map((st) => [clean(st.strand), st.statements.map(clean)]) });
    }
    const links = [...(syl?.links || []), ...specs.flatMap((d) => (d.links || []).map((l) => ({ ...l, years: l.years || (l.unitRef ? `KS4 ${l.unitRef}` : "") })))];
    if (links.length) {
      blocks.push({ t: "h3", text: "Cross-curricular links" });
      blocks.push({ t: "table", head: ["Subject", "Topic", "Where", "How the subjects connect"], widths: [1.2, 1.9, 0.9, 3.6], rows: links.map((l) => [l.with, clean(l.topic), clean(l.years), clean(l.how)]) });
    }
    if (blocks.length) sections.push({ id: "coverage", title: "Coverage", blocks });
  }

  // 8 Sources
  {
    const blocks = [];
    for (const d of [syl, ...specs].filter(Boolean)) {
      blocks.push({ t: "h3", text: d.kind === "spec" ? `${d.subject}: ${d.board} ${clean(d.code)}` : `${d.subject}: Years 1 to 9` });
      blocks.push({ t: "kv", rows: [["Status", `${d.status}. ${clean(d.statusNote)}`]] });
      if ((d.sources || []).length) blocks.push({ t: "sources", items: d.sources.map((x) => [clean(x.title), clean(x.url)]) });
      if ((d.gaps || []).length) blocks.push({ t: "bullets", title: "Open items to confirm", items: d.gaps.map(clean) });
      if (d.contextNote) blocks.push({ t: "kv", rows: [["Teaching note", clean(d.contextNote)]] });
    }
    sections.push({ id: "sources", title: "Sources and verification", blocks });
  }

  return {
    kind: "subject",
    slug: s.slug,
    title: s.name,
    kicker: "Curriculum plan 2026 to 2027",
    subtitle: `${yearSpan}${specs.length ? `, with ${specs.map((d) => specShort(d)).join(" and ")}` : ""}`,
    accent: th.accent,
    dark: th.dark,
    soft: th.soft,
    facts: [
      ["Years", yearSpan],
      ["Units", String(unitCount)],
      ...(syl ? [["Framework", clean(syl.framework).replace(/:.*$/, "")]] : []),
      ...specs.map((d) => [specs.length > 1 ? d.subject : "Exam", examLabel(d)]),
    ],
    header: `${s.name} curriculum`,
    sections,
  };
}

/** The whole-school overview: every subject's long-term plan by year group. */
export function overviewDocument(pack, coverage = {}) {
  const subs = subjectsFrom(pack);
  const sections = [];
  sections.push({
    id: "about",
    title: "About this document",
    blocks: [
      { t: "lead", text: "Tarbiyyah Global Academy is an online British school from Year 1 to Year 11. The curriculum follows the National Curriculum in England for Years 1 to 9 and Pearson Edexcel International GCSE courses in Years 10 and 11, taught with tarbiyyah: nurturing character and faith alongside knowledge." },
      { t: "p", text: "This overview shows what every year group studies, half term by half term. Each subject has its own curriculum document in the pack with the unit-by-unit detail: what is taught, the skills and vocabulary, how it is checked, and the week-by-week plan where one has been written." },
      { t: "h3", text: "Where the plan comes from" },
      { t: "bullets", items: [
        "The units are held in the school portal's Curriculum planner, where staff edit them. This document is rebuilt automatically after every change.",
        "Years 1 to 6 follow the order of Tarbiyyah Primary's long-term plan; Years 7 to 11 follow the Tarbiyyah Secondary curriculum overview, adapted for an online school.",
        "Specification and National Curriculum wording is paraphrased. Teachers teach and enter pupils from the awarding body's own documents.",
      ] },
      { t: "callout", title: "Founding year 2027", text: FOUNDING_YEAR },
    ],
  });
  // Subjects by year
  {
    const ys = ["y1", "y2", "y3", "y4", "y5", "y6", "y7", "y8", "y9", "y10", "y11"];
    const rows = subs.map((s) => [s.name, ...ys.map((y) => (y === "y10" || y === "y11" ? (s.specs.length ? s.specs.map((d) => (d.examEntry?.code || clean(d.code)).split(/[ ,/]/)[0]).join(", ") : s.syl?.yearMap?.[y] ? "Yes" : "") : s.syl?.yearMap?.[y] ? String(s.syl.yearMap[y].length) : ""))]);
    sections.push({ id: "subjects", title: "Subjects by year group", blocks: [
      { t: "p", text: "Years 1 to 9: the number of units in the year. Years 10 and 11: the exam code pupils are entered for.", muted: true },
      { t: "matrix", head: ["Subject", ...ys.map((y) => y.toUpperCase())], rows },
    ], wide: true });
  }
  // One grid per year 1-9
  for (const y of ["y1", "y2", "y3", "y4", "y5", "y6", "y7", "y8", "y9"]) {
    const rows = subs.filter((s) => s.syl?.yearMap?.[y]?.length).map((s) => {
      const g = byHalfTerm(s.syl.yearMap[y]);
      return { label: s.name, cells: HALF_TERMS.map((h) => g[h.key].map((u) => focusTitle(u.unit))), extra: g.none.map((u) => focusTitle(u.unit)) };
    });
    if (!rows.length) continue;
    sections.push({ id: `ltp-${y}`, title: `${yearName(y)} long-term plan`, group: "Long-term plans", blocks: [{ t: "ltp", caption: "", columns: HALF_TERMS.map((h) => h.label), autumnNote: "From September 2027", rows }], wide: true });
  }
  // Years 10-11
  for (const y of ["Y10", "Y11"]) {
    const rows = subs.flatMap((s) => s.specs.map((d) => ({ label: `${s.specs.length > 1 ? d.subject : s.name}\n${specShort(d)}`, cells: TERM_ORDER.map((t) => d.units.filter((u) => u.year === y && termOf(u) === t).map((u) => `${u.ref}  ${clean(u.title)}`)) })));
    sections.push({ id: `route-${y.toLowerCase()}`, title: `${yearName(y.toLowerCase())} specification route`, group: "Long-term plans", blocks: [{ t: "route", caption: "", columns: TERM_ORDER, rows, dense: true }], wide: true });
  }
  // Exams
  sections.push({ id: "exams", title: "Examinations", blocks: [
    { t: "p", text: "Every pupil sits Pearson Edexcel International GCSEs. Where a course is taught from a UK GCSE specification, the subject document lists what teachers add or change for the International GCSE papers.", muted: true },
    { t: "table", head: ["Subject", "Taught from", "Pupils are entered for", "Papers"], widths: [1.2, 2, 2.2, 3.4], rows: pack.ks4.map((d) => [d.subject, `${d.board} ${clean(d.code)}`, examLabel(d), d.examEntry ? clean(d.examEntry.papers) : (d.assessment || []).map((a) => `${a.paper}: ${clean(a.duration)}, ${clean(a.weight)}`).join("; ")]) },
  ] });
  // Verification
  sections.push({ id: "verification", title: "Verification status", blocks: [
    { t: "p", text: "Verified: structure and content were read from the official source. Provisional: something is still to be confirmed; each subject document lists its open items.", muted: true },
    { t: "table", head: ["Subject", "Covers", "Framework or specification", "Status"], widths: [1.4, 1.1, 4.2, 1], rows: [...pack.ks13.map((d) => [d.subject, "Years 1 to 9", clean(d.framework), d.status]), ...pack.ks4.map((d) => [d.subject, "Years 10 and 11", taughtLabel(d), d.status])], status: 3 },
  ] });
  void coverage;
  return {
    kind: "overview",
    slug: "overview",
    title: "Curriculum overview",
    kicker: "Curriculum plan 2026 to 2027",
    subtitle: "Every subject, Year 1 to Year 11, half term by half term",
    accent: "7D6428",
    dark: "1B1E21",
    soft: "F5ECD6",
    facts: [["Years", "Year 1 to Year 11"], ["Subjects", String(subs.length)], ["Years 1 to 9", "National Curriculum in England"], ["Years 10 and 11", "Pearson Edexcel International GCSE"]],
    header: "Curriculum overview",
    sections,
  };
}
