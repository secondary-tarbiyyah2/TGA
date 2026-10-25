// Reasoning items, in the three families schools use to see how a child thinks
// rather than what they've been taught: quantitative (number patterns),
// non-verbal (shape puzzles, drawn as SVG here) and verbal (word relationships,
// from the hand-written bank in content.ts).
import { fmt, type Item, mcq, type Rng } from "./core.ts";

type Made = Omit<Item, "id" | "strand">;

// ── Quantitative ───────────────────────────────────────────────────────────
type SeriesRule = { level: number; name: string; make: (r: Rng) => number[] };
const SERIES: SeriesRule[] = [
  { level: 1.5, name: "count in 2s, 5s or 10s", make: (r) => { const k = r.pick([2, 5, 10]); const s = k * r.int(1, 4); return Array.from({ length: 6 }, (_, i) => s + i * k); } },
  { level: 2.5, name: "add the same number", make: (r) => { const k = r.int(3, 9), s = r.int(1, 20); return Array.from({ length: 6 }, (_, i) => s + i * k); } },
  { level: 3.5, name: "subtract the same number", make: (r) => { const k = r.int(3, 12), s = r.int(60, 120); return Array.from({ length: 6 }, (_, i) => s - i * k); } },
  { level: 4.5, name: "double each time", make: (r) => { const s = r.int(1, 6); return Array.from({ length: 6 }, (_, i) => s * 2 ** i); } },
  { level: 5.5, name: "alternate two steps", make: (r) => { const a = r.int(2, 9), b = r.int(2, 9) + 1, s = r.int(1, 10); const out = [s]; for (let i = 1; i < 6; i++) out.push(out[i - 1] + (i % 2 ? a : b)); return out; } },
  { level: 6, name: "growing difference", make: (r) => { const s = r.int(1, 10), d = r.int(1, 3); const out = [s]; for (let i = 1; i < 6; i++) out.push(out[i - 1] + d + i - 1); return out; } },
  { level: 6.5, name: "square numbers", make: (r) => { const o = r.int(1, 4); return Array.from({ length: 6 }, (_, i) => (i + o) ** 2); } },
  { level: 7.5, name: "multiply then add", make: (r) => { const s = r.int(1, 4); const out = [s]; for (let i = 1; i < 6; i++) out.push(out[i - 1] * 2 + 1); return out; } },
  { level: 8, name: "add the previous two", make: (r) => { const a = r.int(1, 4), b = r.int(2, 6); const out = [a, b]; for (let i = 2; i < 6; i++) out.push(out[i - 1] + out[i - 2]); return out; } },
  { level: 9, name: "two interleaved sequences", make: (r) => { const a = r.int(1, 9), da = r.int(2, 5), b = r.int(20, 40), db = r.int(2, 4); return Array.from({ length: 6 }, (_, i) => (i % 2 ? b - db * ((i - 1) / 2) : a + da * (i / 2))); } },
  { level: 10, name: "cube numbers", make: (r) => { const o = r.int(1, 3); return Array.from({ length: 6 }, (_, i) => (i + o) ** 3); } },
  { level: 10.5, name: "n² + n", make: (r) => { const o = r.int(1, 4); return Array.from({ length: 6 }, (_, i) => (i + o) ** 2 + (i + o)); } },
];

/**
 * Every "next number" that some simple rule would also give for these five
 * terms (constant difference, second or third differences, ratio, alternating
 * steps, adding the previous two, ×2 + 1, two interleaved sequences). A
 * distractor that fits one of these could be defended, so it is never offered.
 */
export function plausibleNext(t: number[]): Set<number> {
  const out = new Set<number>();
  const d = t.slice(1).map((v, i) => v - t[i]);
  const d2 = d.slice(1).map((v, i) => v - d[i]);
  const d3 = d2.slice(1).map((v, i) => v - d2[i]);
  if (d.every((x) => x === d[0])) out.add(t[4] + d[0]);
  if (d2.every((x) => x === d2[0])) out.add(t[4] + d[3] + d2[0]);
  if (d3.every((x) => x === d3[0])) out.add(t[4] + d[3] + d2[2] + d3[0]);
  if (t[0] !== 0 && t.slice(1).every((v, i) => t[i] !== 0 && v / t[i] === t[1] / t[0])) out.add(t[4] * (t[1] / t[0]));
  if (d[0] === d[2] && d[1] === d[3]) out.add(t[4] + d[0]);
  if (t.slice(2).every((v, i) => v === t[i] + t[i + 1])) out.add(t[3] + t[4]);
  if (t.slice(1).every((v, i) => v === 2 * t[i] + 1)) out.add(2 * t[4] + 1);
  if (t[2] - t[0] === t[4] - t[2] && t[3] - t[1] !== 0) out.add(t[3] + (t[3] - t[1]));
  return out;
}

