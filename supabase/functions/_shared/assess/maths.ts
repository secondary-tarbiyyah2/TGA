// Maths item generators, one per national-curriculum objective, Year 1 to Year 11.
// Each generator makes a fresh question from the seed, so no two pupils get the
// same paper and an answer key can't be passed round.
import { clean, fmt, type Item, mcq, numericDistractors, type Rng, sup } from "./core.ts";

type Gen = { level: number; objective: string; make: (r: Rng) => Omit<Item, "id" | "strand" | "level" | "objective"> };

const num = (stem: string, answer: number, extra: Partial<Item> = {}) => ({ type: "numeric" as const, stem, answer, ...extra });
/** Multiple choice. `spare` refills the options when a distractor turns out equal to the answer. */
function choice(r: Rng, stem: string, answer: number | string, distractors: (number | string)[], extra: Partial<Item> = {}, spareIn: (number | string)[] = []) {
  const a = typeof answer === "number" ? fmt(answer) : answer;
  const ds = distractors.map((d) => (typeof d === "number" ? fmt(d) : d));
  const spare = [...spareIn.map((d) => (typeof d === "number" ? fmt(d) : d)), ...(typeof answer === "number" ? numericDistractors(r, answer) : [])];
  const m = mcq(r, a, ds, spare);
  return { type: "mcq" as const, stem, choices: m.choices, answer: m.answer, ...extra };
}

// Simple pictures for the youngest pupils.
function dotsSvg(n: number): string {
  const per = 5, size = 26, gap = 10;
  const rows = Math.ceil(n / per);
  const w = per * (size + gap) + gap, h = rows * (size + gap) + gap;
  let c = "";
  for (let i = 0; i < n; i++) {
    const x = gap + (i % per) * (size + gap) + size / 2, y = gap + Math.floor(i / per) * (size + gap) + size / 2;
    c += `<circle cx="${x}" cy="${y}" r="${size / 2}" fill="#c9a24a" stroke="#7d6428" stroke-width="2"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${n} dots">${c}</svg>`;
}
/** A row (or two) of simple rabbits, for Year 1 "take away" in a picture. */
function rabbitsSvg(n: number): string {
  const per = 5, w = 52, h = 56;
  const rows = Math.ceil(n / per);
  const W = per * w + 8, H = rows * h + 8;
  let c = "";
  for (let i = 0; i < n; i++) {
    const x = 4 + (i % per) * w, y = 4 + Math.floor(i / per) * h;
    c += `<g transform="translate(${x},${y})" fill="#a89f94" stroke="#6b5f52" stroke-width="1.5"><ellipse cx="20" cy="12" rx="4" ry="11"/><ellipse cx="30" cy="12" rx="4" ry="11"/><circle cx="25" cy="27" r="9"/><ellipse cx="25" cy="42" rx="14" ry="11"/><circle cx="22" cy="25" r="1.4" fill="#2b2b2b" stroke="none"/></g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${n} rabbits">${c}</svg>`;
}

/** UK coins (1p, 2p, 5p, 10p) drawn simply: copper for 1p and 2p, silver for 5p and 10p. */
function coinsSvg(coins: number[]): string {
  const size: Record<number, number> = { 1: 22, 2: 30, 5: 20, 10: 28 };
  let x = 6, c = "";
  for (const v of coins) {
    const r = size[v];
    const copper = v <= 2;
    c += `<g><circle cx="${x + r}" cy="34" r="${r}" fill="${copper ? "#d9874a" : "#d7d7d7"}" stroke="${copper ? "#8a4a1c" : "#7a7a7a"}" stroke-width="2"/><text x="${x + r}" y="40" text-anchor="middle" font-family="Arial" font-weight="700" font-size="${r * 0.75}" fill="#222">${v}p</text></g>`;
    x += 2 * r + 12;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} 68" width="${x}" height="68" role="img" aria-label="Coins: ${coins.map((v) => `${v}p`).join(", ")}">${c}</svg>`;
}

function clockSvg(h: number, m: number): string {
  const cx = 80, cy = 80, R = 70;
  let ticks = "";
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ticks += `<text x="${cx + Math.sin(a) * (R - 14)}" y="${cy - Math.cos(a) * (R - 14) + 5}" font-size="14" text-anchor="middle" font-family="Arial" fill="#1b1e21">${i}</text>`;
  }
  const ma = (m / 60) * Math.PI * 2, ha = ((h % 12) / 12 + m / 720) * Math.PI * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="A clock"><circle cx="${cx}" cy="${cy}" r="${R}" fill="#fff" stroke="#1b1e21" stroke-width="3"/>${ticks}<line x1="${cx}" y1="${cy}" x2="${cx + Math.sin(ha) * 36}" y2="${cy - Math.cos(ha) * 36}" stroke="#1b1e21" stroke-width="5" stroke-linecap="round"/><line x1="${cx}" y1="${cy}" x2="${cx + Math.sin(ma) * 56}" y2="${cy - Math.cos(ma) * 56}" stroke="#7d6428" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="4" fill="#1b1e21"/></svg>`;
}
function rectSvg(w: number, h: number, unit = "cm"): string {
  const sc = 160 / Math.max(w, h);
  const W = w * sc, H = h * sc;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W + 70} ${H + 50}" width="${W + 70}" height="${H + 50}" role="img" aria-label="A rectangle ${w} by ${h}"><rect x="35" y="15" width="${W}" height="${H}" fill="#f6efdc" stroke="#1b1e21" stroke-width="2"/><text x="${35 + W / 2}" y="${H + 38}" text-anchor="middle" font-family="Arial" font-size="14">${w} ${unit}</text><text x="${W + 42}" y="${15 + H / 2 + 5}" font-family="Arial" font-size="14">${h} ${unit}</text></svg>`;
}
function triSvg(a: number, b: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 170" width="240" height="170" role="img" aria-label="A triangle with two angles marked"><polygon points="20,150 220,150 90,20" fill="#f6efdc" stroke="#1b1e21" stroke-width="2"/><text x="40" y="142" font-family="Arial" font-size="14">${a}°</text><text x="178" y="142" font-family="Arial" font-size="14">${b}°</text><text x="84" y="48" font-family="Arial" font-size="16" font-weight="bold">x</text></svg>`;
}

const NAMES = ["Amina", "Yusuf", "Maryam", "Ibrahim", "Sara", "Zayd", "Hana", "Omar", "Layla", "Bilal", "Noor", "Adam"];
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));

