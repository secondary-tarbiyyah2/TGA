"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/learn/PageHeader";
import { useLearnSession } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatStamp } from "./data";
import { PupilRecord } from "./PupilRecord";
import { ackState, usePupils, type PupilRow } from "./usePupils";

const ACK_BADGE = {
  none: { label: "Not acknowledged", cls: "bg-amber-50 text-amber-900" },
  stale: { label: "Changed since you read it", cls: "bg-amber-50 text-amber-900" },
  current: { label: "Acknowledged", cls: "bg-green-50 text-green-800" },
} as const;

export function TeachPupils() {
  const { pupils, error, reload } = usePupils(true);
  const { roles } = useLearnSession();
  const canAcknowledge = roles.some((r) => r.role === "teacher" || r.role === "teaching_assistant_cover");
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [only, setOnly] = useState<"all" | "alerts" | "todo">("all");
  const [open, setOpen] = useState<PupilRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);

  const classOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pupils || []) for (const c of p.classes) m.set(c.id, c.name);
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [pupils]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (pupils || []).filter((p) => {
      if (p.classes.length === 0) return false;
      if (needle && !p.name.toLowerCase().includes(needle)) return false;
      if (cls && !p.classes.some((c) => c.id === cls)) return false;
      if (only === "alerts") return p.alerts.length > 0;
      if (only === "todo") return ackState(p) !== "current";
      return true;
    });
  }, [pupils, q, cls, only]);

  const todo = (pupils || []).filter((p) => p.classes.length > 0 && ackState(p) !== "current").length;

  const acknowledge = async (p: PupilRow) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setAckError(null);
    const { error: e } = await supabase.from("pupil_detail_acknowledgements").upsert({ child_id: p.id }, { onConflict: "child_id,teacher_id" });
    setBusy(false);
    if (e) return setAckError("We couldn't record that just now. Please try again.");
    setOpen(null);
    reload();
  };

  const selectCls = "rounded-lg border border-gold-light bg-white px-3 py-2 text-sm text-ink";

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "/teach/dashboard" }, { label: "Pupils" }]}
        title="Pupils"
        subtitle="Medical, allergy and emergency information for the pupils you teach. Please read it and mark it as read."
      />
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">Some of this couldn&apos;t load: {error}</p>}

      <div className="space-y-4">
        {canAcknowledge && todo > 0 && pupils && (
          <p className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2 text-sm text-amber-950">
            {todo} {todo === 1 ? "pupil" : "pupils"} still to read.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search by name" className={`${selectCls} min-w-[12rem] flex-1`} />
          <select value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Class" className={selectCls}>
            <option value="">All my classes</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
          {(
            [
              ["all", "Everyone"],
              ["alerts", "Medical alerts"],
              ...(canAcknowledge ? ([["todo", "Still to read"]] as const) : []),
            ] as readonly (readonly ["all" | "alerts" | "todo", string])[]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={only === k}
              onClick={() => setOnly(k)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${only === k ? "border-teal-600 bg-teal-600 text-white" : "border-gold-light bg-white text-ink/70 hover:bg-cream"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {pupils === null ? (
          <p className="text-sm text-ink/60">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border border-gold-light bg-white p-4 text-sm text-ink/60">No pupils to show.</p>
        ) : (
          <ul className="divide-y divide-gold-light/50 rounded-2xl border border-gold-light bg-white">
            {rows.map((p) => {
              const st = ackState(p);
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => { setAckError(null); setOpen(p); }} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-cream/50">
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{p.name}</span>
                      <span className="block text-xs text-ink/55">{[p.yearGroup, p.classes.map((c) => c.name).join(", ")].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {p.alerts.map((a) => (
                        <span key={a} className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">
                          {a}
                        </span>
                      ))}
                      {!p.details?.completed_at && <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-medium text-ink/60">Family still completing</span>}
                      {canAcknowledge && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACK_BADGE[st].cls}`}>{ACK_BADGE[st].label}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`${open.name}, pupil information`}>
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-cream sm:rounded-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-gold-light/60 bg-white px-4 py-3">
              <h2 className="text-base font-semibold text-ink">Pupil information</h2>
              <button type="button" onClick={() => setOpen(null)} className="rounded-lg border border-gold-light px-3 py-1.5 text-sm font-medium text-ink/70 hover:bg-cream">
                Close
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              <PupilRecord child={{ id: open.id, name: open.name, dob: open.dob, yearGroup: open.yearGroup, classes: open.classes.map((c) => c.name) }} />
            </div>
            {canAcknowledge && (
              <div className="border-t border-gold-light/60 bg-white px-4 py-3">
                {ackError && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{ackError}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-ink/55">
                    {ackState(open) === "current" && open.ack
                      ? `You acknowledged this on ${formatStamp(open.ack.acknowledged_at)}.`
                      : ackState(open) === "stale"
                        ? "This record has changed since you last read it."
                        : "Tick this off once you have read the medical and emergency information."}
                  </p>
                  {ackState(open) !== "current" && (
                    <button type="button" disabled={busy} onClick={() => acknowledge(open)} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
                      {busy ? "Saving…" : "I've read the medical and emergency information"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
