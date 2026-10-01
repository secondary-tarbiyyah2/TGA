import type { ClassSummary, ReportNarrative } from "./summary";

export const PRINT_AREA = "report-print-area";

/** Hides everything except the .report-print-area element when printing. */
export function PrintStyles() {
  return (
    <style>{`@media print {
  body * { visibility: hidden !important; }
  .${PRINT_AREA}, .${PRINT_AREA} * { visibility: visible !important; }
  .${PRINT_AREA} { position: absolute; left: 0; top: 0; width: 100%; border: none !important; box-shadow: none !important; }
}`}</style>
  );
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Awaiting approval",
  approved: "Approved",
  released: "Issued",
};
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-cream text-ink/70",
  pending_approval: "bg-amber-100 text-amber-800",
  approved: "bg-sky-100 text-sky-800",
  released: "bg-emerald-100 text-emerald-800",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] || "bg-cream text-ink/70"}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function fmtPct(v: number | null): string {
  return v === null ? "–" : `${Math.round(v * 10) / 10}%`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gold-light/40 bg-cream/40 p-3">
      <p className="text-xs uppercase tracking-wide text-ink/50">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-ink">{value}</p>
      {sub && <p className="text-xs text-ink/60">{sub}</p>}
    </div>
  );
}

/** Compact attendance / homework / grade figures across all classes in a narrative. */
export function overallOf(classes: ClassSummary[]): { rate: number | null; attended: number; absent: number; hwDone: number; hwTotal: number; avg: number | null } {
  let attended = 0;
  let absent = 0;
  let hwDone = 0;
  let hwTotal = 0;
  let sum = 0;
  let n = 0;
  for (const c of classes) {
    attended += c.attendance.attended;
    absent += c.attendance.absent;
    hwDone += c.homework.done;
    hwTotal += c.homework.total;
    if (c.assessments.average_percent !== null) {
      sum += c.assessments.average_percent;
      n += 1;
    }
  }
  return {
    rate: attended + absent > 0 ? Math.round((attended / (attended + absent)) * 100) : null,
    attended,
    absent,
    hwDone,
    hwTotal,
    avg: n > 0 ? Math.round((sum / n) * 10) / 10 : null,
  };
}

function ClassBlock({ c }: { c: ClassSummary }) {
  const a = c.attendance;
  const h = c.homework;
  const s = c.assessments;
  return (
    <section className="break-inside-avoid rounded-xl border border-gold-light/40 p-4">
      <h3 className="font-serif text-lg font-semibold text-ink">{c.class_name}</h3>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Attendance" value={fmtPct(a.rate)} sub={a.total === 0 ? "No lessons recorded" : `${a.attended} attended · ${a.absent} missed${a.excused ? ` · ${a.excused} excused` : ""}`} />
        <Stat label="Homework" value={h.total === 0 ? "–" : `${h.done}/${h.total}`} sub={h.rate === null ? "None set" : `${h.rate}% completed`} />
        <Stat label="Average grade" value={fmtPct(s.average_percent)} sub={s.count === 0 ? "No assessments" : `${s.count} assessment${s.count === 1 ? "" : "s"}`} />
        <Stat label="Qur'an progress" value={c.quran.entries === 0 ? "–" : String(c.quran.entries)} sub={c.quran.latest || "No entries"} />
      </div>
      {s.items.length > 0 && (
        <ul className="mt-3 divide-y divide-gold-light/30 text-sm">
          {s.items.map((it, i) => (
            <li key={`${it.title}-${i}`} className="flex justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate text-ink/80">{it.title}</span>
              <span className="shrink-0 text-ink/70">
                {it.percent === null ? "–" : `${Math.round(it.percent)}%`}
                {it.grade ? ` · ${it.grade}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The clean, printable report. Used for previews (staff) and released reports (family). */
export function ReportDocument({
  childName,
  termLabel,
  issuedAt,
  status,
  narrative,
  comment,
  subjectComments,
  printing,
  live,
}: {
  childName: string;
  termLabel: string;
  issuedAt?: string | null;
  status?: string;
  narrative: ReportNarrative | null;
  comment: string | null;
  subjectComments?: Record<string, string>;
  /** Adds the print-area class so window.print() prints only this report. */
  printing?: boolean;
  /** Preview built live from recorded data (not a stored snapshot). */
  live?: boolean;
}) {
  const classes = narrative ? Object.values(narrative.classes) : [];
  const legacy = Object.entries(subjectComments || {});
  return (
    <article className={`rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6 ${printing ? PRINT_AREA : ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-gold-light/40 pb-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-ink/50">Progress Report</p>
          <h2 className="font-serif text-xl font-semibold text-ink">{childName}</h2>
          <p className="text-sm text-ink/60">
            {termLabel}
            {issuedAt ? ` · Issued ${new Date(issuedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
            {live ? " · Live preview" : ""}
          </p>
        </div>
        {status && <StatusBadge status={status} />}
      </header>
      <div className="mt-4 space-y-3">
        {classes.length === 0 && legacy.length === 0 && <p className="text-sm text-ink/60">No recorded attendance, homework or grades for this period.</p>}
        {classes.map((c) => (
          <ClassBlock key={c.class_id} c={c} />
        ))}
        <section className="break-inside-avoid rounded-xl border border-gold-light/40 p-4">
          <h3 className="font-serif text-lg font-semibold text-ink">Teacher&apos;s comment</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink/80">{comment || "No comment added yet."}</p>
          {legacy.length > 0 && (
            <ul className="mt-3 space-y-2">
              {legacy.map(([subject, text]) => (
                <li key={subject} className="text-sm">
                  <span className="font-medium">{subject}:</span> {text}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </article>
  );
}
