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
  const statusStyle = status && status !== "neutral" ? STATUS_STYLES[status] : null;
  const content = (
    <div className="group h-full rounded-2xl border border-gold-light bg-white p-5 transition hover:border-teal-500/60 hover:shadow-sm">
      <p className="text-sm font-medium text-ink/60">{label}</p>
      <p className="mt-1.5 text-3xl font-semibold tabular-nums tracking-tight text-ink">{value}</p>
      <div className="mt-3 flex items-center justify-between">
        {statusStyle ? (
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${status === "warning" ? "text-red-700" : "text-green-700"}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
            {statusStyle.label}
          </span>
        ) : (
          <span />
        )}
        {href && (
          <span aria-hidden="true" className="text-xs font-medium text-teal-700 opacity-0 transition group-hover:opacity-100">
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
