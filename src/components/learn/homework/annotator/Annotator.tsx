"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { loadPdfJs, type PdfDocument, type PdfRenderTask } from "@/lib/learn/pdfLibs";
import { flattenImage, flattenPdf, imageToPdf } from "@/lib/learn/annotatorExport";
import {
  HL_WIDTH,
  PALETTE,
  PEN_WIDTH,
  STAMP_SIZE,
  TEXT_SIZE,
  drawShapes,
  hasAnyShapes,
  hitShape,
  parseMarkup,
  type Pages,
  type PenShape,
  type Pt,
  type Shape,
  type SizeKey,
} from "@/lib/learn/annotatorShapes";
import { categoryOfMime, downloadFileBlob, safeObjectName, uploadWithProgress } from "@/lib/learn/homeworkFiles";
import { Select } from "@/components/learn/Select";

import { askConfirm } from "@/components/learn/kit";
export type AnnotatorFile = { path: string; name: string; mime: string };

/** Lets the annotator show the mark box and "Return to student" owned by the marking form behind it. */
export type MarkingBridge = {
  mark: string;
  onMarkChange: (value: string) => void;
  maxPoints: number | null;
  /** Returns an error message, or null when the work was returned. */
  onReturn: () => Promise<string | null>;
};

type Tool = "move" | "pen" | "hl" | "eraser" | "text" | "tick" | "cross";

type HistoryEntry = { pages: Pages; key: string };
type HState = { pages: Pages; past: HistoryEntry[]; future: HistoryEntry[]; rev: number; focus: string | null };
type HAction =
  | { type: "load"; pages: Pages }
  | { type: "commit"; key: string; shapes: Shape[] }
  | { type: "undo" }
  | { type: "redo" };

const MAX_HISTORY = 100;

function reducer(state: HState, action: HAction): HState {
  switch (action.type) {
    case "load":
      return { pages: action.pages, past: [], future: [], rev: 0, focus: null };
    case "commit": {
      const pages: Pages = { ...state.pages, [action.key]: action.shapes };
      return { pages, past: [...state.past, { pages: state.pages, key: action.key }].slice(-MAX_HISTORY), future: [], rev: state.rev + 1, focus: null };
    }
    case "undo": {
      const entry = state.past[state.past.length - 1];
      if (!entry) return state;
      return {
        pages: entry.pages,
        past: state.past.slice(0, -1),
        future: [{ pages: state.pages, key: entry.key }, ...state.future],
        rev: state.rev + 1,
        focus: entry.key,
      };
    }
    case "redo": {
      const entry = state.future[0];
      if (!entry) return state;
      return {
        pages: entry.pages,
        past: [...state.past, { pages: state.pages, key: entry.key }],
        future: state.future.slice(1),
        rev: state.rev + 1,
        focus: entry.key,
      };
    }
  }
}

type Gesture = { tool: "pen" | "hl"; live: PenShape } | { tool: "eraser"; working: Shape[]; erased: boolean };

const TOOLS: { id: Tool; label: string }[] = [
  { id: "move", label: "Move" },
  { id: "pen", label: "Pen" },
  { id: "hl", label: "Highlighter" },
  { id: "eraser", label: "Eraser" },
  { id: "text", label: "Text" },
  { id: "tick", label: "Tick" },
  { id: "cross", label: "Cross" },
];

const SIZES: { id: SizeKey; label: string }[] = [
  { id: "s", label: "Thin" },
  { id: "m", label: "Medium" },
  { id: "l", label: "Thick" },
];

const btn = "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40";
const btnOff = "border-gold-light bg-white text-ink/80 hover:bg-cream";
const btnOn = "border-gold-700 bg-gold-700 text-white";

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

function isCancelled(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: string }).name === "RenderingCancelledException";
}

/**
 * Full-screen marking tool for a submitted PDF or image. Pen, highlighter, eraser,
 * text, tick and cross, with undo/redo, zoom and page navigation. Save writes a NEW
 * flattened copy to the private homework-marked bucket and keeps the vector strokes
 * so the work can be reopened and continued. The student's original is never changed.
 */
