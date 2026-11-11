// Home practical guides: aim, kit, safety (from the resource's name plus standard lines), a 5 to 7 step method,
// a results table and the lesson's exit questions.
import { put, lesson, clean, qs } from "./hand.mjs";
/** practical(entry, aim, equipment[], method[], resultsHead[], safety[] = [], { post, item } = {}) */
export function practical(e, aim, equipment, method, head, safety = [], extra = {}) {
  const l = lesson(e.subjectSlug, e.year, e.lessons[0].n);
  const fromName = (/\((?:portal [^;)]*;\s*)?([^)]*(?:safety|adult|never|do not|no |wash|gloves|goggles)[^)]*)\)/i.exec(e.wording)?.[1] || "")
    .split(/;|,(?= never| no | do not)/)
    .map(clean)
    .filter(Boolean)
    .map((x) => x[0].toUpperCase() + x.slice(1));
  const exit = qs(l, ["exit"]).filter((q) => q.a && !/^think again/i.test(q.q)).slice(0, 3);
  return put(e.subjectSlug, e.year, e, {
    type: "practical guide",
    intro: `Lesson ${l.n}: ${clean(l.title)}. A practical to do at home with an adult nearby. Read it all first.`,
    blocks: [
      { practical: { aim, equipment, safety: [...new Set([...fromName, ...safety, "An adult knows what you are doing and is nearby", "Clear a space and tidy up afterwards; wash your hands"])], method } },
      { h: "My results" },
      { table: { head, rows: [], blankRows: 6 } },
      ...(exit.length ? [{ h: "What did I find out?" }, { questions: exit }] : []),
      ...(extra.post || []),
    ],
    ...(extra.item || {}),
  });
}
