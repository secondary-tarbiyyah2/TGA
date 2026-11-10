// Printable grids and diagrams for term resources, drawn as SVG (exact, scalable, light on ink).
// Every function returns an SVG string sized in millimetres for an A4 page (182 mm text width).
const W = 182;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const svg = (w, h, inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}" class="grid-svg">${inner}</svg>`;
const LINE = "#B9B3A5";
const INK = "#1B1E21";
const txt = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.size || 3.6}" text-anchor="${o.anchor || "middle"}" fill="${o.color || INK}" font-family="Carlito, Calibri, Arial, sans-serif"${o.bold ? ' font-weight="700"' : ""}>${esc(s)}</text>`;

function squared({ size = 5, height = 230, width = W } = {}) {
  let s = "";
  for (let x = 0; x <= width + 0.01; x += size) s += `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${LINE}" stroke-width="${Math.round(x / size) % 2 === 0 && size < 6 ? 0.25 : 0.2}"/>`;
  for (let y = 0; y <= height + 0.01; y += size) s += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${LINE}" stroke-width="0.2"/>`;
  return svg(width, height, s);
}
function dot({ size = 10, height = 230, width = W } = {}) {
  let s = "";
  for (let x = 1; x <= width; x += size) for (let y = 1; y <= height; y += size) s += `<circle cx="${x}" cy="${y}" r="0.55" fill="#6E6A60"/>`;
  return svg(width, height, s);
}
function isometric({ size = 10, height = 230, width = W } = {}) {
  let s = "";
  const dy = size * Math.sqrt(3) / 2;
  let row = 0;
  for (let y = 1; y <= height; y += dy, row++) for (let x = 1 + (row % 2 ? size / 2 : 0); x <= width; x += size) s += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="0.55" fill="#6E6A60"/>`;
  return svg(width, height, s);
}

/** A safe evaluator for y = f(x) written with x, + - * / ^, brackets and numbers only. */
function fn(expr) {
  const src = String(expr).replace(/\s+/g, "").replace(/²/g, "^2").replace(/³/g, "^3").replace(/−/g, "-");
  if (!/^[0-9x+\-*/^().]+$/.test(src)) return null;
  const js = src.replace(/(\d)(x|\()/g, "$1*$2").replace(/\)(x|\d|\()/g, ")*$1").replace(/x(\d|\()/g, "x*$1").replace(/\^/g, "**");
  try {
    const f = new Function("x", `return (${js});`);
    f(1);
    return f;
  } catch {
    return null;
  }
}

/** Coordinate axes on 2 mm squared paper, labelled, with an optional curve or points to read from. */
function graph({ xMin = -5, xMax = 5, yMin = -5, yMax = 5, xStep = 1, yStep = 1, xLabel = "x", yLabel = "y", curve, points = [], height } = {}) {
  const pad = 9;
  const cols = (xMax - xMin) / xStep;
  const rows = (yMax - yMin) / yStep;
  const unit = Math.min((W - 2 * pad) / cols, ((height || 200) - 2 * pad) / rows);
  const w = cols * unit + 2 * pad;
  const h = rows * unit + 2 * pad;
  const X = (x) => pad + ((x - xMin) / xStep) * unit;
  const Y = (y) => pad + ((yMax - y) / yStep) * unit;
  let s = "";
  // 2 mm minor squares and the major lines at each step
  const minor = unit / Math.max(1, Math.round(unit / 2));
  for (let x = pad; x <= w - pad + 0.01; x += minor) s += `<line x1="${x.toFixed(2)}" y1="${pad}" x2="${x.toFixed(2)}" y2="${h - pad}" stroke="#E3DED2" stroke-width="0.15"/>`;
  for (let y = pad; y <= h - pad + 0.01; y += minor) s += `<line x1="${pad}" y1="${y.toFixed(2)}" x2="${w - pad}" y2="${y.toFixed(2)}" stroke="#E3DED2" stroke-width="0.15"/>`;
  for (let i = 0; i <= cols; i++) s += `<line x1="${(pad + i * unit).toFixed(2)}" y1="${pad}" x2="${(pad + i * unit).toFixed(2)}" y2="${h - pad}" stroke="${LINE}" stroke-width="0.3"/>`;
  for (let j = 0; j <= rows; j++) s += `<line x1="${pad}" y1="${(pad + j * unit).toFixed(2)}" x2="${w - pad}" y2="${(pad + j * unit).toFixed(2)}" stroke="${LINE}" stroke-width="0.3"/>`;
  const ax = xMin <= 0 && xMax >= 0 ? X(0) : X(xMin);
  const ay = yMin <= 0 && yMax >= 0 ? Y(0) : Y(yMin);
  s += `<line x1="${pad}" y1="${ay}" x2="${w - pad}" y2="${ay}" stroke="${INK}" stroke-width="0.5"/><line x1="${ax}" y1="${pad}" x2="${ax}" y2="${h - pad}" stroke="${INK}" stroke-width="0.5"/>`;
  const fmt = (v) => String(Math.round(v * 1000) / 1000).replace("-", "−");
  for (let i = 0; i <= cols; i++) {
    const v = xMin + i * xStep;
    if (v === 0 && yMin < 0) continue;
    s += txt(X(v), ay + 4, fmt(v), { size: 2.8 });
  }
  for (let j = 0; j <= rows; j++) {
    const v = yMin + j * yStep;
    if (v === 0 && xMin < 0) continue;
    s += txt(ax - 1.5, Y(v) + 1, fmt(v), { size: 2.8, anchor: "end" });
  }
  if (xMin < 0 && yMin < 0) s += txt(ax - 1.5, ay + 4, "0", { size: 2.8, anchor: "end" });
  s += txt(w - pad + 3, ay + 1, xLabel, { size: 3.4, anchor: "start" }) + txt(ax, pad - 2.5, yLabel, { size: 3.4 });
  const f = curve ? fn(curve) : null;
  if (f) {
    let d = "";
    const n = 240;
    let pen = false;
    for (let i = 0; i <= n; i++) {
      const x = xMin + ((xMax - xMin) * i) / n;
      const y = f(x);
      if (!Number.isFinite(y) || y < yMin || y > yMax) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${X(x).toFixed(2)},${Y(y).toFixed(2)}`;
      pen = true;
    }
    s += `<path d="${d}" fill="none" stroke="#2F5DA8" stroke-width="0.6"/>`;
  }
  for (const p of points) s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="0.9" fill="#2F5DA8"/>`;
  return svg(w, h, s);
}

/** Number lines, one or more to a page, with labels every so often (or blank for pupils to fill). */
function numberline({ min = 0, max = 20, step = 1, labelEvery = 1, blank = false, count = 1, marks = [] } = {}) {
  const n = Math.round((max - min) / step);
  const pad = 6;
  const unit = (W - 2 * pad) / n;
  const each = 22;
  let s = "";
  for (let r = 0; r < count; r++) {
    const y = 10 + r * each;
    s += `<line x1="${pad - 3}" y1="${y}" x2="${W - pad + 3}" y2="${y}" stroke="${INK}" stroke-width="0.5"/>`;
    s += `<path d="M${pad - 3},${y} l3,-1.5 l0,3 z M${W - pad + 3},${y} l-3,-1.5 l0,3 z" fill="${INK}"/>`;
    for (let i = 0; i <= n; i++) {
      const v = min + i * step;
      const big = i % labelEvery === 0;
      const x = pad + i * unit;
      s += `<line x1="${x}" y1="${y - (big ? 2.4 : 1.4)}" x2="${x}" y2="${y + (big ? 2.4 : 1.4)}" stroke="${INK}" stroke-width="${big ? 0.4 : 0.25}"/>`;
      if (!blank && big) s += txt(x, y + 6.5, String(Math.round(v * 1000) / 1000).replace("-", "−"), { size: n > 40 ? 2.4 : 3.2 });
      if (blank && (i === 0 || i === n)) s += txt(x, y + 6.5, String(v).replace("-", "−"), { size: 3.2 });
    }
    for (const m of marks) s += `<path d="M${pad + ((m.at - min) / step) * unit},${y - 3} l-1.6,-3 l3.2,0 z" fill="#B8892B"/>${m.label ? txt(pad + ((m.at - min) / step) * unit, y - 7.5, m.label, { size: 3 }) : ""}`;
  }
  return svg(W, 10 + count * each - 6, s);
}

/** A 1-100 square (or blank for pupils to fill). */
function hundred({ start = 1, blank = false, cols = 10, rows = 10 } = {}) {
  const c = 15;
  const w = cols * c;
  let s = "";
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      const v = start + r * cols + k;
      s += `<rect x="${1 + k * c}" y="${1 + r * c}" width="${c}" height="${c}" fill="${(r + k) % 2 ? "#FBF7EE" : "#FFFFFF"}" stroke="${LINE}" stroke-width="0.3"/>`;
      if (!blank) s += txt(1 + k * c + c / 2, 1 + r * c + c / 2 + 1.6, String(v), { size: 4.6 });
    }
  return svg(w + 2, rows * c + 2, s);
}

