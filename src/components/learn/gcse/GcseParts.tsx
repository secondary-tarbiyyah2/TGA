"use client";

import { useCallback, useState } from "react";
import {
  DEFAULT_BOUNDARIES,
  GCSE_GRADES,
  GCSE_STATUS_META,
  boundariesValid,
  gcseStatus,
  gradeChipClass,
  gradeFromPercent,
  marksToNextGrade,
  type Boundaries,
  type GcseRow,
  type TrendPoint,
} from "@/lib/learn/gcse";

/** Status pill: Ahead / On track / Behind / Awaiting, with the gap in brackets. */
export function GcseStatusChip({ row }: { row: Pick<GcseRow, "target_grade" | "predicted_grade" | "actual_grade"> }) {
  const { status, gap } = gcseStatus(row);
  const meta = GCSE_STATUS_META[status];
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${meta.className}`}>
      {meta.label}
      {gap !== null && gap !== 0 ? ` (${gap > 0 ? "+" : ""}${gap})` : ""}
    </span>
  );
}

/** A 1-9 grade in a small rounded chip. `kind` is read out for screen readers. */
export function GradeChip({ grade, kind, muted }: { grade: number | null | undefined; kind?: string; muted?: boolean }) {
  return (
    <span className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums ${muted ? "bg-cream text-ink/65" : gradeChipClass(grade)}`}>
      {kind && <span className="sr-only">{kind} </span>}
      {grade ?? "–"}
    </span>
  );
}

/**
 * Tiny inline-SVG trend of the actual grade over time, with the target
 * (dashed) and predicted (dotted) grades drawn as reference lines.
 */
export function TrendLine({ points, target, predicted, width = 120, height = 36 }: { points: TrendPoint[]; target?: number | null; predicted?: number | null; width?: number; height?: number }) {
  const pad = 4;
  const y = (g: number) => pad + ((9 - g) / 8) * (height - pad * 2);
  const x = (i: number) => (points.length <= 1 ? width / 2 : pad + (i / (points.length - 1)) * (width - pad * 2));
  const label = points.length === 0 ? "No grades recorded yet" : `Grades over time: ${points.map((p) => p.grade).join(", then ")}`;
  return (
    <svg role="img" aria-label={label} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      {typeof target === "number" && <line x1={pad} x2={width - pad} y1={y(target)} y2={y(target)} stroke="currentColor" strokeWidth={1} strokeDasharray="4 3" className="text-teal-600/60" />}
      {typeof predicted === "number" && <line x1={pad} x2={width - pad} y1={y(predicted)} y2={y(predicted)} stroke="currentColor" strokeWidth={1} strokeDasharray="1 3" className="text-gold-700/70" />}
      {points.length > 1 && <polyline fill="none" stroke="currentColor" strokeWidth={1.5} className="text-ink/70" points={points.map((p, i) => `${x(i)},${y(p.grade)}`).join(" ")} />}
      {points.map((p, i) => (
        <circle key={`${p.at}-${i}`} cx={x(i)} cy={y(p.grade)} r={p.kind === "mock" ? 3.5 : 2.5} className={p.kind === "mock" ? "fill-gold-700" : "fill-ink/80"}>
          <title>{`${p.kind === "mock" ? p.label || "Mock" : "Grade"}: ${p.grade}`}</title>
        </circle>
      ))}
    </svg>
  );
}

// ── grade boundaries (indicative) ────────────────────────────────────────────

const BOUNDARY_KEY = "tga.gcse.boundaries";

function readBoundaries(): Boundaries {
  try {
    const raw = window.localStorage.getItem(BOUNDARY_KEY);
    if (!raw) return DEFAULT_BOUNDARIES;
    const parsed = JSON.parse(raw) as Boundaries;
    return boundariesValid(parsed) ? parsed : DEFAULT_BOUNDARIES;
  } catch {
    return DEFAULT_BOUNDARIES;
  }
}

