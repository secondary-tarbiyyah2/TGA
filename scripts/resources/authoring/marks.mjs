// Revision sets, quizzes and papers: marks from the [n] in each question, reflection prompts dropped,
// every question in a test, mock or quiz given a mark. node marks.mjs <subject[,subject]>  (TERM_ID=<term>)
import { put, gen, readItem, TERM } from "./hand.mjs";
const MARKED = new Set(["revision set", "quiz", "mock paper", "test paper"]);
const REFLECT = /^(big question|think again|back to our ponder|which question|how confident|rate your|traffic.?light)/i;
export function fixMarks(e) {
  const it = readItem(e);
  if (!it || !MARKED.has(it.type)) return false;
  for (const b of it.blocks)
    if (b.questions) {
      b.questions = b.questions.filter((q) => !REFLECT.test(q.q));
      for (const q of b.questions) {
        const m = [...q.q.matchAll(/\[(\d+)\]/g)].reduce((a, x) => a + Number(x[1]), 0);
        if (m) q.marks = m;
        else if (!q.marks && !q.parts) q.marks = q.options ? 1 : Math.min(4, Math.max(1, Math.round(String(q.a || "").split(" ").length / 10)));
      }
    }
  it.blocks = it.blocks.filter((b) => !b.questions || b.questions.length);
  put(e.subjectSlug, e.year, e, it);
  return true;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  let n = 0;
  for (const s of process.argv[2].split(",")) for (const e of gen(s)) if (fixMarks(e)) n++;
  console.log(`marks ${TERM}: ${n} items`);
}