/** Times tables square (multiplication grid). blank: only the headers. */
function times({ size = 12, blank = false } = {}) {
  const c = Math.min(13, 170 / (size + 1));
  let s = "";
  for (let r = 0; r <= size; r++)
    for (let k = 0; k <= size; k++) {
      const head = r === 0 || k === 0;
      s += `<rect x="${1 + k * c}" y="${1 + r * c}" width="${c}" height="${c}" fill="${head ? "#E8EEF8" : r === k ? "#FBF7EE" : "#FFFFFF"}" stroke="${LINE}" stroke-width="0.3"/>`;
      const v = r === 0 && k === 0 ? "×" : r === 0 ? k : k === 0 ? r : blank ? "" : r * k;
      if (v !== "") s += txt(1 + k * c + c / 2, 1 + r * c + c / 2 + 1.5, String(v), { size: 3.8, bold: head });
    }
  return svg((size + 1) * c + 2, (size + 1) * c + 2, s);
}

/** Place value chart with headed columns and empty rows. */
function placevalue({ cols = ["Th", "H", "T", "O"], rows = 4, decimals = 0 } = {}) {
  const c = Math.min(30, (W - 2) / cols.length);
  const hh = 12;
  const rh = 18;
  let s = "";
  cols.forEach((h, k) => {
    s += `<rect x="${1 + k * c}" y="1" width="${c}" height="${hh}" fill="#E8EEF8" stroke="${LINE}" stroke-width="0.3"/>` + txt(1 + k * c + c / 2, 1 + hh / 2 + 1.5, h, { size: 4.2, bold: true });
    for (let r = 0; r < rows; r++) s += `<rect x="${1 + k * c}" y="${1 + hh + r * rh}" width="${c}" height="${rh}" fill="#FFFFFF" stroke="${LINE}" stroke-width="0.3"/>`;
  });
  if (decimals) {
    const x = 1 + (cols.length - decimals) * c;
    s += `<line x1="${x}" y1="1" x2="${x}" y2="${1 + hh + rows * rh}" stroke="${INK}" stroke-width="0.8"/>`;
  }
  return svg(cols.length * c + 2, hh + rows * rh + 2, s);
}

