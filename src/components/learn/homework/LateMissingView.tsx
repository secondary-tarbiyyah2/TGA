"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ATTENTION_META, type AttentionKind, type AttentionRow } from "@/lib/learn/homeworkFeedback";

import { Select } from "@/components/ui/Dropdown";
const COLUMNS =
  "homework_id, homework_title, class_id, class_name, due_at, child_id, child_name, submission_id, submitted_at, attention, resubmission_requested_at";

const WINDOWS: { label: string; days: number | null }[] = [
  { label: "Last 14 days", days: 14 },
  { label: "Last 60 days", days: 60 },
  { label: "This year (365 days)", days: 365 },
  { label: "All time", days: null },
];

/**
 * "Late & missing": homework that was never handed in after its deadline,
 * was handed in late, or is waiting for a resubmission the teacher asked for.
 * Reads the homework_attention view (0071), which is RLS-scoped: a teacher
 * gets their own classes, Headteacher/Admin the whole school. Filter by class
 * and by what needs attention; the list is grouped by class.
 */
export function LateMissingView({ scope }: { scope: "teach" | "admin" }) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<AttentionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<number | null>(60);
  const [classId, setClassId] = useState("");
  const [kind, setKind] = useState<"all" | AttentionKind>("all");

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      let q = supabase.from("homework_attention").select(COLUMNS);
      if (windowDays !== null) q = q.gte("due_at", new Date(Date.now() - windowDays * 86_400_000).toISOString());
      const { data, error: err } = await q.order("due_at", { ascending: false }).limit(1000);
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setRows([]);
        return;
      }
      setError(null);
      setRows((data as unknown as AttentionRow[]) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, windowDays]);

  const classes = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows || []) m.set(r.class_id, r.class_name || r.class_id);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const shown = useMemo(
    () => (rows || []).filter((r) => (!classId || r.class_id === classId) && (kind === "all" || r.attention === kind)),
    [rows, classId, kind]
  );

  const grouped = useMemo(() => {
    const m = new Map<string, { name: string; items: AttentionRow[] }>();
    for (const r of shown) {
      const g = m.get(r.class_id) || { name: r.class_name || "Class", items: [] };
      g.items.push(r);
      m.set(r.class_id, g);
    }
    return [...m.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [shown]);

  const count = (k: AttentionKind) => (rows || []).filter((r) => r.attention === k && (!classId || r.class_id === classId)).length;
  const chipCls = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${active ? "border-gold-700 bg-gold-700 text-white" : "border-gold-light bg-white text-ink/80 hover:bg-cream"}`;

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-h3 font-semibold text-ink">Late &amp; missing</h2>
          <p className="mt-1 text-sm text-ink/65">{scope === "admin" ? "Whole school." : "Your classes."} Homework that is overdue, handed in late, or waiting for a resubmission.</p>
        </div>
        <Select allowEmpty
          value={windowDays === null ? "all" : String(windowDays)}
          onChange={(e) => setWindowDays(e.target.value === "all" ? null : Number(e.target.value))}
          aria-label="Time window"
          className="rounded-md border border-gold-light/60 px-3 py-2 text-sm"
        >
          {WINDOWS.map((w) => (
            <option key={w.label} value={w.days === null ? "all" : String(w.days)}>
              {w.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter">
        <button type="button" aria-pressed={kind === "all"} onClick={() => setKind("all")} className={chipCls(kind === "all")}>
          All ({count("missing") + count("late") + count("resubmission_requested")})
        </button>
        {(["missing", "late", "resubmission_requested"] as AttentionKind[]).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={chipCls(kind === k)}>
            {ATTENTION_META[k].label} ({count(k)})
          </button>
        ))}
        {classes.length > 1 && (
          <Select allowEmpty value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class" className="rounded-md border border-gold-light/60 px-3 py-1 text-sm">
            <option value="">All classes</option>
            {classes.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {rows === null ? (
          <p className="text-sm text-ink/65">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-ink/65">Nothing late or missing. Well done.</p>
        ) : (
          grouped.map(([id, g]) => (
            <div key={id}>
              <h3 className="text-sm font-semibold text-ink">
                {g.name} <span className="font-normal text-ink/65">· {g.items.length}</span>
              </h3>
              <ul className="mt-1 divide-y divide-gold-light/30 rounded-lg border border-gold-light/40">
                {g.items.map((r) => (
                  <li key={`${r.homework_id}-${r.child_id}`} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium text-ink">{r.child_name || "Pupil"}</span>
                      <span className="text-ink/65"> · {r.homework_title || "Homework"}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-ink/65">
                      Due {new Date(r.due_at).toLocaleDateString("en-GB")}
                      <span className={`rounded-full px-2 py-0.5 ${ATTENTION_META[r.attention].className}`}>{ATTENTION_META[r.attention].label}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
