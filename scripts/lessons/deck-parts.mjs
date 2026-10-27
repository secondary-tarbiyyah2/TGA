// Subject identities and the richer teach-slide types for build-decks.mjs.
//
// Every subject gets its own look so a pupil (or a teacher flicking through
// the library) can tell a deck apart at a glance: a palette, a heading
// typeface that ships with PowerPoint, and title-slide artwork drawn from
// shapes (graph paper for maths, molecules for science, contour lines for
// geography, a terminal for computing, girih stars for Arabic…).
//
// Teach slides can carry one optional "block" besides their bullets; each
// block has its own layout (see README.md in content/lessons):
//   model         worked example, "I do": problem, steps, answer
//   check         hinge question for AfL: four options on mini-whiteboards
//   quote         a quotation or source extract to annotate
//   compare       two columns side by side
//   timeline      dated or ordered events
//   table         a small data table
//   code          a program listing in a terminal
//   misconception "not this / but this"
//   cycle         a repeating process drawn as a loop

export const BLOCK_KINDS = ["model", "check", "quote", "compare", "timeline", "table", "code", "misconception", "cycle"];

// ── Themes ─────────────────────────────────────────────────────────────────
// accent: the subject colour; dark: title/panel background; soft: tint
// panels; head: heading typeface; motif: title-slide artwork.
const T = (accent, dark, soft, head, motif, extra = {}) => ({ accent, dark, soft, head, motif, ...extra });
export const THEMES = {
  mathematics: T("2F5DA8", "13284D", "E8EEF8", "Cambria", "grid"),
  english: T("8A3B5B", "3A1626", "F6E9EF", "Georgia", "quote"),
  "english-language": T("8A3B5B", "3A1626", "F6E9EF", "Georgia", "quote"),
  "english-literature": T("6E2C4A", "2E1020", "F3E6EC", "Georgia", "quote"),
  science: T("2E7D4F", "0F3323", "E4F3EA", "Trebuchet MS", "hex"),
  "gcse-science": T("2E7D4F", "0F3323", "E4F3EA", "Trebuchet MS", "hex"),
  history: T("8C5A2B", "3B2412", "F5ECE0", "Georgia", "timeline"),
  geography: T("2F7A8C", "0E3540", "E2F1F4", "Trebuchet MS", "contour"),
  computing: T("4C4C9A", "12142B", "ECECF8", "Consolas", "code"),
  arabic: T("A5472B", "40180D", "F8E9E3", "Cambria", "girih"),
  "islamic-studies": T("1F6F6B", "0F3D3A", "E3F2F0", "Cambria", "arabesque"),
  quran: T("0F5A52", "0A2F2B", "E1F0ED", "Cambria", "mushaf"),
  art: T("B4538F", "3D1530", "F8E6F1", "Georgia", "swatch"),
  pe: T("C0601C", "40200A", "FBEBDD", "Trebuchet MS", "lanes"),
  pshe: T("6B5CA5", "251D45", "EEEBF8", "Trebuchet MS", "circles"),
  business: T("2A6F97", "0D2A3B", "E2EEF5", "Trebuchet MS", "bars"),
};
export const themeFor = (slug) => THEMES[slug] || T("1F6F6B", "0F3D3A", "E3F2F0", "Calibri", "arabesque");