/** Boundaries kept in this browser only (they differ per paper and series, so they are a teacher's working values). */
export function useBoundaries(): [Boundaries, (b: Boundaries) => void, () => void] {
  const [b, setB] = useState<Boundaries>(() => (typeof window === "undefined" ? DEFAULT_BOUNDARIES : readBoundaries()));
  const set = useCallback((next: Boundaries) => {
    setB(next);
    try {
      window.localStorage.setItem(BOUNDARY_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: keep in memory */
    }
  }, []);
  const reset = useCallback(() => {
    setB(DEFAULT_BOUNDARIES);
    try {
      window.localStorage.removeItem(BOUNDARY_KEY);
    } catch {
      /* ignore */
    }
  }, []);
  return [b, set, reset];
}

export function BoundaryEditor({ boundaries, onChange, onReset }: { boundaries: Boundaries; onChange: (b: Boundaries) => void; onReset: () => void }) {
  const ok = boundariesValid(boundaries);
  return (
    <div className="rounded-lg border border-gold-light/50 bg-cream/50 p-3">
      <p className="text-xs text-ink/70">Minimum percentage of the paper for each grade. These are indicative school values, not the exam board&apos;s: change them to match the paper you marked.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {GCSE_GRADES.map((g) => (
          <label key={g} className="text-[11px] font-medium text-ink/70">
            Grade {g}
            <input
              type="text" inputMode="decimal"
              min={0}
              max={100}
              step={1}
              value={boundaries[g]}
              onChange={(e) => onChange({ ...boundaries, [g]: Number(e.target.value) })}
              className="mt-0.5 block w-16 rounded-md border border-gold-light/60 bg-white px-2 py-1 text-xs"
            />
          </label>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3">
        {!ok && <span role="alert" className="text-xs text-red-700">Each grade needs a higher percentage than the one below it.</span>}
        <button type="button" onClick={onReset} className="text-xs font-medium text-ink/70 underline">
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

/** Mark and paper total in, grade and "marks to the next grade" out. */
export function BoundaryCalculator() {
  const [boundaries, setBoundaries, reset] = useBoundaries();
  const [mark, setMark] = useState("");
  const [outOf, setOutOf] = useState("100");
  const [editing, setEditing] = useState(false);
  const m = mark === "" ? NaN : Number(mark);
  const o = Number(outOf);
  const valid = Number.isFinite(m) && o > 0 && m >= 0 && m <= o && boundariesValid(boundaries);
  const pct = valid ? (m / o) * 100 : null;
  const grade = pct !== null ? gradeFromPercent(pct, boundaries) : null;
  const next = valid ? marksToNextGrade(m, o, boundaries) : null;
  return (
    <details className="rounded-lg border border-gold-light/50 bg-white p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">Grade boundaries helper</summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-end gap-3 text-xs text-ink/70">
          <label>
            Mark
            <input type="text" inputMode="decimal" min={0} value={mark} onChange={(e) => setMark(e.target.value)} className="mt-1 block w-20 rounded-md border border-gold-light/60 px-2 py-1.5 text-sm" />
          </label>
          <label>
            Out of
            <input type="text" inputMode="decimal" min={1} value={outOf} onChange={(e) => setOutOf(e.target.value)} className="mt-1 block w-20 rounded-md border border-gold-light/60 px-2 py-1.5 text-sm" />
          </label>
          <p role="status" className="pb-1.5 text-sm text-ink">
            {pct === null ? "Enter a mark to see the grade." : grade === null ? `${pct.toFixed(1)}%: below grade 1.` : `${pct.toFixed(1)}% is grade ${grade}.`}
            {next && <span className="ml-1 text-xs text-ink/60">{next.marks} more {next.marks === 1 ? "mark" : "marks"} for grade {next.grade}.</span>}
          </p>
        </div>
        <button type="button" onClick={() => setEditing((v) => !v)} aria-expanded={editing} className="text-xs font-medium text-ink/70 underline">
          {editing ? "Hide boundaries" : "Edit boundaries"}
        </button>
        {editing && <BoundaryEditor boundaries={boundaries} onChange={setBoundaries} onReset={reset} />}
      </div>
    </details>
  );
}

export function gradeOptions() {
  return GCSE_GRADES.map((g) => (
    <option key={g} value={String(g)}>
      {g}
    </option>
  ));
}