function seriesItem(r: Rng, rule: SeriesRule): Made {
  const s = rule.make(r);
  const shown = s.slice(0, 5), ans = s[5];
  const d = s[5] - s[4];
  const fits = plausibleNext(shown);
  const ok = (v: number) => v !== ans && !fits.has(v);
  const pick = (vs: number[]) => vs.filter(ok).map(fmt);
  const m = mcq(r, fmt(ans), pick([s[4] + (s[4] - s[3]), ans + 1, ans - 1, s[4] + d * 2]), pick([ans + 2, ans - 2, ans * 2, ans + 3, ans - 3]));
  return { level: rule.level, objective: `Number pattern: ${rule.name}`, type: "mcq", stem: `What comes next?  ${shown.map(fmt).join(",  ")},  ?`, choices: m.choices, answer: m.answer };
}

function functionMachineItem(r: Rng, level: number): Made {
  const a = level < 6 ? r.int(2, 3) : r.int(2, 6), b = level < 6 ? r.int(0, 3) : r.int(-4, 9);
  const f = (x: number) => a * x + b;
  const xs = r.sample([1, 2, 3, 4, 5, 6, 7, 8, 10], 3);
  const ans = f(xs[2]);
  const m = mcq(r, fmt(ans), [fmt(a * xs[2]), fmt(xs[2] + b + a), fmt(ans + a)], [fmt(ans + 1), fmt(ans - 1)]);
  return { level, objective: "Number relationships: find the rule", type: "mcq", stem: `${xs[0]} → ${fmt(f(xs[0]))}     ${xs[1]} → ${fmt(f(xs[1]))}     ${xs[2]} → ?`, choices: m.choices, answer: m.answer };
}

function balanceItem(r: Rng, level: number): Made {
  const v = r.int(2, 9), n = level < 4 ? 2 : 3, c = r.int(1, 9);
  const total = n * v + c;
  const box = "■";
  const m = mcq(r, fmt(v), [fmt(total - c), fmt(v + 1), fmt(Math.round((total) / n))], [fmt(v - 1), fmt(c)]);
  return { level, objective: "Missing value in a number sentence", type: "mcq", stem: `${Array(n).fill(box).join(" + ")} + ${c} = ${total}.  What is ${box}?`, choices: m.choices, answer: m.answer };
}

export function quantitativeItems(r: Rng, lo: number, hi: number, n: number): Made[] {
  const out: Made[] = [];
  // Only rules inside the paper's range, so a young child never meets a pattern meant for Year 10.
  const rules = SERIES.filter((s) => s.level >= lo - 0.01 && s.level <= hi + 0.01);
  const clamp = (v: number) => Math.min(hi, Math.max(lo, v));
  for (let i = 0; i < n; i++) {
    const level = lo + ((hi - lo) * i) / Math.max(1, n - 1);
    const kind = i % 3;
    if (kind === 0 && rules.length) {
      const near = [...rules].sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level));
      out.push(seriesItem(r, near[r.int(0, Math.min(2, near.length - 1))]));
    } else if (kind === 1 && level >= 3) out.push(functionMachineItem(r, clamp(Math.round(level * 2) / 2)));
    else out.push(balanceItem(r, clamp(Math.max(1.5, Math.round(level * 2) / 2))));
  }
  return out;
}

// ── Non-verbal (SVG) ───────────────────────────────────────────────────────
type Fig = { shape: number; fill: 0 | 1 | 2; rot: number; dots: number; size: number };
// shape = number of sides (0 = circle); 3..8 polygons
const INK = "#1b1e21", GOLD = "#c9a24a";

