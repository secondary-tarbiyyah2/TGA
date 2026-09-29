"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { useLearnPermission } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";

type Row = {
  id: string;
  status: "present" | "absent" | "late";
  marked_at: string;
  children?: { name: string } | null;
  lesson_instances?: { date: string; timetable_slots?: { classes?: { name: string } | null } | null } | null;
};

function toCsv(rows: Row[]): string {
  const header = ["Date", "Class", "Child", "Status", "Marked at"];
  const lines = rows.map((r) =>
    [
      r.lesson_instances?.date || "",
      r.lesson_instances?.timetable_slots?.classes?.name || "",
      r.children?.name || "",
      r.status,
      new Date(r.marked_at).toISOString(),
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

function AttendanceContent() {
  const supabase = getSupabaseClient();
  const canExport = useLearnPermission("can_export_data");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [days, setDays] = useState(14);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("attendance_records")
        .select("id, status, marked_at, children(name), lesson_instances(date, timetable_slots(classes(name)))")
        .gte("marked_at", since)
        .order("marked_at", { ascending: false })
        .limit(500);
      setRows((data as unknown as Row[]) || []);
    })();
  }, [supabase, days]);

  const summary = (rows || []).reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const exportCsv = () => {
    if (!rows) return;
    const blob = new Blob([toCsv(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-h2 font-semibold text-ink">Attendance</h1>
            <p className="mt-1 text-sm text-ink/60">Whole-school register, most recent first.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label="Date range"
              className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            {canExport && rows && rows.length > 0 && (
              <button type="button" onClick={exportCsv} className="rounded-full border border-gold-500 px-4 py-2 text-xs font-semibold text-gold-700 hover:bg-cream">
                Export CSV
              </button>
            )}
          </div>
        </div>
        {!canExport && (
          <p className="mt-2 text-xs text-ink/50">
            Exporting this data requires the &quot;Can export data&quot; permission — ask a Head Teacher to grant it if you need it.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full bg-cream px-3 py-1">Present: {summary.present || 0}</span>
          <span className="rounded-full bg-cream px-3 py-1">Late: {summary.late || 0}</span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">Absent: {summary.absent || 0}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-gold-light/50 bg-white p-6 overflow-x-auto">
        {rows === null && <p className="text-sm text-ink/60">Loading…</p>}
        {rows && rows.length === 0 && <p className="text-sm text-ink/60">No attendance records in this window.</p>}
        {rows && rows.length > 0 && (
          <table className="w-full min-w-[600px] border-collapse text-left text-sm">
            <thead>
              <tr>
                {["Date", "Class", "Child", "Status"].map((h) => (
                  <th key={h} className="border-b border-gold-light/50 p-2 font-semibold text-ink/70">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="border-b border-gold-light/20 p-2 text-ink/70">{r.lesson_instances?.date}</td>
                  <td className="border-b border-gold-light/20 p-2 text-ink/70">{r.lesson_instances?.timetable_slots?.classes?.name}</td>
                  <td className="border-b border-gold-light/20 p-2 font-medium text-ink">{r.children?.name}</td>
                  <td className={`border-b border-gold-light/20 p-2 ${r.status === "absent" ? "text-amber-800" : "text-ink/70"}`}>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function AdminAttendancePage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminShell>
          <AttendanceContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