export const MATHS: Gen[] = [
  // ── Year 1 ──
  { level: 1, objective: "Y1 count objects to 20", make: (r) => { const n = r.int(5, 15); return choice(r, "How many dots are there?", n, [n - 1, n + 1, n + 2], { svg: dotsSvg(n), say: "How many dots are there?" }); } },
  { level: 1, objective: "Y1 one more / one less", make: (r) => { const n = r.int(8, 19); const more = r.chance(0.5); return choice(r, `What is one ${more ? "more" : "less"} than ${n}?`, more ? n + 1 : n - 1, [n, more ? n - 1 : n + 1, more ? n + 2 : n - 2], { say: `What is one ${more ? "more" : "less"} than ${n}?` }); } },
  { level: 1.2, objective: "Y1 add within 20", make: (r) => { const a = r.int(3, 9), b = r.int(2, 9); return choice(r, `${a} + ${b} = ?`, a + b, [a + b - 1, a + b + 1, a + b + 10], { say: `${a} add ${b}` }); } },
  { level: 1.4, objective: "Y1 subtract within 20", make: (r) => { const a = r.int(11, 19), b = r.int(2, 9); return choice(r, `${a} − ${b} = ?`, a - b, [a - b + 1, a - b - 1, a + b], { say: `${a} take away ${b}` }); } },
  // The next four follow the Tarbiyyah Primary Year 1 admissions entry test (Questions 4, 6, 9 and 10), owner, 11 Nov 2026.
  { level: 1.3, objective: "Y1 number bonds to 10", make: (r) => { const a = r.int(2, 8); return choice(r, `${a} + ? = 10`, 10 - a, [10 - a + 1, 10 - a - 1, 10 + a], { say: `${a} add what makes 10?` }); } },
  { level: 1.5, objective: "Y1 take away in a picture", make: (r) => { const n = r.int(6, 10), k = r.int(2, 4); return choice(r, `If ${k} rabbits hop away, how many are left?`, n - k, [n, n + k, n - k - 1], { svg: rabbitsSvg(n), say: `Look at the rabbits. If ${k} rabbits hop away, how many are left?` }); } },
  { level: 1.7, objective: "Y1 add ones to a 2-digit number", make: (r) => { const a = r.int(21, 25), b = r.int(3, 8); return choice(r, `${a} + ${b} = ?`, a + b, [a + b - 1, a + b + 1, a + b + 10], { say: `${a} add ${b}` }); } },
  { level: 1.9, objective: "Y1 money: add coins", make: (r) => { const coins = r.pick([[10, 5, 2, 1], [10, 2, 1], [5, 2, 1], [10, 5, 1], [5, 5, 2], [10, 2, 2, 1]]); const t = coins.reduce((a, b) => a + b, 0); return choice(r, "How much money is there altogether?", `${t}p`, [`${t - 1}p`, `${t + 1}p`, `${coins.length}p`], { svg: coinsSvg(coins), say: "Look at the coins. How much money is there altogether?" }, [`${t + 10}p`, `${t - 2}p`]); } },
  { level: 1.6, objective: "Y1 missing number", make: (r) => { const a = r.int(2, 9), c = r.int(a + 3, 20); return choice(r, `${a} + ? = ${c}`, c - a, [c, c - a + 1, c + a], { say: `${a} add what makes ${c}?` }); } },
  { level: 1.8, objective: "Y1 halves of numbers", make: (r) => { const n = 2 * r.int(2, 10); return choice(r, `What is half of ${n}?`, n / 2, [n * 2, n - 2, n / 2 + 1], { say: `What is half of ${n}?` }); } },
  // ── Year 2 ──
  { level: 2, objective: "Y2 add 2-digit and 1-digit", make: (r) => { const a = r.int(23, 79), b = r.int(3, 9); return choice(r, `${a} + ${b} = ?`, a + b, [a + b + 10, a + b - 10, a + b - 1]); } },
  { level: 2.2, objective: "Y2 tens and ones", make: (r) => { const t = r.int(2, 9), o = r.int(1, 9); return choice(r, `What number has ${t} tens and ${o} ones?`, t * 10 + o, [o * 10 + t, t + o, t * 10]); } },
  { level: 2.4, objective: "Y2 2, 5 and 10 times tables", make: (r) => { const a = r.pick([2, 5, 10]), b = r.int(3, 12); return choice(r, `${a} × ${b} = ?`, a * b, [a * b + a, a * b - a, a + b]); } },
  { level: 2.6, objective: "Y2 tell the time to 5 minutes", make: (r) => { const h = r.int(1, 12), m = 5 * r.int(1, 11); const t = (hh: number, mm: number) => `${hh}:${String(mm).padStart(2, "0")}`; return choice(r, "What time does the clock show?", t(h, m), [t(m / 5, (h % 12) * 5), t((h % 12) + 1, m), t(h, (m + 30) % 60)], { svg: clockSvg(h, m) }, [t(h, (m + 15) % 60), t((h % 12) + 1, (m + 30) % 60), t(h === 1 ? 12 : h - 1, m)]); } },
  { level: 2.8, objective: "Y2 money: change from £1", make: (r) => { const p = r.int(12, 88); return num(`${r.pick(NAMES)} buys a pencil for ${p}p and pays with £1. How much change, in pence?`, 100 - p, { unit: "p" }); } },
  // ── Year 3 ──
  { level: 3, objective: "Y3 add 3-digit numbers", make: (r) => { const a = r.int(120, 480), b = r.int(110, 470); return num(`${a} + ${b} = ?`, a + b); } },
  { level: 3.2, objective: "Y3 subtract 3-digit numbers", make: (r) => { const a = r.int(400, 900), b = r.int(120, 390); return num(`${a} − ${b} = ?`, a - b); } },
  { level: 3.4, objective: "Y3 3, 4 and 8 times tables", make: (r) => { const a = r.pick([3, 4, 8]), b = r.int(4, 12); return num(`${a} × ${b} = ?`, a * b); } },
  { level: 3.6, objective: "Y3 fraction of an amount", make: (r) => { const d = r.pick([2, 3, 4, 5]), n = d * r.int(3, 12); return num(`What is 1/${d} of ${n}?`, n / d); } },
  { level: 3.8, objective: "Y3 perimeter of a rectangle", make: (r) => { const w = r.int(4, 12), h = r.int(2, 9); return num("What is the perimeter of this rectangle?", 2 * (w + h), { svg: rectSvg(w, h), unit: "cm" }); } },
  // ── Year 4 ──
  { level: 4, objective: "Y4 times tables to 12 × 12", make: (r) => { const a = r.int(6, 12), b = r.int(6, 12); return num(`${a} × ${b} = ?`, a * b); } },
  { level: 4.2, objective: "Y4 multiply 2-digit by 1-digit", make: (r) => { const a = r.int(23, 89), b = r.int(3, 9); return num(`${a} × ${b} = ?`, a * b); } },
  { level: 4.4, objective: "Y4 round to the nearest 100", make: (r) => { const n = r.int(1050, 9940); return choice(r, `Round ${fmt(n)} to the nearest 100.`, Math.round(n / 100) * 100, [Math.round(n / 10) * 10, Math.round(n / 1000) * 1000, Math.floor(n / 100) * 100 === Math.round(n / 100) * 100 ? Math.ceil(n / 100) * 100 : Math.floor(n / 100) * 100]); } },
  { level: 4.6, objective: "Y4 equivalent fractions", make: (r) => { const d = r.pick([3, 4, 5, 6]), n = r.int(1, d - 1), k = r.int(2, 4); return num(`${n}/${d} = ?/${d * k}`, n * k); } },
  { level: 4.8, objective: "Y4 area by counting / multiplying", make: (r) => { const w = r.int(3, 9), h = r.int(2, 8); return num("What is the area of this rectangle?", w * h, { svg: rectSvg(w, h), unit: "cm²" }); } },
  { level: 4.9, objective: "Y4 decimals: tenths", make: (r) => { const a = r.int(11, 89); return choice(r, `Which is the same as ${a} tenths?`, (a / 10).toFixed(1), [(a / 100).toFixed(2), String(a * 10), (a / 10 + 1).toFixed(1)]); } },
  // ── Year 5 ──
  { level: 5, objective: "Y5 long multiplication", make: (r) => { const a = r.int(24, 98), b = r.int(13, 47); return num(`${a} × ${b} = ?`, a * b); } },
  { level: 5.2, objective: "Y5 percentages of amounts", make: (r) => { const p = r.pick([10, 20, 25, 50, 75]), n = 20 * r.int(2, 20); return num(`What is ${p}% of ${n}?`, (p * n) / 100); } },
  { level: 5.4, objective: "Y5 add fractions with related denominators", make: (r) => { const d = r.pick([4, 6, 8, 10]), h = d / 2, a = r.int(1, h - 1), b = r.int(1, d - 1 - 2 * a); const n = a * 2 + b; const g = gcd(n, d); return choice(r, `${a}/${h} + ${b}/${d} = ?`, `${n / g}/${d / g}`, [`${a + b}/${h + d}`, `${a + b}/${d}`, `${n}/${d * 2}`], {}, [`${n + 1}/${d}`, `${a + b}/${h}`]); } },
  { level: 5.6, objective: "Y5 multiply decimals by 10/100", make: (r) => { const x = r.int(12, 999) / 100, k = r.pick([10, 100]); return num(`${fmt(x)} × ${k} = ?`, clean(x * k), { tolerance: 1e-6 }); } },
  { level: 5.8, objective: "Y5 prime numbers", make: (r) => { const p = r.pick([23, 29, 31, 37, 41, 43, 47, 53, 59, 61]); const ds = r.sample([21, 27, 33, 39, 49, 51, 57, 63, 69], 3); return choice(r, "Which of these is a prime number?", p, ds); } },
  { level: 5.9, objective: "Y5 convert units of length", make: (r) => { const km = r.int(2, 9) + r.pick([0.5, 0.25, 0.75]); return num(`How many metres are in ${fmt(km)} km?`, clean(km * 1000), { unit: "m" }); } },
  // ── Year 6 ──
  { level: 6, objective: "Y6 order of operations", make: (r) => { const a = r.int(2, 9), b = r.int(2, 9), c = r.int(2, 9); return num(`${a} + ${b} × ${c} = ?`, a + b * c); } },
  { level: 6.2, objective: "Y6 ratio", make: (r) => { const a = r.int(1, 4), b = r.int(2, 5), k = r.int(3, 9); return num(`Flour and sugar are mixed in the ratio ${a}:${b}. If there are ${a * k * 50} g of flour, how much sugar is there, in grams?`, b * k * 50, { unit: "g" }); } },
  { level: 6.4, objective: "Y6 angles in a triangle", make: (r) => { const a = r.int(35, 75), b = r.int(30, 70); return num("Find the angle marked x.", 180 - a - b, { svg: triSvg(a, b), unit: "°" }); } },
  { level: 6.6, objective: "Y6 divide fractions by whole numbers", make: (r) => { const d = r.pick([2, 3, 4, 5]), k = r.pick([2, 3]); const den = d * k; return choice(r, `1/${d} ÷ ${k} = ?`, `1/${den}`, [`${k}/${d}`, `1/${d + k}`, `${k}/${den}`], {}, [`1/${den + 1}`, `${d}/${k}`, `1/${d}`]); } },
  { level: 6.8, objective: "Y6 simple formula / algebra", make: (r) => { const a = r.int(2, 9), b = r.int(1, 20), x = r.int(2, 12); return num(`If y = ${a}x + ${b}, what is y when x = ${x}?`, a * x + b); } },
  { level: 6.9, objective: "Y6 mean average", make: (r) => { const xs = Array.from({ length: 4 }, () => r.int(3, 20)); const s = xs.reduce((p, q) => p + q, 0); const fix = (4 - (s % 4)) % 4; xs[0] += fix; return num(`What is the mean of ${xs.join(", ")}?`, (s + fix) / 4); } },
  // ── Year 7 ──
  { level: 7, objective: "Y7 negative numbers", make: (r) => { const a = -r.int(2, 15), b = r.int(3, 20); return num(`${fmt(a)} + ${b} = ?`, a + b); } },
  { level: 7.2, objective: "Y7 solve one-step / two-step equations", make: (r) => { const a = r.int(2, 9), x = r.int(-5, 12), b = r.int(1, 15); return num(`Solve ${a}x + ${b} = ${fmt(a * x + b)}.  x = ?`, x); } },
  { level: 7.4, objective: "Y7 simplify expressions", make: (r) => { const a = r.int(2, 7), b = r.int(3, 8), c = r.int(2, 5); return choice(r, `Simplify ${a}x + ${b}y + ${c}x − y`, `${a + c}x + ${b - 1}y`, [`${a + c}x + ${b + 1}y`, `${a * c}x + ${b - 1}y`, `${a + b + c - 1}xy`], {}, [`${a + c}x + ${b}y`, `${a + c + 1}x + ${b - 1}y`]); } },
  { level: 7.6, objective: "Y7 fractions, decimals and percentages", make: (r) => { const [f, p] = r.pick([["3/4", 75], ["2/5", 40], ["7/20", 35], ["3/8", 37.5], ["4/25", 16]] as [string, number][]); return num(`Write ${f} as a percentage.`, p, { unit: "%" }); } },
  { level: 7.8, objective: "Y7 area of a triangle", make: (r) => { const b = 2 * r.int(3, 12), h = r.int(4, 15); return num(`A triangle has base ${b} cm and perpendicular height ${h} cm. What is its area?`, (b * h) / 2, { unit: "cm²" }); } },
  // ── Year 8 ──
  { level: 8, objective: "Y8 percentage change", make: (r) => { const n = 20 * r.int(5, 40), p = r.pick([10, 15, 20, 25, 30]); const up = r.chance(0.5); return num(`A price of £${n} is ${up ? "increased" : "reduced"} by ${p}%. What is the new price?`, up ? n * (1 + p / 100) : n * (1 - p / 100), { unit: "£", tolerance: 0.005 }); } },
  { level: 8.2, objective: "Y8 expand brackets", make: (r) => { const a = r.int(2, 7), b = r.int(1, 9), c = r.int(2, 9); return choice(r, `Expand ${a}(${c}x − ${b})`, `${a * c}x − ${a * b}`, [`${a * c}x − ${b}`, `${a + c}x − ${a * b}`, `${a * c}x + ${a * b}`], {}, [`${a * c}x − ${a * b + a}`, `${a * c + 1}x − ${a * b}`]); } },
  { level: 8.4, objective: "Y8 nth term of a linear sequence", make: (r) => { const d = r.int(2, 9), c = r.pick([-4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8]); const t = [1, 2, 3, 4].map((n) => d * n + c); return choice(r, `What is the nth term of ${t.map(fmt).join(", ")}, …?`, `${d}n ${c > 0 ? "+" : "−"} ${Math.abs(c)}`, [`n + ${d}`, `${d}n`, `${t[0]}n + ${d}`], {}, [`${d + 1}n ${c > 0 ? "+" : "−"} ${Math.abs(c)}`, `${d}n ${c > 0 ? "−" : "+"} ${Math.abs(c)}`]); } },
  { level: 8.6, objective: "Y8 circumference of a circle", make: (r) => { const d = r.int(4, 20); return num(`A circle has diameter ${d} cm. Find its circumference to 1 decimal place. (Use π = 3.14)`, Math.round(3.14 * d * 10) / 10, { unit: "cm", tolerance: 0.11 }); } },
  { level: 8.8, objective: "Y8 probability", make: (r) => { const red = r.int(2, 7), blue = r.int(2, 7), green = r.int(1, 5); const t = red + blue + green, g = gcd(blue, t); return choice(r, `A bag has ${red} red, ${blue} blue and ${green} green counters. One is taken at random. What is the probability it is blue?`, `${blue / g}/${t / g}`, [`${blue}/${red + green}`, `1/${blue}`, `${blue}/${t + 1}`], {}, [`${blue + 1}/${t}`, `${blue}/${t - 1}`, `1/${t}`]); } },
  // ── Year 9 ──
  { level: 9, objective: "Y9 index laws", make: (r) => { const a = r.int(2, 9), b = r.int(2, 9); return choice(r, `Simplify x${sup(a)} × x${sup(b)}`, `x${sup(a + b)}`, [`x${sup(a * b)}`, `2x${sup(a + b)}`, `x${sup(Math.abs(a - b))}`], {}, [`x${sup(a + b + 1)}`, `${a + b}x`, `2x${sup(a * b)}`]); } },
  { level: 9.2, objective: "Y9 right-angled triangles: find the longest side", make: (r) => { const [a, b, c] = r.pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [7, 24, 25]]); return num(`A right-angled triangle has shorter sides ${a} cm and ${b} cm. How long is the hypotenuse?`, c, { unit: "cm" }); } },
  { level: 9.4, objective: "Y9 standard form", make: (r) => { const m = r.int(11, 98) / 10, e = r.int(3, 7); const M = fmt(m), M10 = fmt(m * 10); return choice(r, `Write ${fmt(m * 10 ** e)} in standard form.`, `${M} × 10${sup(e)}`, [`${M} × 10${sup(e + 1)}`, `${M10} × 10${sup(e - 1)}`, `${M} × 10${sup(e - 1)}`], {}, [`${M} × 10${sup(e + 2)}`]); } },
  { level: 9.6, objective: "Y9 solve inequalities", make: (r) => { const a = r.int(2, 6), b = r.int(1, 12), k = r.int(2, 9); return choice(r, `Solve ${a}x − ${b} > ${fmt(a * k - b)}`, `x > ${k}`, [`x < ${k}`, `x > ${a * k}`, `x > ${k + 1}`], {}, [`x > ${k - 1}`, `x < ${a * k}`]); } },
  { level: 9.8, objective: "Y9 direct proportion / best buy", make: (r) => { const g = r.pick([250, 400, 500]), p = r.int(120, 300); return num(`${g} g of dates cost £${(p / 100).toFixed(2)}. How much would 1 kg cost, in pounds?`, Math.round((p / 100) * (1000 / g) * 100) / 100, { unit: "£", tolerance: 0.005 }); } },
  // ── Year 10 ──
  { level: 10, objective: "Y10 factorise quadratics", make: (r) => { const p = r.int(1, 7), q = r.int(2, 8); return choice(r, `Factorise x² + ${p + q}x + ${p * q}`, `(x + ${p})(x + ${q})`, [`(x + ${p + q})(x + 1)`, `(x − ${p})(x − ${q})`, `x(x + ${p * q})`]); } },
  { level: 10.2, objective: "Y10 simultaneous equations", make: (r) => { const x = r.int(1, 8), y = r.int(1, 8); return num(`x + y = ${x + y} and x − y = ${fmt(x - y)}. What is x?`, x); } },
  { level: 10.4, objective: "Y10 compound interest", make: (r) => { const P = 100 * r.int(5, 40), rate = r.pick([2, 3, 4, 5]), n = r.int(2, 3); return num(`£${P} is invested at ${rate}% compound interest a year. How much is it worth after ${n} years? (to the nearest penny)`, Math.round(P * (1 + rate / 100) ** n * 100) / 100, { unit: "£", tolerance: 0.011 }); } },
  { level: 10.6, objective: "Y10 trigonometry (SOH CAH TOA)", make: (r) => { const hyp = r.int(8, 20); return num(`In a right-angled triangle the hypotenuse is ${hyp} cm and one angle is 30°. How long is the side opposite the 30° angle?`, hyp / 2, { unit: "cm", tolerance: 0.01 }); } },
  { level: 10.8, objective: "Y10 rearrange formulae", make: (r) => { return choice(r, "Make r the subject of A = πr²", "r = √(A/π)", ["r = A/(2π)", "r = √A − π", "r = (A/π)²"]); } },
  // ── Year 11 ──
  { level: 11, objective: "Y11 solve quadratic equations", make: (r) => { const a = r.int(1, 5), b = a + r.int(1, 4); return choice(r, `Solve x² − ${a + b}x + ${a * b} = 0`, `x = ${a} or x = ${b}`, [`x = −${a} or x = −${b}`, `x = ${a + b} or x = ${a * b}`, `x = ${a * b}`]); } },
  { level: 11.2, objective: "Y11 surds", make: (r) => { const k = r.pick([2, 3, 5]), m = r.pick([4, 9, 16, 25]); return choice(r, `Simplify √${k * m}`, `${Math.sqrt(m)}√${k}`, [`${m}√${k}`, `${k}√${m}`, `${Math.sqrt(m) + 1}√${k}`], {}, [`${Math.sqrt(m)}√${k + 1}`]); } },
  { level: 11.4, objective: "Y11 functions and inverse", make: (r) => { const a = r.int(2, 6), b = r.int(1, 9); return choice(r, `f(x) = ${a}x + ${b}. Find f⁻¹(x).`, `(x − ${b})/${a}`, [`${a}x − ${b}`, `(x + ${b})/${a}`, `x/${a} − ${b}`], {}, [`(x − ${a})/${b}`]); } },
  { level: 11.6, objective: "Y11 conditional probability", make: (r) => { const n = r.int(5, 9); return choice(r, `A bag has ${n} sweets, 2 of them orange. Two are taken without replacement. What is the probability both are orange?`, `1/${(n * (n - 1)) / 2}`, [`4/${n * n}`, `2/${n}`, `1/${n}`], {}, [`1/${n * n}`, `1/${n - 1}`]); } },
];

/** Generators whose level is inside the paper's range (see curriculum.ts paperRange). */
export function mathsFor(levelLo: number, levelHi: number): Gen[] {
  return MATHS.filter((g) => g.level >= levelLo - 0.01 && g.level <= levelHi + 0.01);
}