function polygon(n: number, r: number, rot: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (rot * Math.PI) / 180 + (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)}`);
  }
  return pts.join(" ");
}

export function figSvg(f: Fig): string {
  const R = 18 + f.size * 8;
  const fill = f.fill === 1 ? GOLD : f.fill === 2 ? "url(#h)" : "#fff";
  const body = f.shape === 0 ? `<circle cx="50" cy="50" r="${R}" fill="${fill}" stroke="${INK}" stroke-width="3"/>` : `<polygon points="${polygon(f.shape, R, f.rot)}" fill="${fill}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
  // a pointer so rotation is visible on symmetric shapes
  const pa = ((f.rot - 90) * Math.PI) / 180;
  const pointer = `<line x1="50" y1="50" x2="${(50 + Math.cos(pa) * (R - 4)).toFixed(1)}" y2="${(50 + Math.sin(pa) * (R - 4)).toFixed(1)}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  let dots = "";
  for (let i = 0; i < f.dots; i++) dots += `<circle cx="${14 + i * 12}" cy="92" r="4" fill="${INK}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="96" height="96"><defs><pattern id="h" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="${INK}" stroke-width="2"/></pattern></defs>${body}${pointer}${dots}</svg>`;
}
const key = (f: Fig) => `${f.shape}|${f.fill}|${((f.rot % 360) + 360) % 360}|${f.dots}|${f.size}`;

function choicesFromFigs(r: Rng, correct: Fig, wrong: Fig[]): { choiceSvgs: string[]; choices: string[]; answer: string } {
  const seen = new Set([key(correct)]);
  const ds: Fig[] = [];
  for (const w of wrong) if (!seen.has(key(w))) { seen.add(key(w)); ds.push(w); }
  const all = r.shuffle([correct, ...ds.slice(0, 3)]);
  const labels = ["A", "B", "C", "D"];
  return { choiceSvgs: all.map(figSvg), choices: labels.slice(0, all.length), answer: labels[all.findIndex((f) => key(f) === key(correct))] };
}

function strip(figs: Fig[], blank = true): string {
  const w = 104;
  const inner = figs.map((f, i) => `<g transform="translate(${i * w},0)">${figSvg(f).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</g>`).join("");
  const q = blank ? `<g transform="translate(${figs.length * w},0)"><rect x="6" y="6" width="88" height="88" rx="10" fill="none" stroke="${GOLD}" stroke-width="3" stroke-dasharray="6 5"/><text x="50" y="62" font-size="36" text-anchor="middle" font-family="Arial" fill="${GOLD}">?</text></g>` : "";
  const total = (figs.length + (blank ? 1 : 0)) * w;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 100" width="${total}" height="100" role="img" aria-label="A row of shapes with the next one missing">${inner}${q}</svg>`;
}

function nvSeries(r: Rng, level: number): Made {
  const rules = level < 4 ? 1 : level < 7.5 ? 2 : 3;
  const pool = r.shuffle(["rot", "dots", "fill", "sides"] as const).slice(0, rules);
  const base: Fig = { shape: r.pick([0, 3, 4, 5]), fill: 0, rot: 0, dots: r.int(0, 1), size: 1 };
  if (pool.includes("sides") && base.shape === 0) base.shape = 3;
  const rotStep = r.pick([45, 90]);
  const at = (i: number): Fig => ({
    shape: pool.includes("sides") ? base.shape + i : base.shape,
    fill: (pool.includes("fill") ? (i % 2 ? 1 : 0) : base.fill) as 0 | 1,
    rot: pool.includes("rot") ? base.rot + i * rotStep : base.rot,
    dots: pool.includes("dots") ? base.dots + i : base.dots,
    size: base.size,
  });
  const seq = [0, 1, 2, 3].map(at);
  const correct = at(4);
  const wrong: Fig[] = [
    at(3),
    { ...correct, rot: correct.rot + 90 },
    { ...correct, dots: Math.max(0, correct.dots + (pool.includes("dots") ? -1 : 1)) },
    { ...correct, fill: (correct.fill ? 0 : 1) as 0 | 1 },
    { ...correct, shape: correct.shape === 0 ? 4 : correct.shape + 1 },
  ];
  const c = choicesFromFigs(r, correct, r.shuffle(wrong));
  return { level, objective: `Shape pattern (${rules} change${rules > 1 ? "s" : ""} at once)`, type: "mcq", stem: "Which shape comes next in the pattern?", svg: strip(seq), ...c };
}

