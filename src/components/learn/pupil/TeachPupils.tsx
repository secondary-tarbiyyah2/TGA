"use client";

import { Loading } from "@/components/learn/kit";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/learn/PageHeader";
import { useLearnSession } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatStamp } from "./data";
import { PupilRecord } from "./PupilRecord";
import { PupilOverview } from "./PupilOverview";
import { ackState, usePupils, type PupilRow } from "./usePupils";
import { Tabs } from "@/components/learn/Tabs";
import { localDateKey } from "@/lib/learn/calendar";
import { reasonLabel } from "@/components/learn/absences/data";
import { useSupportPlans } from "@/lib/learn/send";
import { PupilSupportCard, SupportBadge } from "@/components/learn/send/SupportAtAGlance";
import { Select } from "@/components/learn/Select";

type Signals = { rate: number | null; lessons: number; awayToday: string | null };

/**
 * What a teacher needs to know about each pupil at a glance, from records the
 * portal already keeps: attendance over the last 30 days, and whether they
 * are away today with the reason the family or office gave. RLS limits all
 * of it to the teacher's own classes.
 */
function usePupilSignals(ids: string[]): Record<string, Signals> | null {
  const [out, setOut] = useState<Record<string, Signals> | null>(null);
  const key = ids.join(",");
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !key) return;
    let alive = true;
    (async () => {
      const today = localDateKey(new Date());
      const from = new Date();
      from.setDate(from.getDate() - 30);
      const [att, notes, reasons] = await Promise.all([
        supabase.from("attendance_records").select("child_id, status, lesson_instances!inner(date)").gte("lesson_instances.date", localDateKey(from)).lte("lesson_instances.date", today).limit(5000),
        supabase.from("absence_notes").select("child_id, reason, from_date, to_date, status").lte("from_date", today).gte("to_date", today),
        supabase.from("absence_reasons").select("child_id, reason_code").eq("absence_date", today),
      ]);
      if (!alive) return;
      const m: Record<string, { seen: number; there: number; absentToday: boolean }> = {};
      for (const r of (att.data as unknown as { child_id: string; status: string; lesson_instances: { date: string } | null }[]) || []) {
        const x = (m[r.child_id] ||= { seen: 0, there: 0, absentToday: false });
        x.seen++;
        if (r.status === "present" || r.status === "late" || r.status === "not_engaged") x.there++;
        if (r.lesson_instances?.date === today && (r.status === "absent" || r.status === "excused" || r.status === "technical")) x.absentToday = true;
      }
      const noteBy = new Map(((notes.data as { child_id: string; reason: string }[]) || []).map((n) => [n.child_id, n.reason]));
      const codeBy = new Map(((reasons.data as { child_id: string; reason_code: string }[]) || []).map((r) => [r.child_id, r.reason_code]));
      const res: Record<string, Signals> = {};
      for (const id of key.split(",")) {
        const x = m[id];
        const note = noteBy.get(id);
        const code = codeBy.get(id);
        res[id] = {
          rate: x && x.seen ? Math.round((x.there / x.seen) * 100) : null,
          lessons: x?.seen || 0,
          awayToday: note ? note : code ? reasonLabel(code) || "Away" : x?.absentToday ? "No reason given yet" : null,
        };
      }
      setOut(res);
    })();
    return () => {
      alive = false;
    };
  }, [key]);
  return out;
}

const ACK_BADGE = {
  none: { label: "Not read yet", cls: "bg-amber-50 text-amber-900" },
  stale: { label: "Changed since you read it", cls: "bg-amber-50 text-amber-900" },
  current: { label: "Acknowledged", cls: "bg-green-50 text-green-800" },
} as const;

