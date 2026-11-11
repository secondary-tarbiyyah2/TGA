
/**
 * The section kicker used on every public page: a gold hairline and a short
 * uppercase label. One component, so every section
 * opens the same way. `tone="light"` is for dark (ink or teal) bands.
 */
export function Kicker({ children, tone = "gold" }: { children: React.ReactNode; tone?: "gold" | "light" }) {
  const light = tone === "light";
  return (
    <div className={`mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] ${light ? "text-gold-300" : "text-gold-700"}`}>
      <span className={`h-px w-6 ${light ? "bg-gold-300" : "bg-gold"}`} aria-hidden="true" />
      <span className="font-mono tracking-[0.16em]">{children}</span>
    </div>
  );
}

export function PlaceholderNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 inline-flex items-center gap-2 rounded-md bg-cream px-3 py-1.5 text-xs font-medium text-gold-900">
      <span aria-hidden="true">✎</span> {children}
    </p>
  );
}
