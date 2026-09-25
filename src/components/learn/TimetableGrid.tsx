"use client";

import { WEEKDAYS, PERIODS, timeLabel, type TimetableSlot } from "@/lib/learn/timetable";

type Props = {
  slots: TimetableSlot[];
  /** Larger, simpler cells for younger students — UI-only branch, same data/permissions (see ground rules). */
  simplified?: boolean;
  /** Show the subject's class/year-group label too (useful for teacher/admin views spanning several classes). */
  showClassLabel?: boolean;
  emptyMessage?: string;
};

/**
 * Read-only weekly timetable grid. Mobile-first: scrolls horizontally at
 * narrow widths (360-390px) rather than squashing columns unreadably, and
 * every cell stays readable in the print stylesheet (see the "print:"
 * utility classes) so a parent/student/teacher can use the browser's own
 * Print / Save as PDF without a separate print-only route.
 */
export function TimetableGrid({ slots, simplified = false, showClassLabel = false, emptyMessage }: Props) {
  if (slots.length === 0) {
    return (
      <p className="text-sm text-ink/60">
        {emptyMessage || "No published timetable yet — check back once the school has published one."}
      </p>
    );
  }

  const byCell = new Map<string, TimetableSlot[]>();
  for (const s of slots) {
    const key = `${s.weekday}-${s.start_time}`;
    const list = byCell.get(key) || [];
    list.push(s);
    byCell.set(key, list);
  }

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
          {PERIODS.map((p) => (
            <tr key={p.start} className={p.band === "B" ? "bg-cream/40" : undefined}>
              <td className={`${cellPad} ${textSize} border-b border-gold-light/20 whitespace-nowrap text-ink/60`}>
                {timeLabel(p.start)}–{timeLabel(p.end)}
              </td>
              {WEEKDAYS.map((wd) => {
                const cell = byCell.get(`${wd.value}-${p.start}`) || [];
                return (
                  <td key={wd.value} className={`${cellPad} border-b border-gold-light/20 align-top`}>
                    {cell.map((s) => (
                      <div
                        key={s.id}
                        className={`rounded-lg border border-gold-500/40 bg-gold-500/10 ${cellPad} ${textSize} font-medium text-ink`}
                      >
                        {s.subjects?.name || "Lesson"}
                        {showClassLabel && s.classes ? (
                          <div className="text-xs font-normal text-ink/60">
                            {s.classes.year_group} · {s.classes.name}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
