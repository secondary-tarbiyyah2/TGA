// Qur'an items for any term (TERM_ID=spring-2 ...): rule cards, ayah sheets, read-and-colour, star charts, plans.
// Arabic is copied from the lesson data only.
import { put, gen, lesson, readItem, clean, AR, kwOf, teachBlocks, qBlocks, isMeaning, TERM } from "./hand.mjs";
const Q = "quran";
const words = (l) => {
  const out = [];
  for (const t of l.teach || []) {
    if (t.table && !isMeaning(t)) for (const r of t.table.rows) for (const c of r.slice(0, 1)) if (AR.test(c) && clean(c).length <= 22) out.push(clean(c));
    if (t.sort) for (const c of t.sort.cards) if (AR.test(c) && clean(c).length <= 22) out.push(clean(c));
  }
  return [...new Set(out)];
};
const n0 = (e) => e.lessons[0].n;
for (const e of gen(Q)) {
  const l = lesson(Q, e.year, n0(e));
  const y = Number(e.year.slice(1));
  const w = e.wording;
  const early = y <= 2;
  if (/rule card and examples/i.test(w)) {
    put(Q, e.year, e, {
      title: `${clean(l.title)}: rule card and examples`,
      type: e.type === "printable graph/grid" ? "worksheet" : e.type === "mock paper" ? "worksheet" : e.type,
      intro: `Lesson ${l.n}. Read the rule and say every example aloud. Point to each word in your mushaf. Then answer the questions.`,
      blocks: [...teachBlocks(l), ...((l.keywords || []).length ? [{ h: "Key words" }, { keywords: kwOf(l) }] : []), ...qBlocks(l, early)],
    });
  } else if (/with words spaced/i.test(w)) {
    const it = readItem(e);
    const extra = (l.teach || []).filter((t) => t.table && !isMeaning(t)).flatMap((t) => [{ h: clean(t.heading) }, { table: { head: t.table.head.map(clean), rows: t.table.rows.map((r) => r.map(clean)) } }]);
    const at = it.blocks.findIndex((b, i) => i > 0 && b.h && !/^read$/i.test(b.h));
    const base = (at < 0 ? it.blocks : it.blocks.slice(0, at)).filter((b) => !b.questions);
    put(Q, e.year, e, { intro: `Lesson ${l.n}. Read each word slowly, pointing with your finger. Only the Arabic is the Qur'an; the English is a translation of its meaning.`, blocks: [...base, ...extra, ...((l.keywords || []).length ? [{ h: "Key words" }, { keywords: kwOf(l) }] : []), ...qBlocks(l, early)] });
  } else if (/words to read|letter shapes|read and colour/i.test(w)) {
    const ws = words(l);
    const focus = clean(l.title).replace(/:.*$/, "");
    put(Q, e.year, e, {
      type: "worksheet",
      title: `Words to read and colour: ${focus}`,
      intro: `Lesson ${l.n}. Read each word slowly to a grown-up, then colour the part we learned today (${focus}). Then trace and copy.`,
      blocks: [
        ...(ws.length ? [{ trace: { items: ws.slice(0, 9), trace: false, copy: false, cols: 3 } }, { h: "Trace and copy" }, { trace: { items: ws.slice(0, 4) } }] : []),
        ...teachBlocks(l, { skipQuotes: false }).slice(0, 6),
        { h: "Read to a grown-up" },
        { tracker: { corner: "Read", cols: ["Me", "A grown-up heard me"], rows: ["Once", "Twice", "Three times"] } },
        ...qBlocks(l, early),
      ],
    });
  } else if (/stars chart/i.test(w)) {
    put(Q, e.year, e, {
      type: "worksheet",
      title: "My recitation stars chart",
      intro: `Lesson ${l.n}: ${clean(l.title)}. Recite this week's ayat to a grown-up every day. Colour a star when you recite with no mistake; the grown-up writes their initials.`,
      blocks: [{ tracker: { corner: "Day", cols: ["What I recited", "Star (colour it)", "Grown-up's initials"], rows: ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"] } }, ...teachBlocks(l, { skipQuotes: true }).slice(0, 4)],
    });
  } else if (/plan|log|tracker|chart/i.test(w)) {
    put(Q, e.year, e, {
      type: "worksheet",
      intro: `Lesson ${l.n}: ${clean(l.title)}. Ten minutes a day. Recite to a grown-up, then colour the box.`,
      blocks: [...teachBlocks(l, { skipQuotes: true }), { tracker: { corner: "Week", cols: ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"], rows: ["Week 1", "Week 2", "Week 3", "Week 4"] } }],
    });
  } else console.log("unhandled", e.id, w);
}
console.log("quran", TERM);
