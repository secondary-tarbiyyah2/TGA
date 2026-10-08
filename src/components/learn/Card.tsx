// Shared card shell for /learn admin pages — every page previously repeated
// the same `rounded-2xl border border-gold-light/50 bg-white p-6` div by
// hand with no visual distinction between "nothing to see here" and
// "something needs attention" (reported from a live screenshot as "options
// congested... too simplistic"). Centralising it here means every section
// gets a consistent status dot (ok/warning/neutral) for free, and a future
// design tweak only needs to change one file.
type CardStatus = "ok" | "warning" | "neutral";

const STATUS_STYLES: Record<CardStatus, { dot: string; label: string }> = {
  ok: { dot: "bg-green-600", label: "All clear" },
  warning: { dot: "bg-red-600", label: "Needs attention" },
  neutral: { dot: "bg-ink/30", label: "" },
};

export function Card({
  title,
  description,
  status,
  statusLabel,
  children,
}: {
  title: string;
  description?: string;
  status?: CardStatus;
  statusLabel?: string;
  children: React.ReactNode;
}) {
  const statusStyle = status ? STATUS_STYLES[status] : null;
  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-serif text-h3 font-semibold text-ink">{title}</h2>
        {statusStyle && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-cream px-2.5 py-1 text-xs font-medium text-ink/70">
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
            {statusLabel || statusStyle.label}
          </span>
        )}
      </div>
      {description && <p className="mt-1 text-xs text-ink/50">{description}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** A small at-a-glance stat tile. Every count comes from a query the
 * portal already runs elsewhere (absence alerts, outstanding signatures,
 * etc.), never an invented number. */
export function StatTile({ label, value, status, href }: { label: string; value: number | string; status?: CardStatus; href?: string }) {
  // Soft pastel tiles: pink needs attention, green all clear, otherwise a
  // rotating blue / yellow / teal so a row of tiles reads as a dashboard.
  const rotate = [
    { bg: "bg-[#EAF4FE]", fg: "text-[#1E7FD0]", dot: "bg-[#1E9FF2]" },
    { bg: "bg-[#FFF7D6]", fg: "text-[#9A7400]", dot: "bg-[#FFC107]" },
    { bg: "bg-[#E4F4F2]", fg: "text-[#1F6F6B]", dot: "bg-[#2A8C84]" },
  ];
  const hash = Array.from(label).reduce((n, ch) => n + ch.charCodeAt(0), 0);
  const tone =
    status === "warning"
      ? { bg: "bg-[#FFEEF2]", fg: "text-[#D62F5C]", dot: "bg-[#F4426F]" }
      : status === "ok"
        ? { bg: "bg-[#E6F7EE]", fg: "text-[#1B8F55]", dot: "bg-[#2EB872]" }
        : rotate[hash % rotate.length];
  const statusStyle = status && status !== "neutral" ? STATUS_STYLES[status] : null;
  const content = (
    <div className={`group relative h-full overflow-hidden rounded-2xl p-5 shadow-[0_2px_14px_rgba(40,80,140,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(40,80,140,0.12)] ${tone.bg}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink/70">{label}</p>
        <span aria-hidden="true" className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
      </div>
      <p className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${tone.fg}`}>{value}</p>
      <div className="mt-3 flex items-center justify-between">
        {statusStyle ? <span className={`text-xs font-medium ${tone.fg}`}>{statusStyle.label}</span> : <span />}
        {href && (
          <span aria-hidden="true" className={`text-xs font-medium opacity-0 transition group-hover:opacity-100 ${tone.fg}`}>
            View &rarr;
          </span>
        )}
      </div>
    </div>
  );
  if (!href) return content;
  return (
    <a href={href} className="block h-full">
      {content}
    </a>
  );
}