export function Annotator({
  file,
  submissionId,
  homeworkId,
  childId,
  heading,
  marking,
  onClose,
  onSaved,
}: {
  file: AnnotatorFile;
  submissionId: string;
  homeworkId: string;
  childId: string;
  heading: string;
  marking?: MarkingBridge;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = getSupabaseClient();
  const kind = categoryOfMime(file.mime) === "pdf" ? "pdf" : "image";

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(1);
  const [pageNo, setPageNo] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [viewW, setViewW] = useState(0);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const [tool, setTool] = useState<Tool>("pen");
  const [colour, setColour] = useState(PALETTE[0].value);
  const [size, setSize] = useState<SizeKey>("m");
  const [state, dispatch] = useReducer(reducer, { pages: {}, past: [], future: [], rev: 0, focus: null });
  const [savedRev, setSavedRev] = useState(0);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [exportAs, setExportAs] = useState<"png" | "pdf">("png");
  const [textEdit, setTextEdit] = useState<{ x: number; y: number; value: string } | null>(null);

  const viewRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<PdfDocument | null>(null);
  const bytesRef = useRef<Uint8Array | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const pagesRef = useRef<Pages>({});
  const prevMarkedRef = useRef<string | null>(null);

  const pageKey = String(pageNo);
  const dirty = state.rev !== savedRev;

  // Keep a ref copy of the strokes for pointer handlers (assigned in an effect, not during render).
  useEffect(() => {
    pagesRef.current = state.pages;
  }, [state.pages]);

  // ── load the file and any earlier strokes ───────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let imageUrl: string | null = null;
    (async () => {
      try {
        const blob = await downloadFileBlob("homework-submissions", file.path, file.mime);
        if (!blob) throw new Error("The submitted file couldn't be downloaded.");
        if (kind === "pdf") {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const lib = await loadPdfJs();
          // pdf.js takes ownership of the buffer it is given, so it gets a copy.
          const doc = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true }).promise.catch((e: unknown) => {
            const name = (e as { name?: string } | null)?.name;
            throw new Error(name === "PasswordException" ? "This PDF is password-protected, so it can't be marked here." : "This PDF couldn't be read. It may be damaged.");
          });
          if (cancelled) {
            await doc.destroy();
            return;
          }
          bytesRef.current = bytes;
          pdfRef.current = doc;
          setNumPages(doc.numPages);
        } else {
          imageUrl = URL.createObjectURL(blob);
          const img = new Image();
          img.src = imageUrl;
          try {
            await img.decode();
          } catch {
            throw new Error("This browser can't open that image format for marking (for example HEIC on some browsers). Try Safari, or ask for a JPEG or PDF.");
          }
          if (cancelled) return;
          imageRef.current = img;
          setNumPages(1);
        }
        if (supabase) {
          const { data } = await supabase.from("homework_markup").select("strokes, marked_path").eq("submission_id", submissionId).eq("source_path", file.path).maybeSingle();
          const row = data as { strokes: unknown; marked_path: string | null } | null;
          if (row) {
            dispatch({ type: "load", pages: parseMarkup(row.strokes) });
            prevMarkedRef.current = row.marked_path;
          }
        }
        if (!cancelled) setPhase("ready");
      } catch (e) {
        if (!cancelled) {
          setLoadError(describeError(e));
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      const doc = pdfRef.current;
      pdfRef.current = null;
      if (doc) doc.destroy().catch(() => undefined);
    };
  }, [supabase, file.path, file.mime, kind, submissionId]);

  // ── measure the viewing area ────────────────────────────────────────────
  useEffect(() => {
    const el = viewRef.current;
    if (!el || phase !== "ready") return;
    const measure = () => setViewW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);

  // ── overlay drawing ─────────────────────────────────────────────────────
  const redraw = useCallback(() => {
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const g = gestureRef.current;
    const shapes = g && g.tool === "eraser" ? g.working : pagesRef.current[pageKey] || [];
    drawShapes(ctx, shapes, canvas.width, canvas.height);
    if (g && g.tool !== "eraser") drawShapes(ctx, [g.live], canvas.width, canvas.height);
  }, [pageKey]);

  // ── render the page (PDF) or image onto the base canvas ─────────────────
  useEffect(() => {
    if (phase !== "ready" || viewW === 0) return;
    let cancelled = false;
    let task: PdfRenderTask | null = null;
    (async () => {
      const base = baseRef.current;
      const overlay = overlayRef.current;
      if (!base || !overlay) return;
      const cssW = Math.max(200, (viewW - 24) * zoom);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pxW = Math.min(Math.round(cssW * dpr), 4096);
      let pxH: number;
      let natural: { w: number; h: number };
      const ctx = base.getContext("2d");
      if (!ctx) return;
      if (kind === "pdf" && pdfRef.current) {
        const page = await pdfRef.current.getPage(pageNo);
        if (cancelled) return;
        const one = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: pxW / one.width });
        pxH = Math.round(vp.height);
        base.width = pxW;
        base.height = pxH;
        natural = { w: one.width, h: one.height };
        task = page.render({ canvasContext: ctx, viewport: vp });
        await task.promise;
      } else if (imageRef.current) {
        const img = imageRef.current;
        pxH = Math.round((pxW * img.naturalHeight) / img.naturalWidth);
        base.width = pxW;
        base.height = pxH;
        natural = { w: img.naturalWidth, h: img.naturalHeight };
        ctx.drawImage(img, 0, 0, pxW, pxH);
      } else {
        return;
      }
      if (cancelled) return;
      overlay.width = pxW;
      overlay.height = pxH;
      setDims(natural);
      setRenderError(null);
      redraw();
    })().catch((e: unknown) => {
      if (!cancelled && !isCancelled(e)) setRenderError("This page couldn't be drawn.");
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [phase, viewW, zoom, pageNo, kind, redraw]);

  // Redraw whenever the strokes change.
  useEffect(() => {
    redraw();
  }, [state.pages, redraw]);

  // Undo/redo jumps to the page that changed.
  useEffect(() => {
    if (state.focus && state.focus !== pageKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- follow the page an undo/redo touched
      setPageNo(Number(state.focus));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.rev]);

  // ── tool defaults ───────────────────────────────────────────────────────
  const pickTool = (t: Tool) => {
    setTool(t);
    setTextEdit(null);
    if (t === "hl") setColour("#facc15");
    else if (t === "tick") setColour("#15803d");
    else if (t === "cross") setColour("#d62828");
    else if ((tool === "hl" || tool === "tick" || tool === "cross") && (t === "pen" || t === "text")) setColour("#d62828");
  };

  const commit = useCallback((shapes: Shape[]) => dispatch({ type: "commit", key: pageKey, shapes }), [pageKey]);

  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ── pointer handling ────────────────────────────────────────────────────
  const toNorm = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };

  const eraseAt = (g: Extract<Gesture, { tool: "eraser" }>, p: Pt) => {
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const radius = 12 * (canvas.width / Math.max(1, canvas.getBoundingClientRect().width));
    const kept = g.working.filter((s) => !hitShape(ctx, s, p[0], p[1], canvas.width, canvas.height, radius));
    if (kept.length !== g.working.length) {
      g.working = kept;
      g.erased = true;
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!e.isPrimary || tool === "move" || (e.pointerType === "mouse" && e.button !== 0)) return;
    const p = toNorm(e);
    if (tool === "pen" || tool === "hl") {
      e.currentTarget.setPointerCapture(e.pointerId);
      gestureRef.current = { tool, live: { t: tool, c: colour, w: tool === "hl" ? HL_WIDTH[size] : PEN_WIDTH[size], p: [p] } };
      redraw();
    } else if (tool === "eraser") {
      e.currentTarget.setPointerCapture(e.pointerId);
      const g: Extract<Gesture, { tool: "eraser" }> = { tool: "eraser", working: [...(pagesRef.current[pageKey] || [])], erased: false };
      gestureRef.current = g;
      eraseAt(g, p);
      redraw();
    } else if (tool === "text") {
      e.preventDefault();
      setTextEdit({ x: p[0], y: p[1], value: "" });
    } else {
      commit([...(pagesRef.current[pageKey] || []), { t: tool, c: colour, s: STAMP_SIZE[size], x: p[0], y: p[1] }]);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    const p = toNorm(e);
    if (g.tool === "eraser") eraseAt(g, p);
    else {
      const last = g.live.p[g.live.p.length - 1];
      if (Math.abs(last[0] - p[0]) + Math.abs(last[1] - p[1]) < 0.0008) return;
      g.live.p.push(p);
    }
    redraw();
  };

  const endGesture = () => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;
    if (g.tool === "eraser") {
      if (g.erased) commit(g.working);
      else redraw();
    } else {
      commit([...(pagesRef.current[pageKey] || []), g.live]);
    }
  };

  const commitText = () => {
    const edit = textEdit;
    setTextEdit(null);
    if (!edit || edit.value.trim() === "") return;
    commit([...(pagesRef.current[pageKey] || []), { t: "text", c: colour, s: TEXT_SIZE[size], x: edit.x, y: edit.y, text: edit.value.trimEnd() }]);
  };

  // ── save ────────────────────────────────────────────────────────────────
  const save = async (): Promise<boolean> => {
    if (!supabase || saving) return false;
    setSaving(true);
    setProgress(0);
    setMessage(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You are signed out. Please sign in again.");
      const pages = state.pages;
      let marked: { path: string; name: string; mime: string } | null = null;

      if (hasAnyShapes(pages)) {
        let blob: Blob;
        let ext: string;
        let mime: string;
        if (kind === "pdf") {
          if (!bytesRef.current) throw new Error("The PDF isn't loaded.");
          blob = new Blob([new Uint8Array(await flattenPdf(bytesRef.current, pages))], { type: "application/pdf" });
          ext = "pdf";
          mime = "application/pdf";
        } else {
          if (!imageRef.current) throw new Error("The image isn't loaded.");
          const png = await flattenImage(imageRef.current, pages["1"] || []);
          if (exportAs === "pdf") {
            blob = new Blob([new Uint8Array(await imageToPdf(png))], { type: "application/pdf" });
            ext = "pdf";
            mime = "application/pdf";
          } else {
            blob = png;
            ext = "png";
            mime = "image/png";
          }
        }
        const stem = file.name.replace(/\.[^.]*$/, "");
        const name = `${stem} (marked).${ext}`;
        const path = `${homeworkId}/${childId}/${Date.now()}-marked-${safeObjectName(`${stem}.${ext}`)}`;
        const up = await uploadWithProgress("homework-marked", path, blob, mime, name, setProgress);
        if (!up.ok) throw new Error(up.error);
        marked = { path, name, mime };
      }

      const { error } = await supabase.from("homework_markup").upsert(
        {
          submission_id: submissionId,
          source_path: file.path,
          strokes: { v: 1, pages },
          marked_path: marked?.path ?? null,
          marked_name: marked?.name ?? null,
          marked_mime: marked?.mime ?? null,
          marked_by: user.id,
        },
        { onConflict: "submission_id,source_path" }
      );
      if (error) {
        if (marked) await supabase.storage.from("homework-marked").remove([marked.path]);
        throw new Error(error.message);
      }

      // Drop the previous marked copy unless a returned feedback row still points at it.
      const prev = prevMarkedRef.current;
      prevMarkedRef.current = marked?.path ?? null;
      if (prev && prev !== marked?.path) {
        const { data: fb } = await supabase.from("homework_feedback").select("marked_files").eq("submission_id", submissionId).maybeSingle();
        const listed = JSON.stringify((fb as { marked_files?: unknown } | null)?.marked_files ?? []);
        if (!listed.includes(prev)) await supabase.storage.from("homework-marked").remove([prev]);
      }

      setSavedRev(state.rev);
      setMessage({ kind: "ok", text: marked ? "Saved. A marked copy has been created; the original is untouched." : "Saved (no marks on the page, so no marked copy)." });
      onSaved();
      return true;
    } catch (e) {
      setMessage({ kind: "error", text: describeError(e) });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAndReturn = async () => {
    if (!marking) return;
    if (!(await save())) return;
    const err = await marking.onReturn();
    if (err) setMessage({ kind: "error", text: `Saved, but the work wasn't returned: ${err}` });
    else onClose();
  };

  const requestClose = async () => {
    if (dirty && !(await askConfirm("You have unsaved marks. Close without saving?"))) return;
    onClose();
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const cssW = viewW > 0 ? Math.max(200, (viewW - 24) * zoom) : 0;
  const cssH = dims ? (cssW * dims.h) / dims.w : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label={`Marking ${file.name}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-light/40 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{heading}</p>
          <p className="truncate text-xs text-ink/65">{file.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {kind === "image" && (
            <label className="flex items-center gap-1 text-xs text-ink/70">
              Save as
              <Select value={exportAs} onChange={(e) => setExportAs(e.target.value === "pdf" ? "pdf" : "png")} className="rounded-md border border-gold-light/60 bg-white px-1.5 py-1 text-xs">
                <option value="png">PNG</option>
                <option value="pdf">PDF</option>
              </Select>
            </label>
          )}
          {marking && (
            <label className="flex items-center gap-1 text-xs text-ink/70">
              Mark
              <input
                type="text"
                value={marking.mark}
                onChange={(e) => marking.onMarkChange(e.target.value)}
                placeholder={marking.maxPoints != null ? `/ ${marking.maxPoints}` : "e.g. 7/10 or B+"}
                className="w-24 rounded-md border border-gold-light/60 bg-white px-2 py-1 text-xs"
              />
            </label>
          )}
          <button type="button" disabled={saving || phase !== "ready"} onClick={save} className={`${btn} ${btnOff}`}>
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
          {marking && (
            <button type="button" disabled={saving || phase !== "ready"} onClick={saveAndReturn} className={`${btn} ${btnOn}`}>
              Save &amp; return to student
            </button>
          )}
          <button type="button" onClick={requestClose} className={`${btn} ${btnOff}`}>
            Close
          </button>
        </div>
      </div>

      {phase === "ready" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gold-light/40 bg-cream px-3 py-2">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Tools">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" aria-pressed={tool === t.id} onClick={() => pickTool(t.id)} className={`${btn} ${tool === t.id ? btnOn : btnOff}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Colour">
            {PALETTE.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-label={c.name}
                aria-pressed={colour === c.value}
                onClick={() => setColour(c.value)}
                className={`h-6 w-6 rounded-full border-2 ${colour === c.value ? "border-ink" : "border-white shadow"}`}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
          <div className="flex gap-1" role="group" aria-label="Thickness">
            {SIZES.map((s) => (
              <button key={s.id} type="button" aria-pressed={size === s.id} onClick={() => setSize(s.id)} className={`${btn} ${size === s.id ? btnOn : btnOff}`}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button type="button" disabled={state.past.length === 0} onClick={undo} className={`${btn} ${btnOff}`}>
              Undo
            </button>
            <button type="button" disabled={state.future.length === 0} onClick={redo} className={`${btn} ${btnOff}`}>
              Redo
            </button>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Zoom">
            <button type="button" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} className={`${btn} ${btnOff}`}>
              −
            </button>
            <button type="button" onClick={() => setZoom(1)} className={`${btn} ${btnOff}`} aria-label="Fit to width">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} className={`${btn} ${btnOff}`}>
              +
            </button>
          </div>
          {numPages > 1 && (
            <div className="flex items-center gap-1" role="group" aria-label="Pages">
              <button type="button" aria-label="Previous page" disabled={pageNo <= 1} onClick={() => setPageNo((n) => Math.max(1, n - 1))} className={`${btn} ${btnOff}`}>
                ‹
              </button>
              <span className="px-1 text-xs text-ink/70">
                Page {pageNo} of {numPages}
              </span>
              <button type="button" aria-label="Next page" disabled={pageNo >= numPages} onClick={() => setPageNo((n) => Math.min(numPages, n + 1))} className={`${btn} ${btnOff}`}>
                ›
              </button>
            </div>
          )}
        </div>
      )}

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`px-3 py-1.5 text-xs ${message.kind === "error" ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>
          {message.text}
        </p>
      )}
      {saving && progress > 0 && progress < 1 && (
        <div className="h-1 bg-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Uploading marked copy">
          <div className="h-full bg-teal-600 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}

      <div ref={viewRef} className="min-h-0 flex-1 overflow-auto bg-ink/10 p-3">
        {phase === "loading" && <p role="status" className="text-center text-sm text-ink/70">Loading the file and marking tools…</p>}
        {phase === "error" && (
          <div role="alert" className="mx-auto max-w-md rounded-lg bg-white p-4 text-center text-sm text-red-700">
            <p>{loadError}</p>
            <button type="button" onClick={onClose} className={`${btn} ${btnOff} mt-3`}>
              Close
            </button>
          </div>
        )}
        {phase === "ready" && (
          <div className="relative mx-auto bg-white shadow" style={{ width: cssW || undefined, height: cssH || undefined, minHeight: cssH ? undefined : 200 }}>
            <canvas ref={baseRef} className="absolute inset-0 h-full w-full" />
            <canvas
              ref={overlayRef}
              className={`absolute inset-0 h-full w-full ${tool === "move" ? "pointer-events-none" : "cursor-crosshair"}`}
              style={{ touchAction: tool === "move" ? "auto" : "none" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endGesture}
              onPointerCancel={endGesture}
              aria-label="Page being marked"
            />
            {textEdit && cssW > 0 && (
              <textarea
                autoFocus
                value={textEdit.value}
                onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
                onBlur={commitText}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setTextEdit(null);
                  else if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    commitText();
                  }
                }}
                rows={2}
                placeholder="Type, then Enter"
                aria-label="Text to place on the page"
                className="absolute z-10 min-w-[8rem] resize-none border border-dashed border-ink/40 bg-white/70 p-0 leading-tight outline-none"
                style={{ left: `${textEdit.x * 100}%`, top: `${textEdit.y * 100}%`, color: colour, fontSize: Math.max(6, TEXT_SIZE[size] * cssW) }}
              />
            )}
            {renderError && (
              <p role="alert" className="absolute inset-x-0 top-2 mx-auto w-max rounded bg-red-50 px-3 py-1 text-xs text-red-800">
                {renderError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
