// Generic rebuild from the lesson for any subject: node generic.mjs <subject[,subject]>
import { put, gen, lesson, readItem, clean, kwOf, teachBlocks, qBlocks, TERM } from "./hand.mjs";
const SKIPTYPES = new Set(["quiz", "mock paper", "test paper", "model text", "revision set", "printable graph/grid", "practical guide"]);
export function rebuildGeneric(e, { pre = [], mid = [], post = [], intro, keepFrame = true, ...extra } = {}) {
  const l = lesson(e.subjectSlug, e.year, e.lessons[0].n);
  const it = readItem(e) || {};
  const y = Number(e.year.slice(1));
  const frame = keepFrame && e.type === "writing frame" ? (it.blocks || []).filter((b) => b.frame || (b.starters && /word bank/i.test(b.title || ""))) : [];
  const blocks = [
    ...pre,
    ...teachBlocks(l, { keepMeaning: true }),
    ...mid,
    ...(frame.length ? [{ h: y <= 2 ? "My turn to write" : "Write" }, ...frame] : []),
    ...((l.keywords || []).length ? [{ h: "Key words" }, { keywords: kwOf(l) }] : []),
    ...qBlocks(l, y <= 2),
    ...post,
  ];
  return put(e.subjectSlug, e.year, e, { intro: intro || `Lesson ${l.n}: ${clean(l.title)}. ${y <= 2 ? "Listen, look, then do the tasks with a grown-up." : "Read the ideas from the lesson, then do the tasks."}`, blocks, ...extra });
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const subjects = process.argv[2].split(",");
  for (const e of gen().filter((x) => subjects.includes(x.subjectSlug))) {
    if (SKIPTYPES.has(e.type) && !process.env.ALLTYPES) continue;
    rebuildGeneric(e);
  }
  console.log("generic", subjects.join(","), TERM);
}
