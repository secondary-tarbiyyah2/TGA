export function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">
      <span className="h-px w-8 bg-gold" aria-hidden="true" />
      {children}
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
