"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Loading } from "@/components/learn/kit";
import { Select } from "@/components/learn/Select";
import { Tabs } from "@/components/learn/Tabs";
import { EmptyState, Status, type StatusKind } from "@/components/learn/ui";
import { Panel } from "@/components/learn/templates/parts";
import { surahName } from "@/lib/learn/surahs";
import { localDateKey } from "@/lib/learn/calendar";

// A pupil's Summary and Chronology (owner feedback 3, 11 Nov 2026: a summary with an academic-year switch,
// figures compared with the year, and trends; a chronology of everything that happened). TGA's own
// structure: one sentence-led strip of figures on hairlines, a trend below it, and a single dated timeline.

type Year = { id: string; label: string; starts_on: string; ends_on: string };
type Term = { id: string; academic_year_id: string; name: string; starts_on: string; ends_on: string };
type Att = { child_id: string; status: string; lesson_instances: { date: string } | null };
type Bh = { child_id: string; kind: "merit" | "demerit" | "incident"; points: number; occurred_on: string };

const DAY = 86_400_000;
const today = () => localDateKey(new Date());
const daysAgo = (n: number) => localDateKey(new Date(Date.now() - n * DAY));
const fmt = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const isPresent = (s: string) => s === "present" || s === "late" || s === "not_engaged";
const counts = (s: string) => s !== "technical";

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>, cap = 20000): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < cap; i += 1000) {
    const { data, error } = await build(i, i + 999);
    if (error) break;
    const page = (data as T[]) || [];
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

/** Monday of the week a date falls in, as a date key. */
function weekOf(key: string): string {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDateKey(d);
}

/**
 * The pupil at a glance for a chosen academic year and period: attendance, merits, sanctions and the
 * behaviour balance, each beside the average for the pupils in the same year group that you can see,
 * then the week-by-week (or month-by-month) trend.
 */
export function PupilSummary({ childId, yearGroupId, yearGroup, scopeNote }: { childId: string; yearGroupId: string | null; yearGroup: string | null; /** Says whose average it is (teachers see only their own pupils). */ scopeNote: string }) {
  const [years, setYears] = useState<Year[] | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [yearId, setYearId] = useState("");
  const [period, setPeriod] = useState("year");
  const [att, setAtt] = useState<Att[] | null>(null);
  const [bh, setBh] = useState<Bh[]>([]);
  const [peers, setPeers] = useState<string[]>([]);
  const [trend, setTrend] = useState<"attendance" | "behaviour">("attendance");
  const [by, setBy] = useState<"week" | "month">("week");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const [y, t] = await Promise.all([
        supabase.from("academic_years").select("id, label, starts_on, ends_on").eq("is_test", false).order("starts_on", { ascending: false }),
        supabase.from("terms").select("id, academic_year_id, name, starts_on, ends_on").order("starts_on"),
      ]);
      if (!alive) return;
      const list = (y.data as Year[] | null) || [];
      setYears(list);
      setTerms((t.data as Term[] | null) || []);
      const now = today();
      setYearId((list.find((x) => x.starts_on <= now && now <= x.ends_on) || list[0])?.id || "");
    })();
    return () => {
      alive = false;
    };
  }, []);

  // The dates the figures cover: the chosen year or term (never past today), or the last 90 days when the
  // school has no academic years set up yet.
  const range = useMemo(() => {
    const now = today();
    const y = years?.find((x) => x.id === yearId);
    if (!y) return { from: daysAgo(89), to: now, label: "the last 90 days" };
    const t = terms.find((x) => x.id === period);
    const from = t ? t.starts_on : y.starts_on;
    const end = t ? t.ends_on : y.ends_on;
    return { from, to: end < now ? end : now, label: t ? `${t.name} ${y.label}` : y.label };
  }, [years, terms, yearId, period]);

  useEffect(() => {
    if (years === null) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const kids = yearGroupId ? await supabase.from("children").select("id").eq("year_group_id", yearGroupId).limit(1000) : { data: [] };
      const ids = [...new Set([childId, ...(((kids.data as { id: string }[] | null) || []).map((k) => k.id))])];
      const [a, b] = await Promise.all([
        fetchAll<Att>((f, t) =>
          supabase.from("attendance_records").select("child_id, status, lesson_instances!inner(date)").in("child_id", ids).gte("lesson_instances.date", range.from).lte("lesson_instances.date", range.to).order("id").range(f, t),
        ),
        fetchAll<Bh>((f, t) => supabase.from("behaviour_records").select("child_id, kind, points, occurred_on").in("child_id", ids).is("voided_at", null).gte("occurred_on", range.from).lte("occurred_on", range.to).order("id").range(f, t)),
      ]);
      if (!alive) return;
      setPeers(ids);
      setAtt(a);
      setBh(b);
    })();
    return () => {
      alive = false;
    };
  }, [childId, yearGroupId, years, range.from, range.to]);

  const fig = useMemo(() => {
    const per = new Map<string, { seen: number; there: number; merits: number; sanctions: number; balance: number }>();
    const get = (id: string) => per.get(id) || (per.set(id, { seen: 0, there: 0, merits: 0, sanctions: 0, balance: 0 }), per.get(id)!);
    for (const id of peers) get(id);
    for (const r of att || []) {
      if (!counts(r.status)) continue;
      const x = get(r.child_id);
      x.seen++;
      if (isPresent(r.status)) x.there++;
    }
    for (const r of bh) {
      const x = get(r.child_id);
      if (r.kind === "merit") x.merits++;
      else x.sanctions++;
      x.balance += r.points;
    }
    const me = get(childId);
    const others = [...per.entries()].filter(([id]) => id !== childId).map(([, v]) => v);
    const withLessons = others.filter((o) => o.seen > 0);
    const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
    return {
      rate: me.seen ? (me.there / me.seen) * 100 : null,
      rateAvg: mean(withLessons.map((o) => (o.there / o.seen) * 100)),
      merits: me.merits,
      meritsAvg: mean(others.map((o) => o.merits)),
      sanctions: me.sanctions,
      sanctionsAvg: mean(others.map((o) => o.sanctions)),
      balance: me.balance,
      balanceAvg: mean(others.map((o) => o.balance)),
      peers: others.length,
    };
  }, [att, bh, peers, childId]);

  const series = useMemo(() => {
    const key = (k: string) => (by === "week" ? weekOf(k) : k.slice(0, 7));
    const m = new Map<string, { seen: number; there: number; merits: number; sanctions: number }>();
    const get = (k: string) => m.get(k) || (m.set(k, { seen: 0, there: 0, merits: 0, sanctions: 0 }), m.get(k)!);
    for (const r of att || []) if (r.child_id === childId && r.lesson_instances && counts(r.status)) {
      const x = get(key(r.lesson_instances.date));
      x.seen++;
      if (isPresent(r.status)) x.there++;
    }
    for (const r of bh) if (r.child_id === childId) {
      const x = get(key(r.occurred_on));
      if (r.kind === "merit") x.merits++;
      else x.sanctions++;
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(by === "week" ? -16 : -12);
  }, [att, bh, childId, by]);

  if (years === null || att === null) return <Loading label="Loading the summary" bare />;
  const yearTerms = terms.filter((t) => t.academic_year_id === yearId);
  const n1 = (v: number | null) => (v === null ? "no data" : Math.round(v * 10) / 10);
  const cmp = (v: number | null, avg: number | null, unit = "") => {
    if (v === null || avg === null || fig.peers === 0) return null;
    const d = Math.round((v - avg) * 10) / 10;
    return `${d === 0 ? "level with" : `${Math.abs(d)}${unit} ${d > 0 ? "above" : "below"}`} the ${yearGroup || "year"} average (${n1(avg)}${unit})`;
  };
  const figures: { label: string; value: string; note: string | null; warn?: boolean }[] = [
    { label: "Attendance", value: fig.rate === null ? "No lessons yet" : `${Math.round(fig.rate * 10) / 10}%`, note: cmp(fig.rate, fig.rateAvg, "%"), warn: fig.rate !== null && fig.rate < 90 },
    { label: "Merits", value: String(fig.merits), note: cmp(fig.merits, fig.meritsAvg) },
    { label: "Sanctions", value: String(fig.sanctions), note: cmp(fig.sanctions, fig.sanctionsAvg), warn: fig.sanctionsAvg !== null && fig.sanctions > fig.sanctionsAvg + 2 },
    { label: "Behaviour points", value: `${fig.balance > 0 ? "+" : ""}${fig.balance}`, note: cmp(fig.balance, fig.balanceAvg), warn: fig.balance < 0 },
  ];
  const max = Math.max(1, ...series.map(([, v]) => (trend === "attendance" ? 100 : Math.max(v.merits, v.sanctions))));

  return (
    <div className="space-y-5" data-guide="pupil-summary">
      <div className="flex flex-wrap items-end gap-3">
        {years.length > 0 && (
          <>
            <label className="text-sm">
              <span className="t-eyebrow mb-1 block">Academic year</span>
              <Select value={yearId} onChange={(e) => { setYearId(e.target.value); setPeriod("year"); }} aria-label="Academic year">
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm">
              <span className="t-eyebrow mb-1 block">Figures for</span>
              <Select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Figures for">
                <option value="year">The whole year</option>
                {yearTerms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </label>
          </>
        )}
        <p className="t-meta pb-2">
          {fmt(range.from)} to {fmt(range.to)}. {scopeNote}
        </p>
      </div>

      <dl className="grid grid-cols-2 border-y border-gold-light lg:grid-cols-4">
        {figures.map((f, i) => (
          <div key={f.label} className={`px-4 py-4 ${i % 2 === 1 ? "border-l border-gold-light" : ""} ${i >= 2 ? "border-t border-gold-light lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}>
            <dt className="t-eyebrow">{f.label}</dt>
            <dd className={`mt-1 text-2xl font-semibold tabular-nums ${f.warn ? "text-amber-800" : "text-ink"}`}>{f.value}</dd>
            {f.note && <dd className="t-meta mt-0.5">{f.note}</dd>}
          </div>
        ))}
      </dl>

      <Panel
        title="How it has gone"
        description={trend === "attendance" ? "Attendance each period, out of the lessons they had." : "Merits above the line, sanctions below it."}
        actions={
          <div className="flex flex-wrap gap-2">
            <Tabs variant="switch" label="Trend" value={trend} onChange={setTrend} items={[{ key: "attendance" as const, label: "Attendance" }, { key: "behaviour" as const, label: "Behaviour" }]} />
            <Tabs variant="switch" label="Grouped by" value={by} onChange={setBy} items={[{ key: "week" as const, label: "By week" }, { key: "month" as const, label: "By month" }]} />
          </div>
        }
      >
        {series.length === 0 ? (
          <EmptyState title="Nothing recorded in this period yet." />
        ) : (
          <div role="img" aria-label={`${trend === "attendance" ? "Attendance" : "Merits and sanctions"} ${by === "week" ? "week by week" : "month by month"}: ${series.map(([k, v]) => `${k}: ${trend === "attendance" ? (v.seen ? `${Math.round((v.there / v.seen) * 100)}%` : "no lessons") : `${v.merits} merits, ${v.sanctions} sanctions`}`).join("; ")}`}>
            <div className="flex h-40 items-stretch gap-1.5">
              {series.map(([k, v]) => {
                const label = by === "week" ? new Date(`${k}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : new Date(`${k}-15T12:00:00`).toLocaleDateString("en-GB", { month: "short" });
                if (trend === "attendance") {
                  const pct = v.seen ? (v.there / v.seen) * 100 : null;
                  return (
                    <div key={k} className="flex min-w-0 flex-1 flex-col items-center justify-end" title={`${label}: ${pct === null ? "no lessons" : `${Math.round(pct)}%`}`}>
                      <div className={`w-full max-w-7 rounded-t-[3px] ${pct !== null && pct < 90 ? "bg-amber-600/70" : "bg-forest-500"}`} style={{ height: `${pct === null ? 0 : Math.max(2, (pct / max) * 100)}%` }} />
                    </div>
                  );
                }
                return (
                  <div key={k} className="flex min-w-0 flex-1 flex-col" title={`${label}: ${v.merits} merits, ${v.sanctions} sanctions`}>
                    <div className="flex flex-1 flex-col justify-end border-b border-gold-light">
                      <div className="rounded-t-[3px] bg-forest-500" style={{ height: `${(v.merits / max) * 100}%` }} />
                    </div>
                    <div className="flex flex-1 flex-col">
                      <div className="rounded-b-[3px] bg-amber-600/70" style={{ height: `${(v.sanctions / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex gap-1.5" aria-hidden="true">
              {series.map(([k]) => (
                <span key={k} className="t-meta min-w-0 flex-1 truncate text-center text-[11px]">
                  {by === "week" ? new Date(`${k}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : new Date(`${k}-15T12:00:00`).toLocaleDateString("en-GB", { month: "short" })}
                </span>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ── Chronology ─────────────────────────────────────────────────────────

type Kind = "attendance" | "behaviour" | "work" | "quran" | "reports";
type Event = { key: string; date: string; kind: Kind; title: string; detail?: string; status?: { kind: StatusKind; label: string } };
const KIND_LABEL: Record<Kind, string> = { attendance: "Attendance", behaviour: "Behaviour", work: "Classwork and grades", quran: "Qur'an", reports: "Reports" };

/**
 * Everything that has happened for the pupil, newest first and grouped by month: absences and lateness,
 * merits and sanctions, missing or late classwork and results, Qur'an recitations and issued reports.
 * Each part is read through the same permissions as its own page.
 */
export function PupilChronology({ childId }: { childId: string }) {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [only, setOnly] = useState<"all" | Kind>("all");
  const [days, setDays] = useState<90 | 365>(90);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const from = daysAgo(days);
      const [a, b, h, g, q, r] = await Promise.all([
        supabase.from("attendance_records").select("id, status, lesson_instances!inner(date, timetable_slots(classes(name)))").eq("child_id", childId).in("status", ["absent", "late", "excused", "not_engaged"]).gte("lesson_instances.date", from).limit(1000),
        supabase.from("behaviour_records").select("id, kind, points, category, note, occurred_on, classes(name)").eq("child_id", childId).is("voided_at", null).gte("occurred_on", from).limit(1000),
        supabase.from("homework_status").select("homework_id, due_at, status").eq("child_id", childId).in("status", ["late", "missing"]).gte("due_at", `${from}T00:00:00`).limit(500),
        supabase.from("assessments").select("id, title, date, percent, grade_label, classes(name)").eq("child_id", childId).gte("date", from).limit(500),
        supabase.from("quran_progress").select("id, surah_from, ayah_from, ayah_to, score, session_date").eq("child_id", childId).eq("milestone_type", "quran_memorisation").gte("session_date", from).limit(500),
        supabase.from("term_report_versions").select("id, released_at, terms(name)").eq("child_id", childId).gte("released_at", `${from}T00:00:00`).limit(50),
      ]);
      const hw = (h.data as { homework_id: string; due_at: string; status: string }[] | null) || [];
      const titles = hw.length ? await supabase.from("homework").select("id, title, classes(name)").in("id", [...new Set(hw.map((x) => x.homework_id))]) : { data: [] };
      if (!alive) return;
      const tBy = new Map(((titles.data as { id: string; title: string; classes: { name: string } | null }[] | null) || []).map((t) => [t.id, t]));
      const out: Event[] = [];
      const ST: Record<string, { kind: StatusKind; label: string }> = { absent: { kind: "overdue", label: "Absent" }, late: { kind: "attention", label: "Late" }, excused: { kind: "pending", label: "Authorised absence" }, not_engaged: { kind: "attention", label: "Present, not engaged" } };
      for (const x of (a.data as unknown as { id: string; status: string; lesson_instances: { date: string; timetable_slots: { classes: { name: string } | null } | null } | null }[]) || [])
        if (x.lesson_instances) out.push({ key: `a${x.id}`, date: x.lesson_instances.date, kind: "attendance", title: x.lesson_instances.timetable_slots?.classes?.name || "A lesson", status: ST[x.status] });
      for (const x of (b.data as unknown as { id: string; kind: string; points: number; category: string; note: string | null; occurred_on: string; classes: { name: string } | null }[]) || [])
        out.push({ key: `b${x.id}`, date: x.occurred_on, kind: "behaviour", title: `${x.kind === "merit" ? "Merit" : x.kind === "demerit" ? "Sanction" : "Incident"}: ${x.category}`, detail: [x.classes?.name, x.points ? `${x.points > 0 ? "+" : ""}${x.points} points` : null, x.note].filter(Boolean).join(" · "), status: x.kind === "merit" ? { kind: "completed", label: "Merit" } : { kind: "attention", label: x.kind === "demerit" ? "Sanction" : "Incident" } });
      for (const x of hw) {
        const t = tBy.get(x.homework_id);
        out.push({ key: `h${x.homework_id}`, date: x.due_at.slice(0, 10), kind: "work", title: t?.title || "Classwork", detail: t?.classes?.name || undefined, status: x.status === "missing" ? { kind: "overdue", label: "Missing" } : { kind: "attention", label: "Handed in late" } });
      }
      for (const x of (g.data as unknown as { id: string; title: string; date: string; percent: number | null; grade_label: string | null; classes: { name: string } | null }[]) || [])
        out.push({ key: `g${x.id}`, date: x.date, kind: "work", title: `Result: ${x.title}`, detail: [x.classes?.name, x.grade_label, x.percent !== null ? `${Math.round(x.percent)}%` : null].filter(Boolean).join(" · ") });
      for (const x of (q.data as { id: string; surah_from: number | null; ayah_from: number | null; ayah_to: number | null; score: number | null; session_date: string }[] | null) || [])
        out.push({ key: `q${x.id}`, date: x.session_date, kind: "quran", title: `Recited ${surahName(x.surah_from || 1)}${x.ayah_from ? ` ${x.ayah_from} to ${x.ayah_to}` : ""}`, detail: x.score !== null ? `${x.score} out of 10` : undefined });
      for (const x of (r.data as unknown as { id: string; released_at: string | null; terms: { name: string } | null }[]) || [])
        if (x.released_at) out.push({ key: `r${x.id}`, date: x.released_at.slice(0, 10), kind: "reports", title: `Term report issued${x.terms?.name ? `: ${x.terms.name}` : ""}` });
      out.sort((p, n) => n.date.localeCompare(p.date) || p.kind.localeCompare(n.kind));
      setEvents(out);
    })();
    return () => {
      alive = false;
    };
  }, [childId, days]);

  if (events === null) return <Loading label="Loading the chronology" bare />;
  const shown = events.filter((e) => only === "all" || e.kind === only);
  const months = new Map<string, Event[]>();
  for (const e of shown) {
    const m = e.date.slice(0, 7);
    months.set(m, [...(months.get(m) || []), e]);
  }
  const count = (k: Kind) => events.filter((e) => e.kind === k).length;

  return (
    <div className="space-y-4" data-guide="pupil-chronology">
      <div className="flex flex-wrap items-center gap-2">
        <div className="overflow-x-auto">
          <Tabs
            variant="switch"
            label="Show"
            value={only}
            onChange={setOnly}
            items={[{ key: "all" as const, label: "Everything", count: events.length }, ...(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ key: k, label: KIND_LABEL[k], count: count(k) }))]}
          />
        </div>
        <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value) as 90 | 365)} aria-label="How far back" className="w-44">
          <option value="90">Last 90 days</option>
          <option value="365">Last 12 months</option>
        </Select>
      </div>
      {shown.length === 0 ? (
        <EmptyState title="Nothing to show in this period." />
      ) : (
        [...months.entries()].map(([m, list]) => (
          <section key={m} aria-label={new Date(`${m}-15T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}>
            <h3 className="t-eyebrow mb-1 border-b border-gold-light pb-1">{new Date(`${m}-15T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h3>
            <ol>
              {list.map((e) => (
                <li key={e.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-gold-light/50 py-2 text-sm">
                  <span className="t-meta tabular-nums">{new Date(`${e.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}</span>
                  <span className="min-w-0">
                    <span className="block text-ink">{e.title}</span>
                    <span className="t-meta block">{[KIND_LABEL[e.kind], e.detail].filter(Boolean).join(" · ")}</span>
                  </span>
                  {e.status ? <Status kind={e.status.kind}>{e.status.label}</Status> : <span />}
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}
