export function StatTile({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: "neutral" | "good" | "bad" }) {
  const subTone = tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-700" : "text-ink/55";
  return (
    <div className="rounded-xl border border-gold-light/50 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink/65">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${subTone}`}>{sub}</p>}
    </div>
  );
}
