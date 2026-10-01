"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMyClasses } from "@/lib/learn/useMyClasses";
import { AwardBadgeForm } from "@/components/learn/behaviour/BadgeShelf";
import { DetentionRegister } from "@/components/learn/behaviour/DetentionRegister";
import { LogModal } from "@/components/learn/behaviour/LogModal";
import { RecordsTable } from "@/components/learn/behaviour/RecordsTable";
import { StatTile } from "@/components/learn/behaviour/StatTile";
import {
  computeStats,
  loadDetentions,
  loadRecords,
  loadStudents,
  periodRange,
  uniqueChildIds,
  type BehaviourKind,
  type BehaviourRecord,
  type Detention,
  type StudentOption,
} from "@/components/learn/behaviour/data";

type Modal = { kind: BehaviourKind; childId?: string };

function TeachBehaviourContent() {
  const classes = useMyClasses();
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<StudentOption[] | null>(null);
  const [records, setRecords] = useState<BehaviourRecord[]>([]);
  const [detentions, setDetentions] = useState<Detention[]>([]);
  const [modal, setModal] = useState<Modal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const classIds = useMemo(() => (classes || []).map((c) => c.id), [classes]);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || classes === null) return;
    try {
      const studs = await loadStudents(supabase, classIds);
      const childIds = uniqueChildIds(studs);
      const [recs, dets] = await Promise.all([loadRecords(supabase, { childIds }), loadDetentions(supabase, { childIds })]);
      setStudents(studs);
      setRecords(recs);
      setDetentions(dets);
    } catch {
      setError("Couldn't load behaviour records.");
      setStudents([]);
    }
  }, [classes, classIds]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleStudents = useMemo(() => (students || []).filter((s) => !classId || s.classId === classId), [students, classId]);
  const visibleChildIds = useMemo(() => new Set(visibleStudents.map((s) => s.childId)), [visibleStudents]);
  const visibleRecords = useMemo(() => records.filter((r) => visibleChildIds.has(r.child_id)), [records, visibleChildIds]);
  const visibleDetentions = useMemo(() => detentions.filter((d) => visibleChildIds.has(d.child_id)), [detentions, visibleChildIds]);
  const stats = useMemo(() => computeStats(visibleRecords, visibleDetentions, periodRange("week")), [visibleRecords, visibleDetentions]);

  const voidRecord = async (id: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!window.confirm("Void this record? It stops counting towards points.")) return;
    const { error: err } = await supabase.from("behaviour_records").update({ voided_at: new Date().toISOString() }).eq("id", id);
    if (err) return setError("Couldn't void that record.");
    load();
  };

  const delta = stats.meritsPrev === null ? undefined : `${stats.merits - stats.meritsPrev >= 0 ? "+" : ""}${stats.merits - stats.meritsPrev} vs last week`;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "/teach/dashboard" }, { label: "Behaviour" }]}
        title="Behaviour"
        subtitle="Celebrate good choices and follow up on the rest, for the students you teach."
        actions={
          <>
            <Link href="/report-concern" className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
              Raise a concern
            </Link>
            <button type="button" onClick={() => setModal({ kind: "merit" })} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800">
              + Log Merit / Demerit
            </button>
          </>
        }
      />
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {classes === null || students === null ? (
        <p className="text-ink/60">Loading…</p>
      ) : classes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gold-light bg-cream/30 px-4 py-8 text-center text-sm text-ink/60">You are not assigned to any classes yet, so there is no one to log behaviour for.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-ink/70">
              <span className="mr-2">Class</span>
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm">
                <option value="">All my classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Merit points (all time)" value={String(stats.allTimePoints)} sub="Net of demerits" />
            <StatTile label="Merits this week" value={String(stats.merits)} sub={delta} tone={stats.meritsPrev !== null && stats.merits >= stats.meritsPrev ? "good" : "bad"} />
            <StatTile label="Sanctions this week" value={String(stats.demerits)} />
            <StatTile label="Follow-ups outstanding" value={String(stats.detentionsOutstanding)} />
          </div>

          <section className="rounded-2xl border border-gold-light/50 bg-white p-4">
            <h3 className="mb-3 text-base font-semibold text-ink">Quick log</h3>
            {visibleStudents.length === 0 ? (
              <p className="text-sm text-ink/60">No students are enrolled in this class yet.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {visibleStudents.map((s) => (
                  <li key={`${s.childId}:${s.classId}`} className="flex items-center justify-between gap-2 rounded-lg border border-gold-light/50 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{s.name}</span>
                      {!classId && s.className && <span className="block truncate text-xs text-ink/50">{s.className}</span>}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <button type="button" aria-label={`Merit for ${s.name}`} onClick={() => setModal({ kind: "merit", childId: s.childId })} className="rounded-md bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800 hover:bg-green-200">
                        + Merit
                      </button>
                      <button type="button" aria-label={`Demerit for ${s.name}`} onClick={() => setModal({ kind: "demerit", childId: s.childId })} className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">
                        Demerit
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <DetentionRegister detentions={visibleDetentions} onChanged={load} />

          <section className="rounded-2xl border border-gold-light/50 bg-white p-4">
            <h3 className="mb-3 text-base font-semibold text-ink">Recent records</h3>
            <RecordsTable records={visibleRecords.slice(0, 50)} onVoid={voidRecord} empty="Nothing logged yet. Catch someone doing something good and give them a merit." />
          </section>

          <AwardBadgeForm students={visibleStudents} onAwarded={load} />
        </div>
      )}

      {modal && (
        <LogModal
          students={visibleStudents}
          initialKind={modal.kind}
          initialChildId={modal.childId}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </>
  );
}

export default function TeachBehaviourPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <TeachBehaviourContent />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