/** Fraction wall: one whole, then each row split into equal parts, labelled with unit fractions. */
function fractionwall({ rows = [1, 2, 3, 4, 5, 6, 8, 10, 12], labels = true } = {}) {
  const rh = 14;
  const w = W - 2;
  const fills = ["#E8EEF8", "#E4F3EA", "#F5ECE0", "#F6E9EF", "#EEEBF8", "#E2F1F4", "#FBEBDD", "#F8E9E3", "#E1F0ED", "#ECECF8", "#F8E6F1", "#E2EEF5"];
  let s = "";
  rows.forEach((d, r) => {
    for (let k = 0; k < d; k++) {
      s += `<rect x="${1 + (k * w) / d}" y="${1 + r * rh}" width="${w / d}" height="${rh}" fill="${fills[r % fills.length]}" stroke="${INK}" stroke-width="0.35"/>`;
      if (labels) s += d === 1 ? txt(1 + w / 2, 1 + r * rh + rh / 2 + 1.6, "1 whole", { size: 4.2, bold: true }) : `<text x="${1 + (k * w) / d + w / d / 2}" y="${1 + r * rh + rh / 2 - 0.5}" font-size="${d > 10 ? 3 : 3.6}" text-anchor="middle" font-family="Carlito, Calibri, Arial, sans-serif" fill="${INK}"><tspan>1</tspan><tspan x="${1 + (k * w) / d + w / d / 2}" dy="${d > 10 ? 3.6 : 4.2}">${d}</tspan></text><line x1="${1 + (k * w) / d + w / d / 2 - 2}" y1="${1 + r * rh + rh / 2}" x2="${1 + (k * w) / d + w / d / 2 + 2}" y2="${1 + r * rh + rh / 2}" stroke="${INK}" stroke-width="0.3"/>`;
    }
  });
  return svg(W, rows.length * rh + 2, s);
}

