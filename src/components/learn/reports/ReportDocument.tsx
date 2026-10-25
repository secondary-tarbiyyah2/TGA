import { PrintSheet } from "@/components/learn/print";
import { StatusChip, type Tone } from "@/components/learn/ui";
import { PRINT_AREA } from "./printArea";
import type { ClassSummary, ReportNarrative, SubjectRating } from "./summary";

export { PRINT_AREA };

/** A4 print rules: prints only the .report-print-area element, flowing across pages. */
export function PrintStyles() {
  return <PrintSheet />;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Awaiting approval",
  approved: "Approved",
  released: "Issued",
};
const STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  pending_approval: "warn",
  approved: "info",
  released: "good",
};

export function StatusBadge({ status }: { status: string }) {
  return <StatusChip tone={STATUS_TONE[status] || "neutral"}>{STATUS_LABEL[status] || status}</StatusChip>;
}

export function fmtPct(v: number | null): string {
  return v === null ? "–" : `${Math.round(v * 10) / 10}%`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gold-light/40 bg-cream/40 p-3">
      <p className="text-xs uppercase tracking-wide text-ink/65">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-ink">{value}</p>
      {sub && <p className="text-xs text-ink/65">{sub}</p>}
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

// Average teacher score out of 10 when sessions were rated, else the entry count.
function quranValue(q: ClassSummary["quran"]): string {
  if (q.average_score !== null && q.average_score !== undefined) return `${q.average_score}/10`;
  return q.entries === 0 ? "–" : String(q.entries);
}

function quranSub(q: ClassSummary["quran"]): string {
  if (q.entries === 0) return "No entries";
  const parts: string[] = [];
  if (q.scored_sessions) parts.push(`${q.scored_sessions} rated session${q.scored_sessions === 1 ? "" : "s"}`);
  if (q.trend) parts.push(q.trend);
  if (q.latest) parts.push(`latest: ${q.latest}`);
  return parts.length > 0 ? parts.join(" · ") : q.latest || "No entries";
}

function ClassBlock({ c, rating }: { c: ClassSummary; rating?: SubjectRating }) {
  const a = c.attendance;
  const h = c.homework;
  const s = c.assessments;
  return (
    <section className="break-inside-avoid rounded-xl border border-gold-light/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-lg font-semibold text-ink">{c.class_name}</h3>
        {rating?.by && <p className="text-xs text-ink/65">{rating.by}</p>}
      </div>
      {(rating?.effort || rating?.attainment) && (
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {rating.attainment && (
            <div className="flex gap-1.5">
              <dt className="text-ink/65">Attainment:</dt>
              <dd className="font-medium text-ink">{rating.attainment}</dd>
            </div>
          )}
          {rating.effort && (
            <div className="flex gap-1.5">
              <dt className="text-ink/65">Effort:</dt>
              <dd className="font-medium text-ink">{rating.effort}</dd>
            </div>
          )}
        </dl>
      )}
      {rating?.comment && <p className="mt-2 whitespace-pre-wrap text-sm text-ink/80">{rating.comment}</p>}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Attendance" value={fmtPct(a.rate)} sub={a.total === 0 ? "No lessons recorded" : `${a.attended} attended · ${a.absent} missed${a.excused ? ` · ${a.excused} excused` : ""}`} />
        <Stat label="Homework" value={h.total === 0 ? "–" : `${h.done}/${h.total}`} sub={h.rate === null ? "None set" : `${h.rate}% completed`} />
        <Stat label="Average grade" value={fmtPct(s.average_percent)} sub={s.count === 0 ? "No assessments" : `${s.count} assessment${s.count === 1 ? "" : "s"}`} />
        <Stat label="Qur'an progress" value={quranValue(c.quran)} sub={quranSub(c.quran)} />
      </div>
      {c.behaviour && (
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Merits" value={String(c.behaviour.merits)} sub="Good choices recognised" />
          <Stat label="Demerits" value={String(c.behaviour.demerits)} />
          <Stat label="Net points" value={c.behaviour.net_points > 0 ? `+${c.behaviour.net_points}` : String(c.behaviour.net_points)} sub="This period" />
        </div>
      )}
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
    <article className={`overflow-hidden rounded-2xl border border-gold-light/60 bg-white ${printing ? PRINT_AREA : ""}`}>
      {/* Letterhead: the Academy's mark, then who and when. */}
      <header className="border-b-4 border-gold-500 bg-cream/60 px-5 pb-4 pt-5 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- plain img so it also prints */}
          <img src="/brand/ga-wordmark.png" alt="Tarbiyyah Global Academy" width={180} height={56} className="h-11 w-auto" />
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-700">Progress report</p>
            <p className="text-sm text-ink/70">{termLabel}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-serif text-2xl font-semibold text-ink">{childName}</h2>
            <p className="text-sm text-ink/65">
              {issuedAt ? `Issued ${new Date(issuedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : live ? "Live preview, built from what is recorded now" : "Not issued yet"}
            </p>
          </div>
          {status && <StatusBadge status={status} />}
        </div>
      </header>
      <div className="p-4 sm:p-6">
      <div className="mt-4 space-y-3">
        {classes.length === 0 && legacy.length === 0 && <p className="text-sm text-ink/65">No recorded attendance, homework or grades for this period.</p>}
        {classes.map((c) => (
          <ClassBlock key={c.class_id} c={c} rating={narrative?.ratings?.[c.class_id]} />
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
      <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-gold-light/50 pt-3 text-[11px] text-ink/65">
        <span>Tarbiyyah Global Academy · part of the Tarbiyyah Education Trust</span>
        <span>globalacademy@tarbiyyah.co.uk</span>
      </footer>
      </div>
    </article>
  );
}
