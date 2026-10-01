import { WEEKDAYS, type TimetableSlot } from "@/lib/learn/timetable";
import { hhmm } from "./types";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

function sorted(slots: TimetableSlot[]): TimetableSlot[] {
  return [...slots].sort((a, b) => a.weekday - b.weekday || hhmm(a.start_time).localeCompare(hhmm(b.start_time)));
}

export function downloadCsv(filename: string, slots: TimetableSlot[], teacherName: (id: string) => string, sessionName: (id: string | null) => string) {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [["Day", "Start", "End", "Class", "Subject", "Teacher", "Session"].map(q).join(",")];
  for (const s of sorted(slots)) {
    rows.push([WEEKDAYS.find((w) => w.value === s.weekday)?.label || "", hhmm(s.start_time), hhmm(s.end_time), s.classes?.name || "", s.subjects?.name || "", teacherName(s.teacher_user_id), sessionName(s.virtual_session_id)].map(q).join(","));
  }
  const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Opens a clean, print-ready grid in a new window and prints it. */
export function printTimetable(title: string, slots: TimetableSlot[], teacherName: (id: string) => string) {
  const times = new Map<string, string>();
  for (const s of slots) times.set(hhmm(s.start_time), hhmm(s.end_time));
  const ordered = [...times.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const head = WEEKDAYS.map((w) => `<th>${w.label}</th>`).join("");
  const body = ordered
    .map(([st, en]) => {
      const cells = WEEKDAYS.map((w) => {
        const inner = slots
          .filter((s) => s.weekday === w.value && hhmm(s.start_time) === st)
          .map((s) => `<div class="l"><b>${esc(s.classes?.name || "")}</b><br>${esc(s.subjects?.name || "")}<br><i>${esc(teacherName(s.teacher_user_id))}</i></div>`)
          .join("");
        return `<td>${inner}</td>`;
      }).join("");
      return `<tr><th>${st}<br>${en}</th>${cells}</tr>`;
    })
    .join("");
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:12px sans-serif;margin:24px}h1{font-size:18px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #bbb;padding:4px;vertical-align:top}th{background:#f4f1ea}.l{border-left:3px solid #888;background:#fafafa;margin-bottom:3px;padding:2px 4px}</style></head><body><h1>${esc(title)}</h1><table><thead><tr><th>Time</th>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`,
  );
  w.document.close();
  w.focus();
  w.print();
}