/** Ten frames (2 x 5), several to a page. */
function tenframe({ count = 2, filled = [] } = {}) {
  const c = 16;
  let s = "";
  for (let f = 0; f < count; f++) {
    const ox = 1 + (f % 2) * (5 * c + 12);
    const oy = 1 + Math.floor(f / 2) * (2 * c + 12);
    for (let r = 0; r < 2; r++)
      for (let k = 0; k < 5; k++) {
        s += `<rect x="${ox + k * c}" y="${oy + r * c}" width="${c}" height="${c}" fill="#FFFFFF" stroke="${INK}" stroke-width="0.5"/>`;
        if ((filled[f] || 0) > r * 5 + k) s += `<circle cx="${ox + k * c + c / 2}" cy="${oy + r * c + c / 2}" r="${c / 3}" fill="#2F5DA8"/>`;
      }
  }
  return svg(2 * (5 * c + 12), Math.ceil(count / 2) * (2 * c + 12), s);
}

/** Cut-out cards: numbers, prices or words, in a grid with dashed cut lines. */
function cards({ items = [], cols = 4, height = 26, size = 6 } = {}) {
  const c = W / cols;
  const rows = Math.ceil(items.length / cols);
  let s = "";
  items.forEach((it, i) => {
    const x = (i % cols) * c;
    const y = Math.floor(i / cols) * height;
    s += `<rect x="${x + 0.3}" y="${y + 0.3}" width="${c - 0.6}" height="${height - 0.6}" fill="#FFFFFF" stroke="#8C877C" stroke-width="0.3" stroke-dasharray="1.5 1"/>`;
    const lines = String(it).split("\n");
    lines.forEach((ln, j) => (s += txt(x + c / 2, y + height / 2 + 2 + (j - (lines.length - 1) / 2) * (size + 1), ln, { size: lines.length > 1 ? size * 0.7 : size, bold: j === 0 })));
  });
  return svg(W, rows * height + 1, s);
}

