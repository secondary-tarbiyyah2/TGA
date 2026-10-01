"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

type Pt = { x: number; y: number; p: number };

export type SignaturePadState = { hasInk: boolean; valid: boolean };
export type SignaturePadHandle = {
  clear: () => void;
  undo: () => void;
  /** Trimmed, transparent PNG of the drawn signature (null when empty). */
  toBlob: () => Promise<Blob | null>;
  getState: () => SignaturePadState;
};

/** Total drawn length (CSS px) below which a scribble is not accepted as a signature. */
export const MIN_SIGNATURE_LENGTH = 60;
const INK = "#10183a";
const BASE_WIDTH = 3.2; // CSS px: thick enough to read on a phone, thin enough to look like pen
const EXPORT_SCALE = 3; // output resolution multiplier over CSS px
const EXPORT_MAX_W = 1200;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const strokeLength = (s: Pt[]) => s.reduce((t, p, i) => (i ? t + dist(s[i - 1], p) : 0), 0);
const widthFor = (p: number) => BASE_WIDTH * (0.75 + 0.5 * Math.min(1, Math.max(0, p)));

/** Draws one stroke with midpoint quadratic smoothing. */
function drawStroke(ctx: CanvasRenderingContext2D, s: Pt[], scale: number, ox = 0, oy = 0) {
  if (!s.length) return;
  const X = (p: Pt) => (p.x - ox) * scale;
  const Y = (p: Pt) => (p.y - oy) * scale;
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.length < 3) {
    // a dot or a tiny flick
    ctx.beginPath();
    ctx.arc(X(s[0]), Y(s[0]), (widthFor(s[0].p) * scale) / 2, 0, Math.PI * 2);
    ctx.fill();
    if (s.length === 2) {
      ctx.lineWidth = widthFor(s[1].p) * scale;
      ctx.beginPath();
      ctx.moveTo(X(s[0]), Y(s[0]));
      ctx.lineTo(X(s[1]), Y(s[1]));
      ctx.stroke();
    }
    return;
  }
  // Segment by segment so pressure can vary the width along the stroke.
  let prevMid = { x: X(s[0]), y: Y(s[0]) };
  for (let i = 1; i < s.length - 1; i++) {
    const mid = { x: (X(s[i]) + X(s[i + 1])) / 2, y: (Y(s[i]) + Y(s[i + 1])) / 2 };
    ctx.lineWidth = widthFor(s[i].p) * scale;
    ctx.beginPath();
    ctx.moveTo(prevMid.x, prevMid.y);
    ctx.quadraticCurveTo(X(s[i]), Y(s[i]), mid.x, mid.y);
    ctx.stroke();
    prevMid = mid;
  }
  const last = s[s.length - 1];
  ctx.lineWidth = widthFor(last.p) * scale;
  ctx.beginPath();
  ctx.moveTo(prevMid.x, prevMid.y);
  ctx.lineTo(X(last), Y(last));
  ctx.stroke();
}

/**
 * A reusable handwritten-signature pad. Pointer events cover mouse, touch and
 * stylus; `touch-action: none` stops the page scrolling while a finger draws.
 * Strokes are kept as vector points, so Undo, resize and retina redraws are
 * lossless, and the export is a trimmed transparent PNG.
 */
export const SignaturePad = forwardRef<
  SignaturePadHandle,
  { height?: number; disabled?: boolean; onChange?: (s: SignaturePadState) => void; label?: string }