export function TeachPupils() {
  const { pupils, error, reload } = usePupils(true);
  const { roles } = useLearnSession();
  const canAcknowledge = roles.some((r) => r.role === "teacher" || r.role === "teaching_assistant_cover");
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [only, setOnly] = useState<"all" | "alerts" | "away" | "todo" | "send">("all");
  const [open, setOpen] = useState<PupilRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);

  const taught = useMemo(() => (pupils || []).filter((p) => p.classes.length > 0), [pupils]);
  const signals = usePupilSignals(taught.map((p) => p.id));
  const plans = useSupportPlans(pupils ? taught.map((p) => p.id) : null);

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
      if (only === "away") return !!signals?.[p.id]?.awayToday;
      if (only === "todo") return ackState(p) !== "current";
      if (only === "send") return !!plans?.[p.id];
      return true;
    });
  }, [pupils, q, cls, only, signals, plans]);

  // Links from the Action centre and the Qur'an page land here as ?pupil=<id>: open that pupil.
  useEffect(() => {
    if (!pupils) return;
    const id = new URLSearchParams(window.location.search).get("pupil");
    const hit = id && pupils.find((p) => p.id === id);
    if (hit) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- open the linked pupil once the list arrives
      setOpen(hit);
      window.history.replaceState(null, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the pupil list first arrives
  }, [pupils === null]);

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
        crumbs={[{ label: "Today", href: "/teach/dashboard" }, { label: "Pupils" }]}
        title="Pupils"
        subtitle="Everyone you teach: who is away today and why, attendance, and the medical and additional-needs information to read."
      />
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">Some of this couldn&apos;t load: {error}</p>}

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search by name" className={`${selectCls} min-w-[12rem] flex-1`} />
          <Select value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Class" className={selectCls}>
            <option value="">All my classes</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <Tabs
          variant="switch"
          label="Show"
          guide="pupils-filter"
          value={only}
          onChange={setOnly}
          items={[
            { key: "all" as const, label: "Everyone", count: taught.length },
            { key: "away" as const, label: "Away today", count: signals ? taught.filter((p) => signals[p.id]?.awayToday).length : undefined },
            { key: "alerts" as const, label: "Medical alerts", count: taught.filter((p) => p.alerts.length > 0).length },
            ...(plans && Object.keys(plans).length ? [{ key: "send" as const, label: "Support plan", count: Object.keys(plans).length }] : []),
            ...(canAcknowledge ? [{ key: "todo" as const, label: "Still to read", count: todo, countAlert: todo > 0 }] : []),
          ]}
        />

        {pupils === null ? (
          <Loading label="Loading…" bare />
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border border-gold-light bg-white p-4 text-sm text-ink/65">No pupils to show.</p>
        ) : (
          <ul data-guide="pupils-list" className="divide-y divide-gold-light/50 rounded-2xl border border-gold-light bg-white">
            {rows.map((p) => {
              const st = ackState(p);
              const sig = signals?.[p.id];
              const initials = p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => { setAckError(null); setOpen(p); }} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-cream/50">
                    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-900">{initials}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">
                        {p.name}
                        <SupportBadge plan={plans?.[p.id]} />
                      </span>
                      <span className="block truncate text-xs text-ink/65">{[p.yearGroup, p.classes.map((c) => c.name).join(", ")].filter(Boolean).join(" · ")}</span>
                      {sig?.awayToday && (
                        <span className="mt-1 block text-xs font-medium text-amber-900">
                          Away today: <span className="font-normal">{sig.awayToday}</span>
                        </span>
                      )}
                    </span>
                    <span className="w-28 shrink-0 text-right">
                      <span className={`block text-sm font-semibold tabular-nums ${sig?.rate != null && sig.rate < 90 ? "text-amber-800" : "text-ink"}`}>{sig?.rate != null ? `${sig.rate}%` : <span className="font-normal text-ink/55">No data</span>}</span>
                      <span className="block whitespace-nowrap text-[11px] text-ink/65">30-day attendance</span>
                    </span>
                    <span className="flex basis-full flex-wrap items-center gap-1.5 sm:basis-auto">
                      {p.alerts.map((a) => (
                        <span key={a} className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">
                          {a}
                        </span>
                      ))}
                      {canAcknowledge && st !== "current" && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACK_BADGE[st].cls}`}>{ACK_BADGE[st].label}</span>}
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
            <div className="space-y-4 overflow-y-auto p-4">
              {plans?.[open.id] && <PupilSupportCard plan={plans[open.id]} />}
              <PupilOverview childId={open.id} />
              <PupilRecord teacherView child={{ id: open.id, name: open.name, dob: open.dob, yearGroup: open.yearGroup, classes: open.classes.map((c) => c.name) }} />
            </div>
            {canAcknowledge && (
              <div className="border-t border-gold-light/60 bg-white px-4 py-3">
                {ackError && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{ackError}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-ink/65">
                    {ackState(open) === "current" && open.ack
                      ? `You acknowledged this on ${formatStamp(open.ack.acknowledged_at)}.`
                      : ackState(open) === "stale"
                        ? "This record has changed since you last read it."
                        : "Tick this off once you have read the health and needs information."}
                  </p>
                  {ackState(open) !== "current" && (
                    <button type="button" disabled={busy} onClick={() => acknowledge(open)} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
                      {busy ? "Saving…" : "I've read this"}
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
