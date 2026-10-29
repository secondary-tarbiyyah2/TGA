import { SCHOOL_WEEK_NOTE, type KeyStage } from "@/content/curriculum";

/** Live lessons a week by subject for one key stage, from the Curriculum Policy. */
export function WeeklyLessons({ ks }: { ks: KeyStage }) {
  return (
    <div className="mt-6">
      <table className="w-full overflow-hidden rounded-2xl border border-gold-light/50 bg-white text-sm">
        <caption className="sr-only">Live lessons a week for {ks.range}</caption>
        <thead>
          <tr className="border-b border-gold-light/50 text-left text-xs uppercase tracking-wide text-ink/65">
            <th scope="col" className="px-4 py-2.5 font-semibold">Subject</th>
            <th scope="col" className="px-4 py-2.5 text-right font-semibold">Lessons a week</th>
          </tr>
        </thead>
        <tbody>
          {ks.weekly.map((w) => (
            <tr key={w.subject} className="border-b border-gold-light/40 last:border-0">
              <th scope="row" className="px-4 py-2.5 text-left font-medium text-ink">
                {w.subject}
              </th>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink/80">{w.lessons}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-cream/60">
            <th scope="row" className="px-4 py-2.5 text-left font-semibold text-ink">
              Total
            </th>
            <td className="px-4 py-2.5 text-right font-semibold text-ink">
              {ks.totalLessons.replace(/ a week.*$/, "").replace(/^(\d+) live lessons$/, "$1")}
              <span className="block text-xs font-normal text-ink/65">{ks.lessonLength} each</span>
            </td>
          </tr>
        </tfoot>
      </table>
      {ks.note && <p className="mt-3 text-sm text-ink/75">{ks.note}</p>}
      <p className="mt-2 text-xs text-ink/70">{SCHOOL_WEEK_NOTE} Each year group&apos;s exact timetable is published before enrolment.</p>
    </div>
  );
}