>(function SignaturePad({ height = 180, disabled, onChange, label = "Draw your signature here" }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const strokes = useRef<Pt[][]>([]);
  const current = useRef<Pt[] | null>(null);
  const widthRef = useRef(0);
  const [state, setState] = useState<SignaturePadState>({ hasInk: false, valid: false });

  const compute = useCallback((): SignaturePadState => {
    const all = strokes.current;
    const total = all.reduce((t, s) => t + strokeLength(s), 0);
    return { hasInk: all.length > 0, valid: total >= MIN_SIGNATURE_LENGTH };
  }, []);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const s of strokes.current) drawStroke(ctx, s, 1);
    if (current.current) drawStroke(ctx, current.current, 1);
  }, []);

  const publish = useCallback(() => {
    const next = compute();
    setState(next);
    onChange?.(next);
  }, [compute, onChange]);

  // Retina-correct sizing, redone whenever the container width changes.
  useEffect(() => {
    const wrap = wrapRef.current;
    const c = canvasRef.current;
    if (!wrap || !c) return;
    const size = () => {
      if (!wrap.clientWidth) return; // hidden (e.g. on another tab): keep the strokes as they are
      const w = Math.max(200, Math.floor(wrap.clientWidth));
      const dpr = window.devicePixelRatio || 1;
      if (widthRef.current && widthRef.current !== w) {
        const k = w / widthRef.current;
        for (const s of strokes.current) for (const p of s) p.x *= k;
      }
      widthRef.current = w;
      c.width = Math.round(w * dpr);
      c.height = Math.round(height * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${height}px`;
      redraw();
    };
    size();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(size) : null;
    ro?.observe(wrap);
    window.addEventListener("resize", size);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", size);
    };
  }, [height, redraw]);

  const point = (e: { clientX: number; clientY: number; pressure?: number; pointerType?: string }): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    const pressure = e.pointerType === "pen" && e.pressure ? e.pressure : 0.5;
    return { x: e.clientX - r.left, y: e.clientY - r.top, p: pressure };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best effort */
    }
    current.current = [point(e.nativeEvent)];
    redraw();
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = current.current;
    if (!s) return;
    e.preventDefault();
    const native = e.nativeEvent;
    const events = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [native]) {
      const p = point(ev);
      const last = s[s.length - 1];
      if (!last || dist(last, p) >= 0.8) s.push(p);
    }
    redraw();
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = current.current;
    if (!s) return;
    e.preventDefault();
    current.current = null;
    strokes.current.push(s);
    redraw();
    publish();
  };

  const clear = useCallback(() => {
    strokes.current = [];
    current.current = null;
    redraw();
    publish();
  }, [redraw, publish]);
  const undo = useCallback(() => {
    strokes.current.pop();
    redraw();
    publish();
  }, [redraw, publish]);

  const toBlob = useCallback(async (): Promise<Blob | null> => {
    const all = strokes.current;
    if (!all.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of all) for (const p of s) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const pad = BASE_WIDTH * 2;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const w = maxX - minX;
    const h = maxY - minY;
    const scale = Math.min(EXPORT_SCALE, EXPORT_MAX_W / w);
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(w * scale));
    out.height = Math.max(1, Math.round(h * scale));
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    for (const s of all) drawStroke(ctx, s, scale, minX, minY);
    return await new Promise<Blob | null>((res) => out.toBlob((b) => res(b), "image/png"));
  }, []);

  useImperativeHandle(ref, () => ({ clear, undo, toBlob, getState: compute }), [clear, undo, toBlob, compute]);

  return (
    <div>
      <div ref={wrapRef} className={`relative w-full overflow-hidden rounded-xl border-2 border-dashed ${disabled ? "border-gold-light/60 bg-cream/40" : "border-gold-light bg-white"}`}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onContextMenu={(e) => e.preventDefault()}
          style={{ touchAction: "none", display: "block", cursor: disabled ? "not-allowed" : "crosshair", userSelect: "none", WebkitUserSelect: "none" }}
        />
        {!state.hasInk && <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-ink/35">{label}</span>}
        <span className="pointer-events-none absolute bottom-9 left-4 right-4 border-b border-ink/15" aria-hidden="true" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-ink/55" aria-live="polite">
          {state.hasInk && !state.valid ? "Please sign a little more fully." : "Use your finger, stylus or mouse."}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={undo} disabled={disabled || !state.hasInk} className="rounded-lg border border-gold-light bg-white px-3 py-1 text-xs font-medium text-ink/75 hover:bg-cream disabled:opacity-40">
            Undo
          </button>
          <button type="button" onClick={clear} disabled={disabled || !state.hasInk} className="rounded-lg border border-gold-light bg-white px-3 py-1 text-xs font-medium text-ink/75 hover:bg-cream disabled:opacity-40">
            Clear
          </button>
        </div>
      </div>
    </div>
  );
});