/** Analogue clock faces, blank hands unless times are given ("3:30"). */
function clock({ count = 6, times = [] } = {}) {
  const per = 3;
  const cw = W / per;
  const r = 24;
  let s = "";
  for (let i = 0; i < count; i++) {
    const cx = (i % per) * cw + cw / 2;
    const cy = Math.floor(i / per) * (2 * r + 18) + r + 3;
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#FFFFFF" stroke="${INK}" stroke-width="0.6"/>`;
    for (let m = 0; m < 60; m++) {
      const a = (m / 60) * 2 * Math.PI;
      const l = m % 5 === 0 ? 2.6 : 1.2;
      s += `<line x1="${cx + Math.sin(a) * (r - l)}" y1="${cy - Math.cos(a) * (r - l)}" x2="${cx + Math.sin(a) * r}" y2="${cy - Math.cos(a) * r}" stroke="${INK}" stroke-width="${m % 5 === 0 ? 0.5 : 0.25}"/>`;
    }
    for (let hNum = 1; hNum <= 12; hNum++) {
      const a = (hNum / 12) * 2 * Math.PI;
      s += txt(cx + Math.sin(a) * (r - 6.5), cy - Math.cos(a) * (r - 6.5) + 1.4, String(hNum), { size: 3.8 });
    }
    s += `<circle cx="${cx}" cy="${cy}" r="0.9" fill="${INK}"/>`;
    const t = times[i];
    if (t) {
      const [hh, mm] = String(t).split(":").map(Number);
      const am = (mm / 60) * 2 * Math.PI;
      const ah = (((hh % 12) + mm / 60) / 12) * 2 * Math.PI;
      s += `<line x1="${cx}" y1="${cy}" x2="${cx + Math.sin(am) * (r - 5)}" y2="${cy - Math.cos(am) * (r - 5)}" stroke="${INK}" stroke-width="0.8"/><line x1="${cx}" y1="${cy}" x2="${cx + Math.sin(ah) * (r - 11)}" y2="${cy - Math.cos(ah) * (r - 11)}" stroke="${INK}" stroke-width="1.3"/>`;
    }
    s += `<line x1="${cx - 18}" y1="${cy + r + 10}" x2="${cx + 18}" y2="${cy + r + 10}" stroke="${LINE}" stroke-width="0.4"/>`;
  }
  return svg(W, Math.ceil(count / per) * (2 * r + 18) + 2, s);
}

/** Empty axes for a bar chart or line graph with category labels. */
function barchart({ cats = [], yMax = 10, yStep = 1, yLabel = "", xLabel = "" } = {}) {
  const pad = 14;
  const h = 110;
  const cw = (W - pad - 4) / Math.max(1, cats.length);
  const rows = Math.round(yMax / yStep);
  const unit = (h - 22) / rows;
  let s = "";
  for (let j = 0; j <= rows; j++) {
    const y = h - 14 - j * unit;
    s += `<line x1="${pad}" y1="${y}" x2="${W - 4}" y2="${y}" stroke="#E3DED2" stroke-width="0.25"/>` + txt(pad - 2, y + 1, String(Math.round(j * yStep * 100) / 100), { size: 2.8, anchor: "end" });
  }
  s += `<line x1="${pad}" y1="${h - 14}" x2="${W - 4}" y2="${h - 14}" stroke="${INK}" stroke-width="0.5"/><line x1="${pad}" y1="6" x2="${pad}" y2="${h - 14}" stroke="${INK}" stroke-width="0.5"/>`;
  cats.forEach((c, i) => (s += txt(pad + cw * i + cw / 2, h - 8, c, { size: cats.length > 6 ? 2.6 : 3.2 })));
  if (yLabel) s += `<text x="3" y="${h / 2}" font-size="3" transform="rotate(-90 3 ${h / 2})" text-anchor="middle" font-family="Carlito, Calibri, Arial, sans-serif">${esc(yLabel)}</text>`;
  if (xLabel) s += txt(W / 2, h - 1.5, xLabel, { size: 3.2 });
  return svg(W, h, s);
}

