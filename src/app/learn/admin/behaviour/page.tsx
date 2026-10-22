"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { getSupabaseClient } from "@/lib/supabase/client";
import { AwardBadgeForm, BadgeShelf } from "@/components/learn/behaviour/BadgeShelf";
import { DetentionRegister } from "@/components/learn/behaviour/DetentionRegister";
import { LogModal } from "@/components/learn/behaviour/LogModal";
import { RecordsTable } from "@/components/learn/behaviour/RecordsTable";
import { StatTile } from "@/components/learn/behaviour/StatTile";
import {
  PERIOD_LABEL,
  computeStats,
  inRange,
  loadBadges,
  loadDetentions,
  loadRecords,
  loadStudents,
  periodRange,
  type BadgeAward,
  type BehaviourKind,
  type BehaviourRecord,
  type Detention,
  type Period,
  type StudentOption,
} from "@/components/learn/behaviour/data";
import { Tabs } from "@/components/learn/Tabs";

type Tab = "merits" | "incidents" | "badges";
type Sub = "overview" | "all";
type ClassOpt = { id: string; name: string };
type YearOpt = { id: string; name: string };

function BehaviourContent() {
  const [tab, setTab] = useState<Tab>("merits");
  const [sub, setSub] = useState<Sub>("overview");
  const [period, setPeriod] = useState<Period>("week");
  const [records, setRecords] = useState<BehaviourRecord[] | null>(null);
  const [detentions, setDetentions] = useState<Detention[]>([]);
  const [badges, setBadges] = useState<BadgeAward[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [classes, setClasses] = useState<ClassOpt[]>([]);
  const [years, setYears] = useState<YearOpt[]>([]);
  const [modal, setModal] = useState<BehaviourKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fClass, setFClass] = useState("");
  const [fYear, setFYear] = useState("");
  const [fName, setFName] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
      const [recs, dets, bdg, studs, cls, yrs] = await Promise.all([
        loadRecords(supabase),
        loadDetentions(supabase),
        loadBadges(supabase),
        loadStudents(supabase),
        supabase.from("classes").select("id, name").order("name"),
        supabase.from("year_groups").select("id, name").order("sort_order"),
      ]);
      setRecords(recs);
      setDetentions(dets);
      setBadges(bdg);
      setStudents(studs);
      setClasses((cls.data as ClassOpt[] | null) || []);
      setYears((yrs.data as YearOpt[] | null) || []);
    } catch {
      setError("Couldn't load behaviour records.");
      setRecords([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load behaviour records when the page opens
    load();
  }, [load]);

  const range = useMemo(() => periodRange(period), [period]);
  const stats = useMemo(() => computeStats(records || [], detentions, range), [records, detentions, range]);

  const voidRecord = async (id: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!window.confirm("Void this record? It stops counting towards points.")) return;
    const { error: err } = await supabase.from("behaviour_records").update({ voided_at: new Date().toISOString() }).eq("id", id);
    if (err) return setError("Couldn't void that record.");
    load();
  };

  const filtered = useMemo(() => {
    const q = fName.trim().toLowerCase();
    return (records || []).filter((r) => {
      if (tab === "incidents" ? r.kind !== "incident" : r.kind === "incident") return false;
      if (fClass && r.class_id !== fClass) return false;
      if (fYear && r.children?.year_group_id !== fYear) return false;
      if (q && !(r.children?.name || "").toLowerCase().includes(q)) return false;
      if (fFrom && r.occurred_on < fFrom) return false;
      if (fTo && r.occurred_on > fTo) return false;
      return true;
    });
  }, [records, tab, fClass, fYear, fName, fFrom, fTo]);

  const periodRecords = useMemo(
    () => (records || []).filter((r) => !r.voided_at && r.kind !== "incident" && inRange(r.occurred_on, range.start, range.end)),
    [records, range]
  );

  const top = useMemo(() => {
    const totals = new Map<string, { name: string; pts: number }>();
    for (const r of periodRecords) {
      if (r.kind !== "merit") continue;
      const e = totals.get(r.child_id) || { name: r.children?.name || "Student", pts: 0 };
      e.pts += r.points;
      totals.set(r.child_id, e);
    }
    return Array.from(totals.values())
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 5);
  }, [periodRecords]);

  const delta = stats.meritsPrev === null ? undefined : `${stats.merits - stats.meritsPrev >= 0 ? "+" : ""}${stats.merits - stats.meritsPrev} vs previous period`;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Site administration", href: "/admin/site" }, { label: "Behaviour" }]}
        title="Behaviour"
        subtitle="Merits, demerits, incidents, online follow-up sessions and badges across the school."
        actions={
          <>
            <Link href="/report-concern" className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
              Raise a concern
            </Link>
            <button type="button" onClick={() => setModal(tab === "incidents" ? "incident" : "merit")} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900">
              {tab === "incidents" ? "+ Log incident" : "+ Log merit or demerit"}
            </button>
          </>
        }
      />
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <Tabs
        items={[
          { key: "merits", label: "Merits and demerits" },
          { key: "incidents", label: "Incidents" },
          { key: "badges", label: "Badges" },
        ]}
        value={tab}
        onChange={setTab}
        label="Behaviour sections"
        className="mb-4"
      />

      {records === null ? (
        <p className="text-ink/65">Loading…</p>
      ) : tab === "badges" ? (
        <div className="space-y-4">
          <AwardBadgeForm students={students} onAwarded={load} />
          <BadgeShelf badges={badges} showStudent />
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <Tabs
              variant="switch"
              items={[
                { key: "overview", label: "Overview" },
                { key: "all", label: "All records" },
              ]}
              value={sub}
              onChange={setSub}
              label="Behaviour view"
            />
            <label className="text-sm text-ink/70">
              <span className="sr-only">Period</span>
              <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm">
                {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                  <option key={p} value={p}>
                    {PERIOD_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {sub === "overview" && tab === "merits" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="Merit points (all time)" value={String(stats.allTimePoints)} sub="Net of demerits" />
                <StatTile label={`Merits · ${PERIOD_LABEL[period].toLowerCase()}`} value={String(stats.merits)} sub={delta} tone={stats.meritsPrev !== null && stats.merits >= stats.meritsPrev ? "good" : "bad"} />
                <StatTile label={`Sanctions · ${PERIOD_LABEL[period].toLowerCase()}`} value={String(stats.demerits)} sub="Demerits given" />
                <StatTile label="Follow-ups outstanding" value={String(stats.detentionsOutstanding)} sub="Scheduled, not yet served" />
              </div>
              <DetentionRegister detentions={detentions} onChanged={load} />
              <div className="grid gap-4 lg:grid-cols-3">
                <section className="rounded-2xl border border-gold-light/50 bg-white p-4 lg:col-span-2">
                  <h3 className="mb-3 text-base font-semibold text-ink">Recent activity</h3>
                  <RecordsTable records={periodRecords.slice(0, 8)} empty="No merits or demerits in this period. Use + Log Merit / Demerit to add one." />
                </section>
                <section className="rounded-2xl border border-gold-light/50 bg-white p-4">
                  <h3 className="mb-3 text-base font-semibold text-ink">Top merit earners</h3>
                  {top.length === 0 ? (
                    <p className="text-sm text-ink/65">No merits yet this period.</p>
                  ) : (
                    <ol className="space-y-2 text-sm">
                      {top.map((t, i) => (
                        <li key={`${t.name}-${i}`} className="flex justify-between gap-2">
                          <span className="truncate text-ink">
                            {i + 1}. {t.name}
                          </span>
                          <span className="font-semibold text-green-700">+{t.pts}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </div>
            </div>
          )}

          {sub === "overview" && tab === "incidents" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <StatTile label={`Incidents · ${PERIOD_LABEL[period].toLowerCase()}`} value={String(stats.incidents)} />
                <StatTile label="Follow-ups outstanding" value={String(stats.detentionsOutstanding)} />
              </div>
              <section className="rounded-2xl border border-gold-light/50 bg-white p-4">
                <h3 className="mb-3 text-base font-semibold text-ink">Latest incidents</h3>
                <RecordsTable
                  records={filtered.filter((r) => !r.voided_at && inRange(r.occurred_on, range.start, range.end)).slice(0, 10)}
                  onVoid={voidRecord}
                  empty="No incidents in this period. Safeguarding concerns are raised separately with Raise a concern."
                />
              </section>
            </div>
          )}

          {sub === "all" && (
            <section className="rounded-2xl border border-gold-light/50 bg-white p-4">
              <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Search student…" aria-label="Student" className="rounded-lg border border-gold-light px-3 py-2 text-sm" />
                <select value={fClass} onChange={(e) => setFClass(e.target.value)} aria-label="Class" className="rounded-lg border border-gold-light px-3 py-2 text-sm">
                  <option value="">All classes</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select value={fYear} onChange={(e) => setFYear(e.target.value)} aria-label="Year group" className="rounded-lg border border-gold-light px-3 py-2 text-sm">
                  <option value="">All year groups</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
                <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} aria-label="From date" className="rounded-lg border border-gold-light px-3 py-2 text-sm" />
                <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} aria-label="To date" className="rounded-lg border border-gold-light px-3 py-2 text-sm" />
              </div>
              <RecordsTable records={filtered} onVoid={voidRecord} csvName="behaviour-records" empty="No records match these filters." />
              {filtered.length > 300 && <p className="mt-2 text-xs text-ink/65">Showing the latest 300 of {filtered.length}. Narrow the filters to see more.</p>}
            </section>
          )}
        </>
      )}

      {modal && (
        <LogModal
          students={students}
          initialKind={modal}
          allowIncident
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

export default function AdminBehaviourPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <BehaviourContent />
      </LearnGate>
    </section>
  );
}
