"use client";

import { useEffect, useMemo, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { GcseClassPanel, GcseStatusChip } from "@/components/learn/GcseTracker";
import { GCSE_COLUMNS, GCSE_STATUS_META, gcseStatus, isGcseYear, type GcseRow, type GcseStatus } from "@/lib/learn/gcse";
import { getSupabaseClient } from "@/lib/supabase/client";

type Row = GcseRow & { children: { name: string } | null; subjects: { name: string } | null; classes: { name: string } | null };
type ClassOpt = { id: string; name: string; year_group: string | null; subject_id: string | null };

const ORDER: Record<GcseStatus, number> = { behind: 0, no_data: 1, on_track: 2, ahead: 3 };

function AdminGcseContent() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [classes, setClasses] = useState<ClassOpt[]>([]);
  const [classId, setClassId] = useState("");
  const [filter, setFilter] = useState<"all" | GcseStatus>("all");

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const [{ data: g }, { data: c }] = await Promise.all([
        supabase.from("gcse_grades").select(`${GCSE_COLUMNS}, children(name), subjects(name), classes(name)`).limit(2000),
        supabase.from("classes").select("id, name, year_group, subject_id").order("name"),
      ]);
      setRows((g as unknown as Row[]) || []);
      setClasses(((c as ClassOpt[]) || []).filter((k) => isGcseYear(k.year_group) && !!k.subject_id));
    })();
  }, [supabase]);

  const shown = useMemo(() => {
    const list = (rows || []).filter((r) => filter === "all" || gcseStatus(r).status === filter);
    return list.sort((a, b) => ORDER[gcseStatus(a).status] - ORDER[gcseStatus(b).status] || (a.children?.name || "").localeCompare(b.children?.name || ""));
  }, [rows, filter]);

  const counts = useMemo(() => {
    const m: Record<GcseStatus, number> = { behind: 0, no_data: 0, on_track: 0, ahead: 0 };
    for (const r of rows || []) m[gcseStatus(r).status] += 1;
    return m;
  }, [rows]);

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${active ? "border-gold-700 bg-gold-700 text-white" : "border-gold-light bg-white text-ink/80 hover:bg-cream"}`;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "GCSE progress" }]}
        title="GCSE progress"
        subtitle="Predicted against actual grades (1–9) for Years 10 and 11. Teachers enter them from Assessment; pupils and parents see their own."
      />

      <div className="mb-6 rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-h3 font-semibold text-ink">Overview</h2>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")} className={chip(filter === "all")}>
            All ({rows?.length ?? 0})
          </button>
          {(["behind", "on_track", "ahead", "no_data"] as GcseStatus[]).map((s) => (
            <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)} className={chip(filter === s)}>
              {GCSE_STATUS_META[s].label} ({counts[s]})
            </button>
          ))}
        </div>
        <div className="mt-4 overflow-x-auto">
          {rows === null ? (
            <p className="text-sm text-ink/60">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-ink/60">No GCSE grades recorded yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-ink/60">
                  <th className="py-1 pr-3 font-medium">Pupil</th>
                  <th className="py-1 pr-3 font-medium">Subject</th>
                  <th className="py-1 pr-3 font-medium">Class</th>
                  <th className="py-1 pr-3 font-medium">Target</th>
                  <th className="py-1 pr-3 font-medium">Predicted</th>
                  <th className="py-1 pr-3 font-medium">Actual</th>
                  <th className="py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold-light/30">
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5 pr-3 text-ink">{r.children?.name || "Pupil"}</td>
                    <td className="py-1.5 pr-3">{r.subjects?.name || "–"}</td>
                    <td className="py-1.5 pr-3">{r.classes?.name || "–"}</td>
                    <td className="py-1.5 pr-3">{r.target_grade ?? "–"}</td>
                    <td className="py-1.5 pr-3">{r.predicted_grade ?? "–"}</td>
                    <td className="py-1.5 pr-3">{r.actual_grade ?? "–"}</td>
                    <td className="py-1.5">
                      <GcseStatusChip row={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-h3 font-semibold text-ink">Enter or edit grades for a class</h2>
        <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="GCSE class" className="mt-3 rounded-md border border-gold-light/60 px-3 py-2 text-sm">
          <option value="">Choose a Year 10 / 11 class…</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {classes.length === 0 && <p className="mt-2 text-sm text-ink/60">No Year 10 or Year 11 classes with a subject yet.</p>}
      </div>
      {classId && <GcseClassPanel classId={classId} />}
    </>
  );
}

export default function AdminGcsePage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminGcseContent />
      </LearnGate>
    </section>
  );
}