function nvOddOneOut(r: Rng, level: number): Made {
  const labels = ["A", "B", "C", "D", "E"];
  // Four figures that follow the rule, all different from each other, plus one that breaks it.
  const distinct = (make: () => Fig, n: number): Fig[] => {
    const out: Fig[] = [], seen = new Set<string>();
    for (let tries = 0; out.length < n && tries < 400; tries++) {
      const f = make();
      if (!seen.has(key(f))) { seen.add(key(f)); out.push(f); }
    }
    return out;
  };
  let same: Fig[], odd: Fig, why: string;
  if (level < 4) {
    const s = r.pick([3, 4, 5, 0]);
    same = distinct(() => ({ shape: s, fill: r.pick([0, 1, 2]) as 0 | 1 | 2, rot: 0, dots: 0, size: r.int(0, 2) }), 4);
    odd = { shape: s === 4 ? 5 : 4, fill: r.pick([0, 1, 2]) as 0 | 1 | 2, rot: 0, dots: 0, size: r.int(0, 2) };
    why = "different shape";
  } else if (level < 8) {
    same = distinct(() => { const s = r.pick([3, 4, 5]); return { shape: s, fill: r.pick([0, 1, 2]) as 0 | 1 | 2, rot: r.pick([0, 20, 40]), dots: s, size: 1 }; }, 4);
    const s = r.pick([3, 4, 5]);
    odd = { shape: s, fill: r.pick([0, 1, 2]) as 0 | 1 | 2, rot: r.pick([0, 20, 40]), dots: s - 1, size: 1 };
    why = "dots equal the number of sides";
  } else {
    // shaded figures point up, white figures point down
    same = distinct(() => { const fill = r.pick([0, 1]) as 0 | 1; return { shape: r.pick([4, 5, 6]), fill, rot: fill ? 0 : 180, dots: r.int(0, 3), size: r.int(0, 2) }; }, 4);
    const fill = r.pick([0, 1]) as 0 | 1;
    odd = { shape: r.pick([4, 5, 6]), fill, rot: fill ? 180 : 0, dots: r.int(0, 3), size: r.int(0, 2) };
    why = "shading decides which way the line points";
  }
  const oddAt = r.int(0, 4);
  const figs = [...same];
  figs.splice(oddAt, 0, odd);
  return { level, objective: `Odd one out (${why})`, type: "mcq", stem: "Which shape is the odd one out?", choiceSvgs: figs.map(figSvg), choices: labels, answer: labels[oddAt] };
}

function nvMatrix(r: Rng, level: number): Made {
  // 2×2: across the row the fill changes; down the column the shape changes (+ dots at higher levels).
  const s1 = r.pick([0, 3, 4]), s2 = r.pick([5, 6]);
  const f1 = 0 as const, f2 = r.pick([1, 2]) as 1 | 2;
  const d = level >= 7 ? r.int(1, 2) : 0;
  const cell = (row: number, col: number): Fig => ({ shape: row ? s2 : s1, fill: col ? f2 : f1, rot: 0, dots: level >= 7 ? d + row + col : 0, size: 1 });
  const correct = cell(1, 1);
  const grid = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 210" width="210" height="210" role="img" aria-label="A two by two grid of shapes with one missing">` +
    [[0, 0], [0, 1], [1, 0]].map(([rw, cl]) => `<g transform="translate(${cl * 105 + 3},${rw * 105 + 3})">${figSvg(cell(rw, cl)).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</g>`).join("") +
    `<g transform="translate(108,108)"><rect x="6" y="6" width="88" height="88" rx="10" fill="none" stroke="${GOLD}" stroke-width="3" stroke-dasharray="6 5"/><text x="50" y="62" font-size="36" text-anchor="middle" font-family="Arial" fill="${GOLD}">?</text></g></svg>`;
  const wrong: Fig[] = [cell(1, 0), cell(0, 1), { ...correct, dots: correct.dots + 1 }, { ...correct, fill: f2 === 1 ? 2 : 1 }, { ...correct, shape: s1 }];
  const c = choicesFromFigs(r, correct, r.shuffle(wrong));
  return { level, objective: "Shape grid: rows and columns", type: "mcq", stem: "Which shape completes the grid?", svg: grid, ...c };
}

export function nonVerbalItems(r: Rng, lo: number, hi: number, n: number): Made[] {
  const out: Made[] = [];
  const clamp = (v: number) => Math.min(hi, Math.max(lo, v));
  for (let i = 0; i < n; i++) {
    const level = clamp(Math.round((lo + ((hi - lo) * i) / Math.max(1, n - 1)) * 2) / 2);
    const k = i % 3;
    out.push(k === 0 ? nvSeries(r, level) : k === 1 ? nvOddOneOut(r, level) : nvMatrix(r, clamp(Math.max(level, 2))));
  }
  return out;
}
