"use client";

import { WEEKDAYS, KIND_STYLE, effectivePeriods, periodApplies, timeLabel, type TimetablePeriod, type TimetableSlot } from "@/lib/learn/timetable";
import { useTimetablePeriods } from "@/lib/learn/useTimetablePeriods";

type Props = {
  slots: TimetableSlot[];
  /** Larger, simpler cells for younger students — UI-only branch, same data/permissions (see ground rules). */
  simplified?: boolean;
  /** Show the subject's class/year-group label too (useful for teacher/admin views spanning several classes). */
  showClassLabel?: boolean;
  emptyMessage?: string;
  /** Year group name(s) of the viewer, so year-specific periods (e.g. the GCSE extended day) show. Unknown: only periods for everyone show. */
  yearGroups?: string[];
};

type Row = { key: string; start: string; end: string; lesson: boolean; period: TimetablePeriod | null };

/**
 * Read-only weekly timetable grid. Mobile-first: scrolls horizontally at
 * narrow widths (360-390px) rather than squashing columns unreadably, and
 * every cell stays readable in the print stylesheet (see the "print:"
 * utility classes) so a parent/student/teacher can use the browser's own
 * Print / Save as PDF without a separate print-only route.
 */
export function TimetableGrid({ slots, simplified = false, showClassLabel = false, emptyMessage, yearGroups }: Props) {
  const stored = useTimetablePeriods();
  if (slots.length === 0) {
    return (
      <p className="text-sm text-ink/65">
        {emptyMessage || "No published timetable yet — check back once the school has published one."}
      </p>
    );
  }

  const byCell = new Map<string, TimetableSlot[]>();
  for (const s of slots) {
    const key = `${s.weekday}-${timeLabel(s.start_time)}`;
    const list = byCell.get(key) || [];
    list.push(s);
    byCell.set(key, list);
  }

  // Rows: the school day's periods (lessons and non-lesson blocks), plus a row
  // for any lesson that sits outside them so nothing is ever hidden.
  // Teachers (showClassLabel) see the blocks of every year group they teach.
  const taught = showClassLabel ? Array.from(new Set(slots.map((s) => s.classes?.year_group).filter((y): y is string => Boolean(y)))) : [];
  const viewerGroups = yearGroups && yearGroups.length > 0 ? yearGroups : taught;
  const viewer = viewerGroups.length > 0 ? viewerGroups : undefined;
  const rows: Row[] = [];
  const lessonStarts = new Set<string>();
  for (const p of effectivePeriods(stored)) {
    const hasSlots = p.kind === "lesson" && slots.some((s) => timeLabel(s.start_time) === p.start_time);
    if (!periodApplies(p, viewer) && !hasSlots) continue;
    if (p.kind === "lesson") {
      if (lessonStarts.has(p.start_time)) continue;
      lessonStarts.add(p.start_time);
    }
    rows.push({ key: p.id, start: p.start_time, end: p.end_time, lesson: p.kind === "lesson", period: p });
  }
  for (const s of slots) {
    const st = timeLabel(s.start_time);
    if (lessonStarts.has(st)) continue;
    lessonStarts.add(st);
    rows.push({ key: `slot-${st}`, start: st, end: timeLabel(s.end_time), lesson: true, period: null });
  }
  rows.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

  const cellPad = simplified ? "p-3" : "p-2";
  const textSize = simplified ? "text-base" : "text-sm";

  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full min-w-[560px] border-collapse text-left print:min-w-0">
        <thead>
          <tr>
            <th className={`${cellPad} ${textSize} border-b border-gold-light/50 font-semibold text-ink/70`}>Time</th>
            {WEEKDAYS.map((wd) => (
              <th key={wd.value} className={`${cellPad} ${textSize} border-b border-gold-light/50 font-semibold text-ink/70`}>
                {simplified ? wd.label : wd.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p = r.period;
            if (!r.lesson && p) {
              const style = KIND_STYLE[p.kind];
              return (
                <tr key={r.key}>
                  <td className={`${cellPad} ${textSize} border-b border-gold-light/20 whitespace-nowrap text-ink/65`}>
                    {r.start}–{r.end}
                  </td>
                  {WEEKDAYS.every((wd) => p.weekdays.includes(wd.value)) ? (
                    <td colSpan={WEEKDAYS.length} className={`${cellPad} print-break-row border-b border-gold-light/20 text-center align-middle`}>
                      <div className={`print-break-pill rounded-lg border ${style.cell} px-2 py-1 text-xs font-medium`}>
                        {p.name}
                        {p.kind === "enrichment" && p.activity ? <span className="font-normal opacity-80"> · {p.activity}</span> : null}
                        {p.kind === "enrichment" && p.supervisor_name ? <span className="font-normal opacity-80"> · Supervised by {p.supervisor_name}</span> : null}
                      </div>
                    </td>
                  ) : (
                    WEEKDAYS.map((wd) => (
                      <td key={wd.value} className={`${cellPad} border-b border-gold-light/20 align-top`}>
                        {p.weekdays.includes(wd.value) && (
                          <div className={`print-break-pill rounded-lg border ${style.cell} px-2 py-1 text-xs font-medium`}>
                            {p.name}
                            {p.kind === "enrichment" && p.activity ? <div className="font-normal opacity-80">{p.activity}</div> : null}
                            {p.kind === "enrichment" && p.supervisor_name ? <div className="font-normal opacity-80">Supervised by {p.supervisor_name}</div> : null}
                          </div>
                        )}
                      </td>
                    ))
                  )}
                </tr>
              );
            }
            return (
              <tr key={r.key} className={(p?.band || (r.start >= "14:00" ? "B" : "A")) === "B" ? "bg-cream/40" : undefined}>
                <td className={`${cellPad} ${textSize} border-b border-gold-light/20 whitespace-nowrap text-ink/65`}>
                  {r.start}–{r.end}
                </td>
                {WEEKDAYS.map((wd) => {
                  const cell = byCell.get(`${wd.value}-${r.start}`) || [];
                  return (
                    <td key={wd.value} className={`${cellPad} border-b border-gold-light/20 align-top`}>
                      {cell.map((s) => (
                        <div
                          key={s.id}
                          className={`rounded-lg border border-gold-500/40 bg-gold-500/10 ${cellPad} ${textSize} font-medium text-ink`}
                        >
                          {s.subjects?.name || "Lesson"}
                          {showClassLabel && s.classes ? (
                            <div className="text-xs font-normal text-ink/65">
                              {s.classes.year_group} · {s.classes.name}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
