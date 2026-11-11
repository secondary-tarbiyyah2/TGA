"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchAllClasses } from "@/lib/learn/classes";
import { Loading } from "@/components/learn/kit";
import { EmptyState } from "@/components/learn/ui";
import { pupilOverview, type OverviewMark } from "@/lib/learn/quranOverview";
import { isQuranClass } from "./QuranClasses";

type Row = { id: string; name: string; pupils: number; heardWeek: number; notHeard: number; avg: number | null; memorised: number | null };

const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * The headteacher's view across every Qur'an class (after Ihsan LMS's class summary): pupils,
 * heard this week, not heard for a week, the class's recent average and average memorised.
 * Choose a class to open it below.
 */
export function QuranSchoolOverview({ onOpen }: { onOpen: (classId: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const all = await fetchAllClasses();
      const classes = all.filter(isQuranClass);
      if (!classes.length) {
        if (alive) setRows([]);
        return;
      }
      const enr = await supabase.from("enrolments").select("class_id, child_id").in("class_id", classes.map((c) => c.id));
      const pairs = (enr.data as { class_id: string; child_id: string }[] | null) || [];
      const kids = [...new Set(pairs.map((p) => p.child_id))];
      const mk = kids.length
        ? await supabase
            .from("quran_progress")
            .select("id, child_id, surah_from, ayah_from, ayah_to, score, session_date, setting, recitation_kind, class_id")
            .in("child_id", kids)
            .eq("milestone_type", "quran_memorisation")
            .gte("session_date", addDays(-365))
            .limit(10000)
        : { data: [] };
      const marks = (mk.data as OverviewMark[] | null) || [];
      const byChild = new Map<string, OverviewMark[]>();
      for (const m of marks) byChild.set(m.child_id, [...(byChild.get(m.child_id) || []), m]);
      const out: Row[] = classes.map((c) => {
        const ids = pairs.filter((p) => p.class_id === c.id).map((p) => p.child_id);
        const os = ids.map((id) => pupilOverview(byChild.get(id) || []));
        const avgs = os.map((o) => o.recentAverage).filter((x): x is number => x !== null);
        const mem = os.map((o) => o.coverage.pagePercent);
        return {
          id: c.id,
          name: c.name,
          pupils: ids.length,
          heardWeek: os.filter((o) => !o.notHeardThisWeek).length,
          notHeard: os.filter((o) => o.notHeardThisWeek).length,
          avg: avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10 : null,
          memorised: mem.length ? Math.round((mem.reduce((a, b) => a + b, 0) / mem.length) * 10) / 10 : null,
        };
      });
      if (alive) setRows(out);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (rows === null) return <Loading label="Loading Qur'an classes" bare />;
  if (rows.length === 0) return <EmptyState title="No Qur'an classes yet.">Add a class with the subject Qur&apos;an for each year group.</EmptyState>;
  return (
    <section aria-labelledby="quran-school" className="space-y-2">
      <h2 id="quran-school" className="t-section">
        Across the school
      </h2>
      <div className="overflow-x-auto rounded-2xl border border-gold-light bg-white">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b border-gold-light bg-[var(--portal-hover)] text-left text-xs font-semibold text-ink-500">
            <tr>
              <th scope="col" className="px-3 py-2">Class</th>
              <th scope="col" className="px-3 py-2 text-right">Pupils</th>
              <th scope="col" className="px-3 py-2 text-right">Heard this week</th>
              <th scope="col" className="px-3 py-2 text-right">Not heard for a week</th>
              <th scope="col" className="px-3 py-2 text-right">Average</th>
              <th scope="col" className="px-3 py-2 text-right">Memorised (avg)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gold-light/60">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-[var(--portal-hover)]">
                <td className="px-3 py-2">
                  <button type="button" onClick={() => onOpen(r.id)} className="font-medium text-ink hover:text-forest-700 hover:underline">
                    {r.name}
                  </button>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.pupils}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.heardWeek}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${r.notHeard ? "font-semibold text-amber-900" : ""}`}>{r.notHeard}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.avg !== null ? `${r.avg} / 10` : "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.memorised !== null ? `${r.memorised}%` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
