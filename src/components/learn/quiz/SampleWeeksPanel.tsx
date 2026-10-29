"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { btn, ui } from "@/components/learn/ui";

type YearGroup = { id: string; name: string };
type Run = { id: string; label: string; status: string; academic_year_id: string };
type Mark = {
  id: string;
  year_group_id: string;
  run_id: string;
  status: "draft" | "review" | "published" | "archived";
  note: string | null;
  published_at: string | null;
  updated_at: string;
};
type HistoryRow = { id: string; run_id: string; status: string; note: string | null; changed_at: string };

/**
 * The Headteacher/Admin action from the ground rules: mark a specific
 * published timetable_run's slots for a specific year_group as the public
 * sample week, with its own draft -> review -> published lifecycle and a
 * real history/revert. RLS (0016_eligibility_quiz_v2.sql) is the actual
 * boundary, this UI only renders for head_teacher/admin because LearnGate
 * already restricts the page, and every write here still goes through the
 * same policies a direct API call would.
 */
export function SampleWeeksPanel() {
  const supabase = getSupabaseClient();
  const [yearGroups, setYearGroups] = useState<YearGroup[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [gaps, setGaps] = useState<{ year_group_id: string; year_group_name: string }[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, HistoryRow[]>>({});
  const [saving, setSaving] = useState<string | null>(null);
  // Chosen run per year group (falls back to the one already marked).
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, { ok: boolean; text: string }>>({});

  const load = useCallback(async () => {
    if (!supabase) return;
    const [{ data: ygs }, { data: rns }, { data: mks }, { data: gapRows }] = await Promise.all([
      supabase.from("year_groups").select("id, name").order("sort_order"),
      supabase.from("timetable_runs").select("id, label, status, academic_year_id").in("status", ["published", "superseded"]).order("published_at", { ascending: false }),
      supabase.from("public_sample_week_marks").select("id, year_group_id, run_id, status, note, published_at, updated_at"),
      supabase.rpc("year_groups_missing_public_sample"),
    ]);
    setYearGroups((ygs as YearGroup[]) || []);
    setRuns((rns as Run[]) || []);
    setMarks((mks as Mark[]) || []);
    setGaps((gapRows as { year_group_id: string; year_group_name: string }[]) || []);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  async function loadHistory(markId: string) {
    if (!supabase) return;
    const { data } = await supabase
      .from("public_sample_week_mark_history")
      .select("id, run_id, status, note, changed_at")
      .eq("mark_id", markId)
      .order("changed_at", { ascending: false });
    setHistory((h) => ({ ...h, [markId]: (data as HistoryRow[]) || [] }));
  }

  async function saveMark(yearGroupId: string, runId: string, status: Mark["status"], existing: Mark | undefined) {
    if (!supabase) return;
    const note = (n: { ok: boolean; text: string }) => setNotes((cur) => ({ ...cur, [yearGroupId]: n }));
    if (!runId) return note({ ok: false, text: "Choose a published timetable first." });
    const yg = yearGroups.find((y) => y.id === yearGroupId)?.name || "this year group";
    if (status === "published" && !window.confirm(`Publish this sample week for ${yg}? Families taking the public quiz will see it straight away.`)) return;
    setSaving(yearGroupId);
    let error: { message: string } | null = null;
    if (existing) {
      ({ error } = await supabase
        .from("public_sample_week_marks")
        .update({
          run_id: runId,
          status,
          published_at: status === "published" ? new Date().toISOString() : existing.published_at,
        })
        .eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("public_sample_week_marks").insert({
        year_group_id: yearGroupId,
        run_id: runId,
        status,
        published_at: status === "published" ? new Date().toISOString() : null,
      }));
    }
    setSaving(null);
    if (error) return note({ ok: false, text: `Couldn't save. Please try again.` });
    note({ ok: true, text: status === "published" ? "Published." : status === "review" ? "Sent to review." : "Draft saved." });
    await load();
    if (existing && expanded === existing.id) await loadHistory(existing.id);
  }

  if (!supabase) return <p className="text-sm text-ink/65">The /learn area isn&apos;t connected yet.</p>;

  return (
    <div className="space-y-6">
      {gaps.length > 0 && (
        <div className="rounded-2xl bg-amber-50 p-5 text-amber-900">
          <p className="font-semibold">No published sample week</p>
          <p className="mt-1 text-sm">
            The following year groups have no published sample week, the public quiz will show the honest fallback
            for them until one is marked here: {gaps.map((g) => g.year_group_name).join(", ")}.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {yearGroups.map((yg) => {
          const existing = marks.find((m) => m.year_group_id === yg.id);
          const runId = choice[yg.id] ?? existing?.run_id ?? "";
          const note = notes[yg.id];
          return (
            <div key={yg.id} className="rounded-2xl border border-gold-light/50 bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-ink">{yg.name}</p>
                <StatusBadge status={existing?.status} />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                <select
                  value={runId}
                  onChange={(e) => setChoice((cur) => ({ ...cur, [yg.id]: e.target.value }))}
                  aria-label={`Timetable for ${yg.name}`}
                  className={`${ui.select} !w-auto`}
                >
                  <option value="" disabled>Choose a published timetable run…</option>
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>{r.label} ({r.status})</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving === yg.id}
                    onClick={() => saveMark(yg.id, runId, "draft", existing)}
                    className={btn("secondary")}
                  >
                    Save draft
                  </button>
                  <button
                    type="button"
                    disabled={saving === yg.id}
                    onClick={() => saveMark(yg.id, runId, "review", existing)}
                    className={btn("secondary")}
                  >
                    Send to review
                  </button>
                  <button
                    type="button"
                    disabled={saving === yg.id}
                    onClick={() => saveMark(yg.id, runId, "published", existing)}
                    className={btn("primary")}
                  >
                    Publish
                  </button>
                </div>
              </div>

              {note && (
                <p role={note.ok ? "status" : "alert"} className={`mt-2 text-xs ${note.ok ? "text-green-800" : "text-red-700"}`}>
                  {note.text}
                </p>
              )}
              {runs.length === 0 && <p className="mt-2 text-xs text-ink/65">No published timetable yet. Publish one in Timetable &amp; lessons first.</p>}

              {existing && (
                <button
                  type="button"
                  onClick={() => {
                    if (expanded === existing.id) {
                      setExpanded(null);
                    } else {
                      setExpanded(existing.id);
                      loadHistory(existing.id);
                    }
                  }}
                  className="mt-3 text-xs text-gold-700 underline"
                >
                  {expanded === existing.id ? "Hide history" : "Show history / revert"}
                </button>
              )}

              {existing && expanded === existing.id && (
                <ul className="mt-2 space-y-1 text-xs text-ink/65">
                  {(history[existing.id] || []).map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-2 border-b border-gold-light/20 py-1">
                      <span>{h.status} · run {runs.find((r) => r.id === h.run_id)?.label ?? h.run_id} · {new Date(h.changed_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })}</span>
                      <button
                        type="button"
                        onClick={() => saveMark(yg.id, h.run_id, h.status as Mark["status"], existing)}
                        className={`${btn("secondary", "sm")} shrink-0`}
                      >
                        Revert to this
                      </button>
                    </li>
                  ))}
                  {(history[existing.id] || []).length === 0 && <li>No history yet.</li>}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="rounded-full bg-cream px-2 py-0.5 text-xs text-ink/65">Not marked</span>;
  const tones: Record<string, string> = {
    draft: "bg-cream text-ink/65",
    review: "bg-amber-100 text-amber-800",
    published: "bg-gold-100 text-gold-800",
    archived: "bg-cream text-ink/65",
  };
  const labels: Record<string, string> = { draft: "Draft", review: "In review", published: "Published", archived: "Archived" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[status] ?? "bg-cream text-ink/65"}`}>{labels[status] ?? status}</span>;
}