/** A colour wheel of `segments` empty segments (6 or 12), optionally labelled outside, with an inner ring. */
function wheel({ segments = 6, labels = [], ring = false } = {}) {
  const cx = W / 2;
  const R = 62;
  const r0 = ring ? 30 : 0;
  const cy = R + 12;
  let s = "";
  for (let i = 0; i < segments; i++) {
    const a0 = ((i / segments) * 2 - 0.5) * Math.PI - Math.PI / segments;
    const a1 = a0 + (2 * Math.PI) / segments;
    const p = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    s += `<path d="M${p(r0 || 0.01, a0)} L${p(R, a0)} A${R},${R} 0 0 1 ${p(R, a1)} L${p(r0 || 0.01, a1)} ${r0 ? `A${r0},${r0} 0 0 0 ${p(r0, a0)}` : ""} Z" fill="#FFFFFF" stroke="${INK}" stroke-width="0.5"/>`;
    const am = (a0 + a1) / 2;
    if (labels[i]) s += txt(cx + (R + 7) * Math.cos(am), cy + (R + 7) * Math.sin(am) + 1.2, labels[i], { size: 3.4 });
  }
  return svg(W, 2 * R + 24, s);
}
/** A row (or grid) of empty boxes with labels under them: tonal scales, mark-making grids, mixing strips. */
function boxes({ count = 7, cols = 7, labels = [], height = 22, gap = 2 } = {}) {
  const bw = (W - gap * (cols - 1)) / cols;
  const rows = Math.ceil(count / cols);
  const rh = height + (labels.length ? 7 : 0) + 3;
  let s = "";
  for (let i = 0; i < count; i++) {
    const x = (i % cols) * (bw + gap);
    const y = Math.floor(i / cols) * rh;
    s += `<rect x="${x + 0.3}" y="${y + 0.3}" width="${bw - 0.6}" height="${height}" fill="#FFFFFF" stroke="${INK}" stroke-width="0.45"/>`;
    if (labels[i]) s += txt(x + bw / 2, y + height + 5, labels[i], { size: cols > 6 ? 2.8 : 3.4 });
  }
  return svg(W, rows * rh, s);
}
/** Two-point (or one-point) perspective guide: horizon line, vanishing points and faint guide lines. */
function perspective({ points = 2, height = 150 } = {}) {
  const hy = height * 0.42;
  const vps = points === 1 ? [[W / 2, hy]] : [[6, hy], [W - 6, hy]];
  let s = `<line x1="0" y1="${hy}" x2="${W}" y2="${hy}" stroke="${INK}" stroke-width="0.5"/>` + txt(W / 2, hy - 2, "horizon line", { size: 3, color: "#8C877C" });
  for (const [vx, vy] of vps) {
    for (let k = 0; k <= 12; k++) {
      const ty = (height / 12) * k;
      const tx = points === 1 ? (k % 2 ? 0 : W) : vx < W / 2 ? W : 0;
      s += `<line x1="${vx}" y1="${vy}" x2="${tx}" y2="${ty}" stroke="#D9D3C5" stroke-width="0.25"/>`;
    }
    s += `<circle cx="${vx}" cy="${vy}" r="1.3" fill="#B8892B"/>` + txt(vx + (vx < W / 2 ? 2 : -2), vy + 6, "VP", { size: 3, anchor: vx < W / 2 ? "start" : "end" });
  }
  return svg(W, height, s);
}
/** Construction for an eight-pointed star (khatam): a circle, eight equal points and two overlapping squares, drawn faintly to go over. */
function star8({ size = 130 } = {}) {
  const c = size / 2 + 2;
  const r = size / 2;
  const pts = Array.from({ length: 8 }, (_, i) => [c + r * Math.cos((i * Math.PI) / 4 - Math.PI / 2), c + r * Math.sin((i * Math.PI) / 4 - Math.PI / 2)]);
  let s = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#B9B3A5" stroke-width="0.4"/>`;
  for (const [x, y] of pts) s += `<line x1="${c}" y1="${c}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="#E3DED2" stroke-width="0.3"/>`;
  const sq = (o) => `<polygon points="${[0, 2, 4, 6].map((i) => pts[(i + o) % 8].map((v) => v.toFixed(2)).join(",")).join(" ")}" fill="none" stroke="#B9B3A5" stroke-width="0.45" stroke-dasharray="1.6 1"/>`;
  s += sq(0) + sq(1);
  for (const [x, y] of pts) s += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1" fill="#B8892B"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size + 4}mm" height="${size + 4}mm" viewBox="0 0 ${size + 4} ${size + 4}" class="grid-svg">${s}</svg>`;
}
/** A simple schematic map: areas (circles), roads (lines) and places (labelled points). Not to scale unless it says so. */
function schematic({ height = 120, areas = [], roads = [], places = [], scale = "", north = true } = {}) {
  let s = `<rect x="0.3" y="0.3" width="${W - 0.6}" height="${height - 0.6}" fill="#FBF7EE" stroke="#B9B3A5" stroke-width="0.4"/>`;
  for (const [x, y, r, label] of areas) s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#F1EDE3" stroke="#B9B3A5" stroke-width="0.4"/>` + txt(x, y + 1.2, label, { size: 3.4, color: "#5B6168" });
  for (const [x1, y1, x2, y2, label, wide] of roads) s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${wide ? "#2F5DA8" : "#8C877C"}" stroke-width="${wide ? 2.2 : 1}"/>` + (label ? txt((x1 + x2) / 2, (y1 + y2) / 2 - 2.5, label, { size: 3, color: wide ? "#2F5DA8" : "#5B6168" }) : "");
  for (const [x, y, label, tone] of places) s += `<circle cx="${x}" cy="${y}" r="2.4" fill="${tone === "gold" ? "#B8892B" : "#1B1E21"}"/>` + txt(x, y - 4, label, { size: 3.6, bold: true });
  if (scale) s += txt(W - 4, height - 4, scale, { size: 2.8, anchor: "end", color: "#5B6168" });
  if (north) s += `<path d="M${W - 12},14 l3,-8 l3,8 l-3,-2 z" fill="${INK}"/>` + txt(W - 9, 19, "N", { size: 3.2, bold: true });
  return svg(W, height, s);
}

