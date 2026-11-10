import Link from "next/link";
import { MARK_BANDS } from "@/lib/learn/quranClassroom";
import { ui } from "@/components/learn/ui";

/** The few things every member of staff needs to know, in one place. Written to match how the portal behaves today. */
const HANDBOOK_PDF = "https://globalacademy.tarbiyyah.co.uk/staff/TGA-Staff-Handbook-2026-27.pdf";

export function StaffHandbook() {
  return (
    <div className="space-y-4">
      <section className={`${ui.card} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h2 className="text-base font-semibold text-ink">Staff Handbook 2026–27 (PDF)</h2>
          <p className="text-sm text-ink/70">The full handbook: the school day, how we teach, safeguarding, behaviour, marking, attendance, recording and data, online conduct, the portal, who to contact, and a first-week checklist.</p>
        </div>
        <div className="flex gap-2">
          <a href={HANDBOOK_PDF} target="_blank" rel="noreferrer" className={ui.btnPrimary}>Download PDF</a>
          <a href="https://globalacademy.tarbiyyah.co.uk/policies/" target="_blank" rel="noreferrer" className={ui.btnSecondary}>All policies</a>
        </div>
      </section>
      <p className="text-sm text-ink/65">Below: the portal how-tos, kept short. The PDF is the full version and the policies are the authority.</p>
      <Section title="Start of day: clocking in">
        <ul>
          <li>Clock in when the portal asks. Your time counts while you are using the portal.</li>
          <li>If you step away with no mouse, keyboard or touch for 30 minutes, the time stops counting and your shift ends at your last activity.</li>
          <li>If you come back within 15 minutes, your shift carries on with no gap. After that, clock in again.</li>
          <li>Closing the portal ends your shift within about 10 minutes, at the last moment you were using it. Use Clock out when you finish.</li>
          <li>If a shift is wrong, ask the head teacher or an admin to correct it. Changes are recorded.</li>
        </ul>
      </Section>
      <Section title="Waiting for you (on Today)">
        <p>Open it each morning. It lists missing homework, absence follow-ups and Qur&apos;an revision, most urgent first. Items clear by themselves when the work is done.</p>
      </Section>
      <Section title="Lesson PDFs and worksheets">
        <p>Make every lesson PDF and worksheet work both ways: pupils either write on it on a tablet with a stylus (recommended for every pupil) or print it at home (required if they have no stylus tablet), so keep pages printable on A4 and leave room to write.</p>
      </Section>
      <Section title="Homework that is not handed in">
        <ol>
          <li><b>Due date:</b> missing is marked for you.</li>
          <li><b>1 day:</b> the pupil and parent see it under Waiting for you on their Today page.</li>
          <li><b>2 days:</b> tell the parent.</li>
          <li><b>3 days:</b> chase the pupil and agree a day.</li>
          <li><b>5 days:</b> escalate to the head teacher.</li>
          <li><b>3 missed in 14 days:</b> speak to the parent and agree support.</li>
        </ol>
      </Section>
      <Section title="Marking Qur'an and Qaidah out of 10">
        <p>Fail is 0 to 4, pass is 5 or more, secure is 8 or more. Pick a focus area when something needs work.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <tbody>
              {MARK_BANDS.map((b) => (
                <tr key={b.label} className="border-t border-gold-light/60 align-top">
                  <td className="py-1.5 pr-3 tabular-nums">{b.min === b.max ? b.min : `${b.min}-${b.max}`}</td>
                  <td className="pr-3 font-medium">{b.label}</td>
                  <td>{b.means}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Schedule one-to-one recitation like a normal lesson. A surah is covered once it has been assessed once, and comes due for revision again after 3, 7, 14 or 30 days depending on the mark.</p>
      </Section>
      <Section title="A pupil is absent">
        <p>Mark them absent in the register. The office follows up with the family and records the reason, which you will then see on the register. If you know something the office should hear (for example the pupil seemed unwell yesterday), message the office. If you are worried about the child, use Report a concern.</p>
      </Section>
      <Section title="Worried about a child">
        <p>
          Report it straight away through{" "}
          <Link href="/report-concern" className="font-semibold text-teal-700 underline">
            Report a concern
          </Link>
          . Do not wait, and do not investigate yourself. It is always available, even before you clock in.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${ui.card} space-y-2 text-sm text-ink/85 [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5`}>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}
