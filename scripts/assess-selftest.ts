// Self-test for the entry assessment engine: run with
//   node --experimental-strip-types scripts/assess-selftest.ts
// 1) builds papers for every year group with many seeds and checks every item is well-formed;
// 2) simulates pupils of known ability and checks the report recovers it.
import { buildForm } from "../supabase/functions/_shared/assess/form.ts";
import { buildReport } from "../supabase/functions/_shared/assess/score.ts";
import { markItem, Rng, type Item } from "../supabase/functions/_shared/assess/core.ts";

let problems = 0;
const kinds: Record<string, number> = {};
const bad = (m: string) => { problems++; if (problems <= 40) console.log("  ✗", m); const k = m.replace(/Y\d+ seed\d+ /, "").replace(/:.*/, ""); kinds[k] = (kinds[k] || 0) + 1; };
const K = 1.3, OFF = 0.6, sig = (x: number) => 1 / (1 + Math.exp(-x));

for (let year = 1; year <= 11; year++) {
  const counts: Record<string, number> = {};
  for (let seed = 1; seed <= 60; seed++) {
    const f = buildForm(year, seed * 7919 + year);
    for (const s of f.sections) {
      for (const it of s.items) {
        counts[it.strand] = (counts[it.strand] || 0) + 1;
        const where = `Y${year} seed${seed} ${s.key} ${it.objective}`;
        if (/undefined|NaN|Infinity|\[object/.test(it.stem + (it.choices || []).join("|"))) bad(`${where}: bad text "${it.stem}" ${JSON.stringify(it.choices)}`);
        if (it.type === "mcq") {
          const ch = it.choices || [];
          if (ch.length < 3) bad(`${where}: only ${ch.length} choices`);
          if (new Set(ch.map((c) => c.trim())).size !== ch.length) bad(`${where}: duplicate choices ${JSON.stringify(ch)}`);
          if (!ch.includes(String(it.answer))) bad(`${where}: answer "${it.answer}" not in ${JSON.stringify(ch)}`);
          if (it.choiceSvgs && it.choiceSvgs.length !== ch.length) bad(`${where}: svg/choice count mismatch`);
          if (it.choiceSvgs && new Set(it.choiceSvgs).size !== it.choiceSvgs.length) bad(`${where}: identical picture choices`);
          if (!markItem(it, it.answer)) bad(`${where}: own answer marked wrong`);
        } else if (it.type === "numeric") {
          if (!Number.isFinite(Number(it.answer))) bad(`${where}: numeric answer ${it.answer}`);
          if (!markItem(it, String(it.answer))) bad(`${where}: own answer marked wrong`);
        }
        if (!(it.level >= 0.5 && it.level <= 12)) bad(`${where}: level ${it.level}`);
      }
    }
  }
  const f = buildForm(year, 42);
  console.log(`Y${String(year).padStart(2)}  ${f.sections.map((s) => `${s.key}:${s.items.length}${s.candidate ? "" : "(live)"}/${s.minutes}m`).join("  ")}`);
}

// Simulation: a pupil in year Y with true ability θ answers each item with the model's probability.
console.log("\nSimulated pupils (true ability → estimated maths / reading / reasoning, mean of 30 runs):");
for (const [year, theta] of [[1, 1], [2, 1], [4, 4], [4, 2.5], [6, 7.5], [8, 8], [8, 6], [10, 10], [11, 9]] as const) {
  const acc: Record<string, number[]> = {};
  for (let k = 0; k < 30; k++) {
    const f = buildForm(year, 1000 + k * 31 + year);
    const r = new Rng(9000 + k);
    const responses: Record<string, { value: unknown; ms: number }> = {};
    for (const s of f.sections) for (const it of s.items as Item[]) {
      if (it.type === "text") continue;
      const c = it.type === "mcq" ? 1 / (it.choices?.length || 4) : 0;
      const p = c + (1 - c) * sig(K * (theta - it.level) + OFF);
      const right = r.next() < p;
      responses[it.id] = { value: right ? String(it.answer) : it.type === "mcq" ? (it.choices || []).find((x) => x !== String(it.answer)) : "-999", ms: 8000 };
    }
    const rep = buildReport(f, responses, {}, { year }, { tabHides: 0, timedOutSections: [] });
    for (const st of rep.strands) (acc[st.key] ||= []).push(st.workingAt ?? NaN);
    (acc.reasoning ||= []).push(rep.overall.reasoning ?? NaN);
    (acc.attain ||= []).push(rep.overall.attainment ?? NaN);
  }
  const m = (k: string) => (acc[k] ? (acc[k].reduce((a, b) => a + b, 0) / acc[k].length).toFixed(1) : " – ");
  console.log(`  Year ${String(year).padStart(2)}  θ=${theta.toFixed(1).padStart(4)}  →  maths ${m("maths")}  reading ${m("reading")}  spag ${m("spag")}  reasoning ${m("reasoning")}  overall ${m("attain")}`);
}
console.log(problems ? `\n${problems} problem(s)` : "\nAll items well-formed."); console.log(kinds);
process.exitCode = problems ? 1 : 0;