// Periodic table (groups 1-7 and 0, transition metals; lanthanides and actinides left out as in GCSE data sheets).
// [Z, symbol, name, relative atomic mass (rounded as on exam data sheets; [ ] = mass number of the most stable isotope)]
const ELEMENTS = `1 H hydrogen 1;2 He helium 4;3 Li lithium 7;4 Be beryllium 9;5 B boron 11;6 C carbon 12;7 N nitrogen 14;8 O oxygen 16;9 F fluorine 19;10 Ne neon 20;11 Na sodium 23;12 Mg magnesium 24;13 Al aluminium 27;14 Si silicon 28;15 P phosphorus 31;16 S sulfur 32;17 Cl chlorine 35.5;18 Ar argon 40;19 K potassium 39;20 Ca calcium 40;21 Sc scandium 45;22 Ti titanium 48;23 V vanadium 51;24 Cr chromium 52;25 Mn manganese 55;26 Fe iron 56;27 Co cobalt 59;28 Ni nickel 59;29 Cu copper 63.5;30 Zn zinc 65;31 Ga gallium 70;32 Ge germanium 73;33 As arsenic 75;34 Se selenium 79;35 Br bromine 80;36 Kr krypton 84;37 Rb rubidium 85;38 Sr strontium 88;39 Y yttrium 89;40 Zr zirconium 91;41 Nb niobium 93;42 Mo molybdenum 96;43 Tc technetium [98];44 Ru ruthenium 101;45 Rh rhodium 103;46 Pd palladium 106;47 Ag silver 108;48 Cd cadmium 112;49 In indium 115;50 Sn tin 119;51 Sb antimony 122;52 Te tellurium 128;53 I iodine 127;54 Xe xenon 131;55 Cs caesium 133;56 Ba barium 137;57 La lanthanum 139;72 Hf hafnium 178;73 Ta tantalum 181;74 W tungsten 184;75 Re rhenium 186;76 Os osmium 190;77 Ir iridium 192;78 Pt platinum 195;79 Au gold 197;80 Hg mercury 201;81 Tl thallium 204;82 Pb lead 207;83 Bi bismuth 209;84 Po polonium [209];85 At astatine [210];86 Rn radon [222];87 Fr francium [223];88 Ra radium [226];89 Ac actinium [227]`
  .split(";")
  .map((r) => {
    const [z, sym, name, ar] = r.split(" ");
    return { z: Number(z), sym, name, ar };
  });