export function makeParts(h) {
  const { fitSize, clean, FONT, INK, MUTED, GOLD, GOLD_DARK, GOLD_SOFT, CREAM, LINE } = h;
  const t = (s) => clean(s);

  // ── Motifs ───────────────────────────────────────────────────────────────
  // Drawn into a box {x,y,w,h} on a dark slide. `c` = light ink colour.
  const line = (s, x, y, w, hh, color, width, transparency = 0) => s.addShape("line", { x, y, w, h: hh, line: { color, width, transparency } });

  const motifs = {
    grid(s, b, th) {
      const step = 0.42;
      for (let x = b.x; x <= b.x + b.w + 0.01; x += step) line(s, x, b.y, 0, b.h, "FFFFFF", 0.5, 86);
      for (let y = b.y; y <= b.y + b.h + 0.01; y += step) line(s, b.x, y, b.w, 0, "FFFFFF", 0.5, 86);
      // axes
      const ox = b.x + b.w * 0.42;
      const oy = b.y + b.h * 0.72;
      line(s, b.x, oy, b.w, 0, "FFFFFF", 1.5, 40);
      line(s, ox, b.y, 0, b.h, "FFFFFF", 1.5, 40);
      // y = x² - 2 traced with short segments
      const sx = 0.42;
      let prev = null;
      for (let i = -3.2; i <= 3.2; i += 0.2) {
        const px = ox + i * sx;
        const py = oy - (i * i - 2) * sx * 0.55;
        if (prev && py > b.y && prev[1] > b.y) s.addShape("line", { x: Math.min(prev[0], px), y: Math.min(prev[1], py), w: Math.abs(px - prev[0]), h: Math.abs(py - prev[1]), flipV: (py < prev[1]) !== (px < prev[0]), line: { color: "E3C98F", width: 3 } });
        prev = [px, py];
      }
      [["π", 0.1, 0.05], ["√", 0.7, 0.18], ["Σ", 0.12, 0.8], ["∞", 0.74, 0.85]].forEach(([g, fx, fy]) =>
        s.addText(g, { x: b.x + b.w * fx, y: b.y + b.h * fy - 0.4, w: 1.0, h: 0.9, fontFace: "Cambria", fontSize: 40, color: "FFFFFF", transparency: 70, align: "center" }),
      );
    },
    hex(s, b) {
      const r = 0.62;
      const pts = [[0.3, 0.2], [0.55, 0.36], [0.55, 0.62], [0.3, 0.78], [0.8, 0.2], [0.8, 0.5]];
      const P = pts.map(([fx, fy]) => [b.x + b.w * fx, b.y + b.h * fy]);
      [[0, 1], [1, 2], [2, 3], [1, 4], [2, 5]].forEach(([i, j]) => {
        const [x1, y1] = P[i];
        const [x2, y2] = P[j];
        s.addShape("line", { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001, flipV: (y2 < y1) !== (x2 < x1), line: { color: "FFFFFF", width: 3, transparency: 55 } });
      });
      P.forEach(([x, y], i) => {
        const d = i % 3 === 0 ? r * 1.1 : r * 0.8;
        s.addShape("hexagon", { x: x - d / 2, y: y - d / 2, w: d, h: d * 0.88, fill: { color: i % 2 ? "E3C98F" : "FFFFFF", transparency: i % 2 ? 20 : 75 }, line: { color: "FFFFFF", width: 1.5, transparency: 40 } });
      });
      // atom
      const ax = b.x + b.w * 0.18;
      const ay = b.y + b.h * 0.5;
      [0, 60, 120].forEach((rot) => s.addShape("ellipse", { x: ax - 0.9, y: ay - 0.32, w: 1.8, h: 0.64, rotate: rot, fill: { color: "FFFFFF", transparency: 100 }, line: { color: "FFFFFF", width: 1.25, transparency: 45 } }));
      s.addShape("ellipse", { x: ax - 0.14, y: ay - 0.14, w: 0.28, h: 0.28, fill: { color: "E3C98F" }, line: { color: "E3C98F", width: 0 } });
    },
    quote(s, b) {
      for (let i = 0; i < 9; i++) line(s, b.x, b.y + 0.9 + i * 0.62, b.w, 0, "FFFFFF", 0.75, 80);
      line(s, b.x + 0.55, b.y, 0, b.h, "E8A0B8", 1.25, 45);
      s.addText("“", { x: b.x + 0.9, y: b.y + 0.2, w: 3, h: 3.2, fontFace: "Georgia", fontSize: 260, color: "E3C98F", transparency: 30 });
      s.addText("Aa", { x: b.x + b.w - 2.2, y: b.y + b.h - 1.9, w: 2, h: 1.4, fontFace: "Georgia", fontSize: 72, italic: true, color: "FFFFFF", transparency: 70 });
    },
    timeline(s, b) {
      const x0 = b.x + b.w * 0.5;
      line(s, x0, b.y + 0.2, 0, b.h - 0.4, "E3C98F", 2.5, 20);
      const ticks = 6;
      for (let i = 0; i < ticks; i++) {
        const y = b.y + 0.5 + (i * (b.h - 1)) / (ticks - 1);
        const left = i % 2 === 0;
        s.addShape("ellipse", { x: x0 - 0.13, y: y - 0.13, w: 0.26, h: 0.26, fill: { color: i === 3 ? "E3C98F" : "FFFFFF" }, line: { color: "E3C98F", width: 1.5 } });
        s.addShape("rect", { x: left ? x0 - 1.85 : x0 + 0.35, y: y - 0.22, w: 1.5, h: 0.44, fill: { color: "FFFFFF", transparency: 85 }, line: { color: "FFFFFF", width: 0.75, transparency: 60 } });
        line(s, left ? x0 - 0.35 : x0 + 0.13, y, 0.22, 0, "FFFFFF", 1, 50);
      }
    },
    contour(s, b) {
      const cx = b.x + b.w * 0.5;
      const cy = b.y + b.h * 0.52;
      for (let i = 7; i >= 1; i--) {
        const w = i * 0.62;
        const hh = i * 0.48;
        s.addShape("ellipse", { x: cx - w / 2 + i * 0.05, y: cy - hh / 2 - i * 0.04, w, h: hh, rotate: 12 - i * 3, fill: { color: "FFFFFF", transparency: i === 1 ? 70 : 100 }, line: { color: i % 2 ? "E3C98F" : "FFFFFF", width: 1.25, transparency: 30 + i * 5 } });
      }
      // compass rose
      const kx = b.x + b.w - 1.1;
      const ky = b.y + 0.4;
      s.addShape("triangle", { x: kx, y: ky, w: 0.5, h: 0.75, fill: { color: "E3C98F" }, line: { color: "E3C98F", width: 0 } });
      s.addText("N", { x: kx - 0.05, y: ky + 0.75, w: 0.6, h: 0.4, fontFace: "Trebuchet MS", fontSize: 16, bold: true, color: "FFFFFF", align: "center" });
    },
    code(s, b) {
      s.addShape("roundRect", { x: b.x + 0.2, y: b.y + 0.3, w: b.w - 0.4, h: b.h - 0.6, rectRadius: 0.12, fill: { color: "000000", transparency: 55 }, line: { color: "8A8AD6", width: 1, transparency: 40 } });
      ["FF6058", "FFBD2E", "28C940"].forEach((c, i) => s.addShape("ellipse", { x: b.x + 0.45 + i * 0.3, y: b.y + 0.5, w: 0.18, h: 0.18, fill: { color: c }, line: { color: c, width: 0 } }));
      const lines = [
        [["def ", "C678DD"], ["learn", "61AFEF"], ["(topic):", "ABB2BF"]],
        [["    for ", "C678DD"], ["step ", "E5C07B"], ["in ", "C678DD"], ["topic:", "ABB2BF"]],
        [["        practise", "61AFEF"], ["(step)", "ABB2BF"]],
        [["    return ", "C678DD"], ["mastery", "98C379"]],
        [["", "ABB2BF"]],
        [["# bismillah", "7F848E"]],
        [["learn", "61AFEF"], ["(", "ABB2BF"], ["\"computing\"", "98C379"], [")", "ABB2BF"]],
      ];
      lines.forEach((parts, i) =>
        s.addText(parts.map(([text, color]) => ({ text, options: { color } })), { x: b.x + 0.45, y: b.y + 0.9 + i * 0.5, w: b.w - 0.8, h: 0.45, fontFace: "Consolas", fontSize: Math.min(15, Math.floor(b.w * 4)), valign: "middle" }),
      );
      s.addShape("rect", { x: b.x + 0.5, y: b.y + 0.95 + lines.length * 0.5, w: 0.16, h: 0.32, fill: { color: "E3C98F" }, line: { color: "E3C98F", width: 0 } });
    },
    girih(s, b) {
      const size = 1.05;
      for (let r = 0; r < Math.ceil(b.h / size); r++) {
        for (let c = 0; c < Math.ceil(b.w / size); c++) {
          const x = b.x + c * size;
          const y = b.y + r * size;
          s.addShape("star8", { x, y, w: size, h: size, fill: { color: "FFFFFF", transparency: (r + c) % 3 === 0 ? 78 : 92 }, line: { color: "E3C98F", width: 0.75, transparency: 50 } });
          s.addShape("octagon", { x: x + size * 0.32, y: y + size * 0.32, w: size * 0.36, h: size * 0.36, fill: { color: "E3C98F", transparency: (r + c) % 2 ? 60 : 85 }, line: { color: "E3C98F", width: 0 } });
        }
      }
      s.addText("ض", { x: b.x + b.w * 0.35, y: b.y + b.h * 0.3, w: 2.2, h: 2.2, fontFace: "Arial", fontSize: 130, color: "FFFFFF", transparency: 25, align: "center", valign: "middle", rtlMode: true });
    },
    arabesque(s, b) {
      const size = 1.2;
      for (let r = 0; r < Math.ceil(b.h / (size * 0.75)) + 1; r++) {
        for (let c = 0; c < Math.ceil(b.w / size) + 1; c++) {
          const x = b.x + c * size + (r % 2 ? size / 2 : 0) - size / 2;
          const y = b.y + r * size * 0.75 - size * 0.1;
          if (x < b.x - 0.3 || y < b.y - 0.15 || x + size > b.x + b.w + 0.3 || y + size > b.y + b.h + 0.3) continue;
          s.addShape("rect", { x: x + size * 0.18, y: y + size * 0.18, w: size * 0.64, h: size * 0.64, fill: { color: "FFFFFF", transparency: 100 }, line: { color: "E3C98F", width: 1, transparency: 45 } });
          s.addShape("rect", { x: x + size * 0.18, y: y + size * 0.18, w: size * 0.64, h: size * 0.64, rotate: 45, fill: { color: "FFFFFF", transparency: 100 }, line: { color: "E3C98F", width: 1, transparency: 45 } });
          s.addShape("ellipse", { x: x + size * 0.43, y: y + size * 0.43, w: size * 0.14, h: size * 0.14, fill: { color: "E3C98F", transparency: 40 }, line: { color: "E3C98F", width: 0 } });
        }
      }
    },
    mushaf(s, b) {
      s.addShape("roundRect", { x: b.x + 0.2, y: b.y + 0.2, w: b.w - 0.4, h: b.h - 0.4, rectRadius: 0.2, fill: { color: "FFFFFF", transparency: 100 }, line: { color: "E3C98F", width: 3, transparency: 15 } });
      s.addShape("roundRect", { x: b.x + 0.4, y: b.y + 0.4, w: b.w - 0.8, h: b.h - 0.8, rectRadius: 0.15, fill: { color: "FFFFFF", transparency: 94 }, line: { color: "E3C98F", width: 1, transparency: 40 } });
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([fx, fy]) => s.addShape("star8", { x: b.x + fx * (b.w - 0.75) + 0.02, y: b.y + fy * (b.h - 0.75) + 0.02, w: 0.7, h: 0.7, fill: { color: "E3C98F" }, line: { color: "E3C98F", width: 0 } }));
      s.addShape("ellipse", { x: b.x + b.w / 2 - 1.1, y: b.y + b.h / 2 - 1.1, w: 2.2, h: 2.2, fill: { color: "FFFFFF", transparency: 100 }, line: { color: "E3C98F", width: 2, transparency: 20 } });
      s.addShape("star8", { x: b.x + b.w / 2 - 0.8, y: b.y + b.h / 2 - 0.8, w: 1.6, h: 1.6, fill: { color: "E3C98F", transparency: 55 }, line: { color: "E3C98F", width: 1 } });
    },
    swatch(s, b) {
      const cols = ["E85D75", "F2B33D", "4FA3D9", "5BB36A", "9B7BD0", "EE7A5B"];
      cols.forEach((c, i) => {
        const x = b.x + (i % 3) * (b.w / 3) + 0.2;
        const y = b.y + Math.floor(i / 3) * (b.h / 2) + 0.4 + (i % 2) * 0.3;
        s.addShape("ellipse", { x, y, w: 1.5, h: 1.15, rotate: i * 23, fill: { color: c, transparency: 15 }, line: { color: c, width: 0 } });
        s.addShape("ellipse", { x: x + 0.9, y: y + 0.75, w: 0.45, h: 0.35, fill: { color: c, transparency: 25 }, line: { color: c, width: 0 } });
      });
      s.addShape("rect", { x: b.x + 0.3, y: b.y + b.h - 0.9, w: b.w - 0.8, h: 0.22, rotate: -6, fill: { color: "FFFFFF", transparency: 35 }, line: { color: "FFFFFF", width: 0 } });
    },
    lanes(s, b) {
      for (let i = 0; i < 6; i++) {
        const d = 3.0 + i * 0.75;
        s.addShape("arc", { x: b.x + b.w - d / 2 - 0.3, y: b.y + b.h - d / 2 - 0.2, w: d, h: d, angleRange: [180, 270], line: { color: "FFFFFF", width: 2, transparency: 35 + i * 6 } });
      }
      for (let i = 0; i < 6; i++) s.addText(String(i + 1), { x: b.x + b.w - 0.65 - (1.5 + i * 0.375), y: b.y + b.h - 0.75, w: 0.36, h: 0.4, fontFace: "Trebuchet MS", fontSize: 14, bold: true, color: "E3C98F", align: "center" });
      s.addShape("rect", { x: b.x + 0.4, y: b.y + 0.5, w: 0.5, h: 2.0, fill: { color: "FFFFFF", transparency: 70 }, line: { color: "FFFFFF", width: 0 } });
      s.addShape("rect", { x: b.x + 0.9, y: b.y + 0.5, w: 0.5, h: 2.0, fill: { color: "E3C98F", transparency: 40 }, line: { color: "E3C98F", width: 0 } });
    },
    circles(s, b) {
      const cols = ["E3C98F", "FFFFFF", "B7A9F0"];
      [[0.25, 0.3], [0.52, 0.3], [0.385, 0.55]].forEach(([fx, fy], i) =>
        s.addShape("ellipse", { x: b.x + b.w * fx - 1.2, y: b.y + b.h * fy - 1.2, w: 2.4, h: 2.4, fill: { color: cols[i], transparency: 72 }, line: { color: cols[i], width: 1.5, transparency: 30 } }),
      );
      s.addShape("heart", { x: b.x + b.w * 0.385 - 0.3, y: b.y + b.h * 0.42 - 0.25, w: 0.6, h: 0.55, fill: { color: "E3C98F" }, line: { color: "E3C98F", width: 0 } });
    },
    bars(s, b) {
      const hs = [0.9, 1.4, 1.2, 2.0, 2.6, 3.4];
      const bw = (b.w - 1) / hs.length;
      const base = b.y + b.h - 0.5;
      hs.forEach((hh, i) => s.addShape("rect", { x: b.x + 0.5 + i * bw + 0.08, y: base - hh, w: bw - 0.16, h: hh, fill: { color: i === hs.length - 1 ? "E3C98F" : "FFFFFF", transparency: i === hs.length - 1 ? 10 : 70 }, line: { color: "FFFFFF", width: 0 } }));
      line(s, b.x + 0.3, base, b.w - 0.6, 0, "FFFFFF", 1.5, 30);
      s.addShape("line", { x: b.x + 0.6, y: base - 3.9, w: b.w - 1.3, h: 2.6, flipV: true, line: { color: "E3C98F", width: 3, endArrowType: "triangle" } });
      s.addText("£", { x: b.x + 0.3, y: b.y + 0.2, w: 1, h: 1, fontFace: "Trebuchet MS", fontSize: 54, bold: true, color: "FFFFFF", transparency: 60 });
    },
  };

  function motif(s, th, b) {
    (motifs[th.motif] || motifs.arabesque)(s, b, th);
  }

  // ── Block layouts ────────────────────────────────────────────────────────
  // All draw into `area` {x,y,w,h} below the slide header.
  const panel = (s, x, y, w, hh, fill, edge, width = 1) => s.addShape("roundRect", { x, y, w, h: hh, rectRadius: 0.1, fill: { color: fill }, line: { color: edge || fill, width } });
  const label = (s, text, x, y, w, color) => s.addText(String(text).toUpperCase(), { x, y, w, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color, charSpacing: 3 });

  /** Narrow side column of the slide's bullets. */
  function sideBullets(s, ctx, bullets, x, y, w, hh, title = "Key points") {
    if (!bullets.length) return;
    panel(s, x, y, w, hh, CREAM, LINE, 0.75);
    label(s, title, x + 0.25, y + 0.2, w - 0.5, ctx.theme.accent);
    const size = fitSize(bullets, w - 0.7, hh - 0.75, 20, 12, 8);
    s.addText(
      bullets.map((b) => ({ text: t(b), options: { bullet: { indent: 14 }, breakLine: true, paraSpaceAfter: 6 } })),
      { x: x + 0.2, y: y + 0.55, w: w - 0.4, h: hh - 0.7, fontFace: FONT, fontSize: size, color: INK, valign: "top" },
    );
  }

  /** Thin full-width strip with the bullets as a single line or two. */
  function strip(s, ctx, bullets, y, hh, title) {
    if (!bullets.length) return;
    const text = bullets.map(t).join("   ·   ");
    panel(s, 0.8, y, 11.8, hh, ctx.theme.soft);
    s.addText([{ text: `${title}  `, options: { bold: true, color: ctx.theme.accent } }, { text, options: { color: INK } }], { x: 1.0, y, w: 11.4, h: hh, fontFace: FONT, fontSize: fitSize(`${title} ${text}`, 11.4, hh, 18, 11), valign: "middle" });
  }

  const blocks = {
    // I do: problem, worked steps, answer; key points beside.
    model(s, ctx, m, bullets, area) {
      const th = ctx.theme;
      const leftW = bullets.length ? 8.05 : area.w;
      const probH = 1.0;
      panel(s, area.x, area.y, leftW, probH, th.dark);
      label(s, "Worked example · I do", area.x + 0.3, area.y + 0.1, 5, "E3C98F");
      s.addText(t(m.problem), { x: area.x + 0.3, y: area.y + 0.38, w: leftW - 0.6, h: 0.58, fontFace: th.head, fontSize: fitSize(m.problem, (leftW - 0.6) * 0.88, 0.58, 24, 12), bold: true, color: "FFFFFF", valign: "middle" });
      const steps = (m.steps || []).slice(0, 6);
      const ansH = m.answer ? 0.7 : 0;
      const stepsTop = area.y + probH + 0.18;
      const avail = area.h - probH - 0.18 - (ansH ? ansH + 0.15 : 0);
      const rowH = Math.min(0.78, avail / Math.max(1, steps.length));
      const size = Math.min(...steps.map((x) => fitSize(x, leftW - 1.0, rowH - 0.06, 22, 12)), 22);
      steps.forEach((st, i) => {
        const y = stepsTop + i * rowH;
        s.addShape("ellipse", { x: area.x + 0.1, y: y + rowH / 2 - 0.2, w: 0.4, h: 0.4, fill: { color: th.accent }, line: { color: th.accent, width: 0 } });
        s.addText(String(i + 1), { x: area.x + 0.1, y: y + rowH / 2 - 0.2, w: 0.4, h: 0.4, fontFace: FONT, fontSize: 13, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
        if (i < steps.length - 1) s.addShape("line", { x: area.x + 0.3, y: y + rowH / 2 + 0.2, w: 0, h: rowH - 0.4, line: { color: th.accent, width: 1.25, dashType: "dash", transparency: 40 } });
        s.addText(t(st), { x: area.x + 0.7, y, w: leftW - 0.8, h: rowH, fontFace: ctx.mathy ? "Cambria" : FONT, fontSize: size, color: INK, valign: "middle" });
      });
      if (m.answer) {
        const y = area.y + area.h - ansH;
        panel(s, area.x, y, leftW, ansH, GOLD_SOFT, GOLD, 1.5);
        s.addText([{ text: "ANSWER   ", options: { bold: true, color: GOLD_DARK, fontSize: 13, charSpacing: 2 } }, { text: t(m.answer), options: { bold: true, color: INK, fontFace: ctx.mathy ? "Cambria" : FONT } }], { x: area.x + 0.3, y, w: leftW - 0.6, h: ansH, fontFace: FONT, fontSize: fitSize(m.answer, leftW - 2, ansH, 22, 12), valign: "middle" });
      }
      if (bullets.length) sideBullets(s, ctx, bullets, area.x + leftW + 0.3, area.y, area.w - leftW - 0.3, area.h, "Watch for");
    },

    // Hinge question: four tiles, answer kept in the notes.
    check(s, ctx, c, bullets, area) {
      const th = ctx.theme;
      const qH = 1.1;
      panel(s, area.x, area.y, area.w, qH, th.soft);
      s.addShape("rect", { x: area.x, y: area.y + 0.15, w: 0.12, h: qH - 0.3, fill: { color: th.accent }, line: { color: th.accent, width: 0 } });
      s.addText(t(c.q), { x: area.x + 0.4, y: area.y, w: area.w - 0.6, h: qH, fontFace: th.head, fontSize: fitSize(c.q, (area.w - 0.6) * 0.86, qH - 0.1, 26, 13), bold: true, color: INK, valign: "middle" });
      const opts = (c.options || []).slice(0, 4);
      const gap = 0.25;
      const cols = 2;
      const rows = Math.ceil(opts.length / cols);
      const oh = (area.h - qH - 0.3 - 0.55 - gap * (rows - 1)) / rows;
      const ow = (area.w - gap) / cols;
      const size = Math.min(...opts.map((o) => fitSize(o, ow - 1.3, oh - 0.15, 24, 12)));
      opts.forEach((o, i) => {
        const x = area.x + (i % cols) * (ow + gap);
        const y = area.y + qH + 0.3 + Math.floor(i / cols) * (oh + gap);
        panel(s, x, y, ow, oh, "FFFFFF", LINE, 1);
        s.addShape("roundRect", { x: x + 0.2, y: y + oh / 2 - 0.35, w: 0.7, h: 0.7, rectRadius: 0.12, fill: { color: th.dark }, line: { color: th.dark, width: 0 } });
        s.addText("ABCD"[i], { x: x + 0.2, y: y + oh / 2 - 0.35, w: 0.7, h: 0.7, fontFace: FONT, fontSize: 24, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
        s.addText(t(o), { x: x + 1.1, y, w: ow - 1.25, h: oh, fontFace: ctx.mathy ? "Cambria" : FONT, fontSize: size, color: INK, valign: "middle" });
      });
      s.addText([{ text: "HINGE QUESTION  ", options: { bold: true, color: th.accent, charSpacing: 2 } }, { text: "Think in silence · write your letter · show me on 3", options: { color: MUTED } }], { x: area.x, y: area.y + area.h - 0.45, w: area.w, h: 0.45, fontFace: FONT, fontSize: 15, valign: "middle" });
      void bullets;
    },

    quote(s, ctx, q, bullets, area) {
      const th = ctx.theme;
      const leftW = bullets.length ? 7.3 : area.w;
      panel(s, area.x, area.y, leftW, area.h, th.dark);
      s.addText("“", { x: area.x + 0.15, y: area.y - 0.15, w: 1.3, h: 1.5, fontFace: "Georgia", fontSize: 110, color: "E3C98F" });
      const isAr = /[؀-ۿ]/.test(q.text || "");
      s.addText(t(q.text), { x: area.x + 0.6, y: area.y + 0.9, w: leftW - 1.1, h: area.h - 1.75, fontFace: isAr ? "Arial" : "Georgia", fontSize: fitSize(q.text, leftW - 1.1, area.h - 1.75, isAr ? 36 : 28, 13), italic: !isAr, color: "FFFFFF", valign: "middle", align: isAr ? "right" : "left", rtlMode: isAr });
      if (q.source) s.addText(`– ${t(q.source)}`, { x: area.x + 0.6, y: area.y + area.h - 0.75, w: leftW - 1.1, h: 0.5, fontFace: FONT, fontSize: fitSize(q.source, leftW - 1.6, 0.5, 16, 10), color: "E3C98F", valign: "middle" });
      if (bullets.length) sideBullets(s, ctx, bullets, area.x + leftW + 0.3, area.y, area.w - leftW - 0.3, area.h, "Annotate");
    },

    compare(s, ctx, c, bullets, area) {
      const th = ctx.theme;
      const stripH = bullets.length ? 0.85 : 0;
      const hh = area.h - (stripH ? stripH + 0.2 : 0);
      const gap = 0.9;
      const w = (area.w - gap) / 2;
      [c.left, c.right].forEach((side, i) => {
        if (!side) return;
        const x = area.x + i * (w + gap);
        const col = i ? th.dark : th.accent;
        panel(s, x, area.y, w, hh, "FFFFFF", col, 1.5);
        s.addShape("rect", { x, y: area.y, w, h: 0.75, fill: { color: col }, line: { color: col, width: 0 } });
        s.addText(t(side.title), { x: x + 0.25, y: area.y, w: w - 0.5, h: 0.75, fontFace: th.head, fontSize: fitSize(side.title, w - 0.5, 0.7, 22, 12), bold: true, color: "FFFFFF", valign: "middle" });
        const pts = (side.points || []).map(t);
        s.addText(
          pts.map((p) => ({ text: p, options: { bullet: { indent: 14 }, breakLine: true, paraSpaceAfter: 8 } })),
          { x: x + 0.2, y: area.y + 0.9, w: w - 0.4, h: hh - 1.05, fontFace: FONT, fontSize: fitSize(pts, w - 0.8, hh - 1.1, 22, 12, 8), color: INK, valign: "top" },
        );
      });
      const cx = area.x + w + gap / 2;
      s.addShape("ellipse", { x: cx - 0.36, y: area.y + hh / 2 - 0.36, w: 0.72, h: 0.72, fill: { color: GOLD }, line: { color: "FFFFFF", width: 2 } });
      s.addText(c.label || "vs", { x: cx - 0.36, y: area.y + hh / 2 - 0.36, w: 0.72, h: 0.72, fontFace: th.head, fontSize: 15, bold: true, italic: true, color: "FFFFFF", align: "center", valign: "middle" });
      if (stripH) strip(s, ctx, bullets, area.y + area.h - stripH, stripH, "So:");
    },

    timeline(s, ctx, items, bullets, area) {
      const th = ctx.theme;
      const list = items.slice(0, 6);
      const stripH = bullets.length ? 0.85 : 0;
      const n = list.length;
      const axisY = area.y + 1.25;
      s.addShape("line", { x: area.x, y: axisY, w: area.w, h: 0, line: { color: th.accent, width: 3, endArrowType: "triangle" } });
      const step = area.w / n;
      const textH = area.h - 1.6 - (stripH ? stripH + 0.2 : 0);
      const size = Math.min(...list.map((e) => fitSize(e.text, step - 0.25, textH, 18, 11)));
      list.forEach((e, i) => {
        const cx = area.x + step * i + step / 2;
        s.addText(t(e.label), { x: cx - step / 2 + 0.05, y: area.y, w: step - 0.1, h: 0.85, fontFace: th.head, fontSize: fitSize(e.label, step - 0.15, 0.8, 26, 12), bold: true, color: i % 2 ? th.dark : th.accent, align: "center", valign: "bottom" });
        s.addShape("ellipse", { x: cx - 0.17, y: axisY - 0.17, w: 0.34, h: 0.34, fill: { color: i % 2 ? GOLD : th.accent }, line: { color: "FFFFFF", width: 2 } });
        s.addShape("line", { x: cx, y: axisY + 0.2, w: 0, h: 0.2, line: { color: LINE, width: 1 } });
        panel(s, cx - step / 2 + 0.07, axisY + 0.4, step - 0.14, textH, i % 2 ? "FFFFFF" : CREAM, LINE, 0.75);
        s.addText(t(e.text), { x: cx - step / 2 + 0.15, y: axisY + 0.45, w: step - 0.3, h: textH - 0.1, fontFace: FONT, fontSize: size, color: INK, valign: "top" });
      });
      if (stripH) strip(s, ctx, bullets, area.y + area.h - stripH, stripH, "Pattern:");
    },

    table(s, ctx, tb, bullets, area) {
      const th = ctx.theme;
      const head = (tb.head || []).map(t);
      const rows = (tb.rows || []).slice(0, 8).map((r) => r.map(t));
      const stripH = bullets.length ? 0.85 : 0;
      const hh = area.h - (stripH ? stripH + 0.2 : 0);
      const nRows = rows.length + 1;
      const rowH = Math.min(0.75, hh / nRows);
      const cells = [...rows.flat(), ...head];
      const cols = Math.max(head.length, ...rows.map((r) => r.length));
      const size = fitSize(cells.reduce((a, b) => (b.length > a.length ? b : a), ""), area.w / cols - 0.25, rowH - 0.08, 20, 11);
      const data = [
        head.map((x) => ({ text: x, options: { bold: true, color: "FFFFFF", fill: { color: th.dark }, fontFace: th.head } })),
        ...rows.map((r, i) => r.map((x, j) => ({ text: x, options: { color: INK, bold: j === 0, fill: { color: i % 2 ? "FFFFFF" : th.soft } } }))),
      ];
      s.addTable(data, { x: area.x, y: area.y, w: area.w, rowH, fontFace: FONT, fontSize: size, border: { type: "solid", color: "FFFFFF", pt: 1.5 }, valign: "middle", margin: 0.08 });
      if (stripH) strip(s, ctx, bullets, area.y + area.h - stripH, stripH, "Notice:");
    },

    code(s, ctx, c, bullets, area) {
      const leftW = bullets.length ? 7.4 : area.w;
      panel(s, area.x, area.y, leftW, area.h, "1E2130", "1E2130");
      ["FF6058", "FFBD2E", "28C940"].forEach((col, i) => s.addShape("ellipse", { x: area.x + 0.25 + i * 0.28, y: area.y + 0.2, w: 0.17, h: 0.17, fill: { color: col }, line: { color: col, width: 0 } }));
      s.addText(c.lang || "python", { x: area.x + leftW - 2.2, y: area.y + 0.1, w: 2.0, h: 0.35, fontFace: "Consolas", fontSize: 12, color: "7F848E", align: "right" });
      const src = String(c.text || "").replace(/\t/g, "    ").split("\n");
      const outH = c.output ? 0.9 : 0;
      const codeH = area.h - 0.6 - (outH ? outH + 0.1 : 0);
      const size = Math.max(11, Math.min(20, Math.floor((codeH * 72) / (src.length * 1.25)), Math.floor(((leftW - 0.6) * 72) / (Math.max(...src.map((l) => l.length), 10) * 0.6))));
      s.addText(
        src.map((l, i) => ({ text: `${String(i + 1).padStart(2, " ")}  ${l}`, options: { breakLine: true, color: /^\s*#/.test(l) ? "7F848E" : "E6E9EF" } })),
        { x: area.x + 0.25, y: area.y + 0.5, w: leftW - 0.5, h: codeH, fontFace: "Consolas", fontSize: size, valign: "top", paraSpaceAfter: 0 },
      );
      if (c.output) {
        const y = area.y + area.h - outH - 0.1;
        s.addShape("rect", { x: area.x + 0.2, y, w: leftW - 0.4, h: outH, fill: { color: "000000" }, line: { color: "3A3F55", width: 1 } });
        s.addText([{ text: "> ", options: { color: "98C379" } }, { text: String(c.output), options: { color: "E5C07B" } }], { x: area.x + 0.35, y, w: leftW - 0.7, h: outH, fontFace: "Consolas", fontSize: fitSize(c.output, leftW - 0.8, outH, 16, 10), valign: "middle" });
      }
      if (bullets.length) sideBullets(s, ctx, bullets, area.x + leftW + 0.3, area.y, area.w - leftW - 0.3, area.h, "Trace it");
    },

    misconception(s, ctx, m, bullets, area) {
      const stripH = bullets.length ? 0.85 : 0;
      const hh = area.h - (stripH ? stripH + 0.2 : 0);
      const w = (area.w - 0.3) / 2;
      [["Not this", m.wrong, "C0392B", "FBEAE8", "✗"], ["But this", m.right, "2E8B57", "E6F4EC", "✓"]].forEach(([lab, text, col, fill, mark], i) => {
        const x = area.x + i * (w + 0.3);
        panel(s, x, area.y, w, hh, fill, col, 2);
        s.addShape("ellipse", { x: x + 0.3, y: area.y + 0.3, w: 0.8, h: 0.8, fill: { color: col }, line: { color: col, width: 0 } });
        s.addText(mark, { x: x + 0.3, y: area.y + 0.3, w: 0.8, h: 0.8, fontFace: "Arial", fontSize: 30, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
        s.addText(lab.toUpperCase(), { x: x + 1.3, y: area.y + 0.3, w: w - 1.5, h: 0.8, fontFace: FONT, fontSize: 18, bold: true, color: col, charSpacing: 3, valign: "middle" });
        s.addText(t(text), { x: x + 0.35, y: area.y + 1.3, w: w - 0.7, h: hh - 1.5, fontFace: ctx.mathy ? "Cambria" : FONT, fontSize: fitSize(text, w - 0.7, hh - 1.5, 26, 13), color: INK, valign: "middle", strike: i === 0 && t(text).length < 40 ? "sngStrike" : undefined });
      });
      if (stripH) strip(s, ctx, bullets, area.y + area.h - stripH, stripH, "Why:");
    },

    cycle(s, ctx, items, bullets, area) {
      const th = ctx.theme;
      const list = items.slice(0, 6).map(t);
      const boxW = bullets.length ? 7.6 : area.w;
      const cx = area.x + boxW / 2;
      const cy = area.y + area.h / 2;
      const rx = boxW / 2 - 1.25;
      const ry = area.h / 2 - 0.55;
      const n = list.length;
      const nodeW = Math.min(2.4, (2 * Math.PI * rx) / n - 0.2);
      const nodeH = 0.95;
      const size = Math.min(...list.map((x) => fitSize(x, nodeW - 0.2, nodeH - 0.1, 17, 10)));
      s.addShape("ellipse", { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2, fill: { color: "FFFFFF", transparency: 100 }, line: { color: th.accent, width: 2, dashType: "dash", transparency: 30 } });
      list.forEach((x, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const px = cx + rx * Math.cos(a);
        const py = cy + ry * Math.sin(a);
        panel(s, px - nodeW / 2, py - nodeH / 2, nodeW, nodeH, i % 2 ? th.dark : th.accent);
        s.addText(x, { x: px - nodeW / 2 + 0.08, y: py - nodeH / 2, w: nodeW - 0.16, h: nodeH, fontFace: FONT, fontSize: size, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
        // arrowhead between this node and the next, on the ring
        const a2 = a + Math.PI / n;
        s.addShape("triangle", { x: cx + rx * Math.cos(a2) - 0.13, y: cy + ry * Math.sin(a2) - 0.13, w: 0.26, h: 0.26, rotate: (a2 * 180) / Math.PI + 180, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
      });
      if (bullets.length) sideBullets(s, ctx, bullets, area.x + boxW + 0.3, area.y, area.w - boxW - 0.3, area.h, "Explain");
    },
  };

  /** Draw the slide's block if it has one. Returns the block kind or null. */
  function renderBlock(s, ctx, tch, bullets, area) {
    for (const kind of BLOCK_KINDS) {
      if (tch[kind] == null) continue;
      blocks[kind](s, ctx, tch[kind], bullets, area);
      return kind;
    }
    return null;
  }

  /** Teacher-note extras for a block (e.g. the hinge answer). */
  function blockNotes(tch) {
    if (tch.check) {
      const c = tch.check;
      const i = Number(c.answer);
      return `\n\nHINGE ANSWER: ${"ABCD"[i] || "?"}${c.options && c.options[i] ? ` (${t(c.options[i])})` : ""}. ${c.why ? t(c.why) : ""} Everyone shows their letter on 3. If fewer than about 80% are right, reteach before moving on.`;
    }
    if (tch.model) return "\n\nI do: narrate every step aloud as you write it. Then cover the steps and ask pupils to tell you each one back.";
    return "";
  }

  return { motif, renderBlock, blockNotes };
}
