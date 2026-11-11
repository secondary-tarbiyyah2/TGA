// Revision sets, quizzes and papers: marks from the [n] in each question, reflection prompts dropped,
// every question in a test, mock or quiz given a mark. node marks.mjs <subject[,subject]>  (TERM_ID=<term>)
import { put, gen, readItem, TERM } from "./hand.mjs";
const MARKED = new Set(["revision set", "quiz", "mock paper", "test paper"]);
const REFLECT = /^(big question|think again|back to our ponder|which question|how confident|rate your|traffic.?light)/i;
/** A lesson task with sample parts "(a) ... (2) (b) ... (3)" and answers "(a) ... (b) ..." becomes one question per part. */
export function splitParts(q) {
  // "Q1 [2] text Q2 [3] text" with answers "Q1 ... Q2 ...": one question per Qn.
  if (/\bQ\d+ \[\d+\]/.test(String(q.q)) && /\bQ\d+\s/.test(String(q.a))) {
    const ans = {};
    for (const m of String(q.a).matchAll(/\bQ(\d+)\s([^]*?)(?=\s\bQ\d+\s|$)/g)) ans[m[1]] = m[2].trim();
    const out = [];
    for (const m of String(q.q).matchAll(/\bQ(\d+) \[(\d+)\]\s([^]*?)(?=\s\bQ\d+ \[\d+\]|$)/g)) out.push({ q: `${m[3].trim().replace(/\s+(When finished|When you finish|Then|Finally)\b[^]*$/, "")} [${m[2]}]`, a: ans[m[1]] || "See the mark scheme", marks: Number(m[2]) });
    if (out.length) return out;
  }
  const parts = String(q.q).split(/\s\(([a-l])\)\s/);
  if (parts.length < 5 || !/\(a\)/.test(String(q.a))) return [q];
  const ans = {};
  for (const m of String(q.a).matchAll(/\(([a-l])\)\s*([^]*?)(?=\s\([a-l]\)\s|$)/g)) ans[m[1]] = m[2].trim();
  const lead = parts[0].replace(/^(core|extend|stretch)[^:]*:\s*/i, "").replace(/\s*(sample|own exam-style[^:]*):?\s*$/i, "").trim();
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    const letter = parts[i];
    let text = parts[i + 1].trim();
    const mk = /\((\d{1,2})\)\.?$/.exec(text) || /\[(\d{1,2})\]\.?$/.exec(text);
    text = text.replace(/\s*[([]\d{1,2}[)\]]\.?$/, "");
    out.push({ q: `(${letter}) ${text}`, a: ans[letter] || "See the indicative points", ...(mk ? { marks: Number(mk[1]) } : {}) });
  }
  if (lead && out.length) out[0].q = `${lead.replace(/[.:]?$/, ".")} ${out[0].q}`;
  return out;
}
export function fixMarks(e) {
  const it = readItem(e);
  if (!it || !MARKED.has(it.type)) return false;
  for (const b of it.blocks)
    if (b.questions) {
      b.questions = b.questions.filter((q) => !REFLECT.test(q.q)).flatMap(splitParts);
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
