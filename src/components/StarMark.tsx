/**
 * The brand's 8-point geometric star (two overlapping squares, one turned
 * 45°) — see DESIGN.md: "Our identity = gold, ink, cream, 8-point
 * geometric star". Decorative only; colour comes from `currentColor`.
 */
export function StarMark({ className = "h-6 w-6", filled = false }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <g fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 1.25} strokeLinejoin="round">
        <rect x="5" y="5" width="14" height="14" />
        <rect x="5" y="5" width="14" height="14" transform="rotate(45 12 12)" />
      </g>
      {!filled && <circle cx="12" cy="12" r="2.25" fill="currentColor" />}
    </svg>
  );
}