function periodicPos(z) {
  if (z === 1) return [0, 0];
  if (z === 2) return [17, 0];
  const starts = [
    [3, 1],
    [11, 2],
    [19, 3],
    [37, 4],
    [55, 5],
    [87, 6],
  ];
  for (let i = starts.length - 1; i >= 0; i--) {
    const [s0, row] = starts[i];
    if (z < s0) continue;
    const k = z - s0;
    if (row <= 2) return [k < 2 ? k : k + 10, row];
    if (row >= 5) {
      if (k < 3) return [k, row]; // Cs, Ba, La / Fr, Ra, Ac
      return [z - (row === 5 ? 72 : 104) + 3, row];
    }
    return [k, row];
  }
  return null;
}
function periodic({ ar = true } = {}) {
  const c = W / 18;
  const h = c * 1.25;
  let s = "";
  const groupOf = (col) => (col <= 1 ? col + 1 : col >= 12 ? (col === 17 ? 0 : col - 10) : null);
  for (let col = 0; col < 18; col++) {
    const g = groupOf(col);
    if (g !== null) s += txt(col * c + c / 2, 4, String(g), { size: 2.8, bold: true });
  }
  for (const e of ELEMENTS) {
    const p = periodicPos(e.z);
    if (!p) continue;
    const [col, row] = p;
    const x = col * c;
    const y = 6 + row * h;
    const tm = col >= 2 && col <= 11;
    s += `<rect x="${x + 0.2}" y="${y + 0.2}" width="${c - 0.4}" height="${h - 0.4}" fill="${tm ? "#F5ECE0" : e.z === 1 ? "#FFFFFF" : "#E4F3EA"}" stroke="#8C877C" stroke-width="0.25"/>`;
    if (ar) s += txt(x + c / 2, y + 3, e.ar, { size: 2 });
    s += txt(x + c / 2, y + h / 2 + 1.4, e.sym, { size: 3.8, bold: true });
    s += txt(x + c / 2, y + h - 1.2, String(e.z), { size: 2 });
  }
  // key
  const kx = 2.3 * c;
  const ky = 6 + 0.05 * h;
  s += `<rect x="${kx}" y="${ky}" width="${c}" height="${h}" fill="#FFFFFF" stroke="${INK}" stroke-width="0.3"/>` + txt(kx + c / 2, ky + 3, ar ? "Ar" : "", { size: 2 }) + txt(kx + c / 2, ky + h / 2 + 1.4, "X", { size: 3.8, bold: true }) + txt(kx + c / 2, ky + h - 1.2, "Z", { size: 2 });
  s += txt(kx + c + 2, ky + 3, ar ? "relative atomic mass" : "", { size: 2.4, anchor: "start" }) + txt(kx + c + 2, ky + h / 2 + 1.4, "symbol", { size: 2.4, anchor: "start" }) + txt(kx + c + 2, ky + h - 1.2, "atomic (proton) number", { size: 2.4, anchor: "start" });
  s += txt(W / 2, 6 + 7 * h + 4, "Elements 58 to 71 and from 90 onwards are not shown.", { size: 2.6 });
  return svg(W, 6 + 7 * h + 6, s);
}

export const GRID_KINDS = { squared, dot, isometric, graph, numberline, hundred, times, placevalue, fractionwall, tenframe, cards, clock, barchart, periodic, wheel, boxes, perspective, star8, schematic };
export function gridSvg(spec = {}) {
  const f = GRID_KINDS[spec.kind];
  if (!f) throw new Error(`Unknown grid kind "${spec.kind}"`);
  return f(spec);
}
export { esc, fn };
