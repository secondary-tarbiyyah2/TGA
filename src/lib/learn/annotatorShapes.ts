// Vector model for the homework annotator. Every coordinate is normalised to the
// page (x by page width, y by page height) and every size is a fraction of the
// page WIDTH, so a drawing is independent of zoom and screen size and can be
// replayed at any resolution when the marked copy is produced.

export type Pt = [number, number];
export type PenShape = { t: "pen" | "hl"; c: string; w: number; p: Pt[] };
export type TextShape = { t: "text"; c: string; s: number; x: number; y: number; text: string };
export type StampShape = { t: "tick" | "cross"; c: string; s: number; x: number; y: number };
export type Shape = PenShape | TextShape | StampShape;
export type Pages = Record<string, Shape[]>;
export type MarkupData = { v: 1; pages: Pages };

export const PALETTE: { name: string; value: string }[] = [
  { name: "Red", value: "#d62828" },
  { name: "Blue", value: "#1d4ed8" },
  { name: "Green", value: "#15803d" },
  { name: "Black", value: "#111827" },
  { name: "Orange", value: "#ea580c" },
  { name: "Purple", value: "#7e22ce" },
  { name: "Pink", value: "#ec4899" },
  { name: "Yellow", value: "#facc15" },
];

export type SizeKey = "s" | "m" | "l";
export const PEN_WIDTH: Record<SizeKey, number> = { s: 0.0022, m: 0.0045, l: 0.009 };
export const HL_WIDTH: Record<SizeKey, number> = { s: 0.016, m: 0.026, l: 0.04 };
export const TEXT_SIZE: Record<SizeKey, number> = { s: 0.016, m: 0.024, l: 0.036 };
export const STAMP_SIZE: Record<SizeKey, number> = { s: 0.03, m: 0.045, l: 0.07 };

const HL_ALPHA = 0.38;
const MAX_SHAPES_PER_PAGE = 5000;
const MAX_POINTS_PER_STROKE = 20000;

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Reads saved strokes defensively; anything malformed is dropped rather than trusted. */
export function parseMarkup(raw: unknown): Pages {
  const out: Pages = {};
  if (!raw || typeof raw !== "object") return out;
  const pages = (raw as { pages?: unknown }).pages;
  if (!pages || typeof pages !== "object") return out;
  for (const [key, list] of Object.entries(pages as Record<string, unknown>)) {
    if (!/^\d{1,4}$/.test(key) || !Array.isArray(list)) continue;
    const shapes: Shape[] = [];
    for (const item of list.slice(0, MAX_SHAPES_PER_PAGE)) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      if (typeof o.c !== "string" || !/^#[0-9a-fA-F]{6}$/.test(o.c)) continue;
      if ((o.t === "pen" || o.t === "hl") && finite(o.w) && Array.isArray(o.p)) {
        const pts: Pt[] = [];
        for (const q of o.p.slice(0, MAX_POINTS_PER_STROKE)) {
          if (Array.isArray(q) && finite(q[0]) && finite(q[1])) pts.push([q[0], q[1]]);
        }
        if (pts.length > 0) shapes.push({ t: o.t, c: o.c, w: o.w, p: pts });
      } else if (o.t === "text" && finite(o.s) && finite(o.x) && finite(o.y) && typeof o.text === "string") {
        shapes.push({ t: "text", c: o.c, s: o.s, x: o.x, y: o.y, text: o.text.slice(0, 2000) });
      } else if ((o.t === "tick" || o.t === "cross") && finite(o.s) && finite(o.x) && finite(o.y)) {
        shapes.push({ t: o.t, c: o.c, s: o.s, x: o.x, y: o.y });
      }
    }
    if (shapes.length > 0) out[key] = shapes;
  }
  return out;
}

export function hasAnyShapes(pages: Pages): boolean {
  return Object.values(pages).some((list) => list.length > 0);
}

function isPen(shape: Shape): shape is PenShape {
  return shape.t === "pen" || shape.t === "hl";
}

function isRtl(text: string): boolean {
  return /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(text);
}

function textFont(s: number, width: number): string {
  return `${Math.max(6, Math.round(s * width))}px system-ui, "Segoe UI", Arial, sans-serif`;
}

function drawStroke(ctx: CanvasRenderingContext2D, shape: PenShape, W: number, H: number) {
  const pts = shape.p;
  ctx.save();
  ctx.strokeStyle = shape.c;
  ctx.fillStyle = shape.c;
  ctx.lineWidth = Math.max(1, shape.w * W);
  ctx.lineJoin = "round";
  ctx.lineCap = shape.t === "hl" ? "square" : "round";
  if (shape.t === "hl") ctx.globalAlpha = HL_ALPHA;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0] * W, pts[0][1] * H, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * W, pts[0][1] * H);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = ((pts[i][0] + pts[i + 1][0]) / 2) * W;
      const my = ((pts[i][1] + pts[i + 1][1]) / 2) * H;
      ctx.quadraticCurveTo(pts[i][0] * W, pts[i][1] * H, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0] * W, last[1] * H);
    ctx.stroke();
  }
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, shape: TextShape, W: number, H: number) {
  ctx.save();
  ctx.fillStyle = shape.c;
  ctx.font = textFont(shape.s, W);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.direction = isRtl(shape.text) ? "rtl" : "ltr";
  const lineH = Math.round(shape.s * W * 1.25);
  shape.text.split("\n").forEach((line, i) => ctx.fillText(line, shape.x * W, shape.y * H + i * lineH));
  ctx.restore();
}

function drawStamp(ctx: CanvasRenderingContext2D, shape: StampShape, W: number, H: number) {
  const S = shape.s * W;
  const cx = shape.x * W;
  const cy = shape.y * H;
  ctx.save();
  ctx.strokeStyle = shape.c;
  ctx.lineWidth = Math.max(1.5, S * 0.16);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (shape.t === "tick") {
    ctx.moveTo(cx - 0.45 * S, cy + 0.05 * S);
    ctx.lineTo(cx - 0.15 * S, cy + 0.4 * S);
    ctx.lineTo(cx + 0.5 * S, cy - 0.45 * S);
  } else {
    ctx.moveTo(cx - 0.4 * S, cy - 0.4 * S);
    ctx.lineTo(cx + 0.4 * S, cy + 0.4 * S);
    ctx.moveTo(cx + 0.4 * S, cy - 0.4 * S);
    ctx.lineTo(cx - 0.4 * S, cy + 0.4 * S);
  }
  ctx.stroke();
  ctx.restore();
}

/** Draws shapes onto a W x H canvas context. */
export function drawShapes(ctx: CanvasRenderingContext2D, shapes: Shape[], W: number, H: number) {
  for (const shape of shapes) {
    if (isPen(shape)) drawStroke(ctx, shape, W, H);
    else if (shape.t === "text") drawText(ctx, shape, W, H);
    else drawStamp(ctx, shape, W, H);
  }
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Is the point (normalised x, y) on this shape, within radiusPx on a W x H canvas? */
export function hitShape(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, W: number, H: number, radiusPx: number): boolean {
  const px = x * W;
  const py = y * H;
  if (isPen(shape)) {
    const reach = radiusPx + (shape.w * W) / 2;
    const pts = shape.p;
    if (pts.length === 1) return Math.hypot(px - pts[0][0] * W, py - pts[0][1] * H) <= reach;
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(px, py, pts[i][0] * W, pts[i][1] * H, pts[i + 1][0] * W, pts[i + 1][1] * H) <= reach) return true;
    }
    return false;
  }
  if (shape.t === "text") {
    ctx.save();
    ctx.font = textFont(shape.s, W);
    const lines = shape.text.split("\n");
    const lineH = Math.round(shape.s * W * 1.25);
    let width = 0;
    for (const line of lines) width = Math.max(width, ctx.measureText(line).width);
    ctx.restore();
    const left = shape.x * W - radiusPx / 2;
    const top = shape.y * H - radiusPx / 2;
    return px >= left && px <= left + width + radiusPx && py >= top && py <= top + lines.length * lineH + radiusPx;
  }
  const half = (shape.s * W) / 2 + radiusPx / 2;
  return Math.abs(px - shape.x * W) <= half && Math.abs(py - shape.y * H) <= half;
}
