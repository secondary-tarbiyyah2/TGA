"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchAllClasses, fetchTeacherClasses, type ClassSummary } from "@/lib/learn/classes";
import { loadStudents, type StudentOption } from "@/components/learn/behaviour/data";
import { PageHeader } from "@/components/learn/PageHeader";
import { SectionLayout, SectionNav, type SectionItem } from "@/components/learn/SectionNav";
import { Tabs } from "@/components/learn/Tabs";
import { Select } from "@/components/learn/Select";
import { Loading, SidePanel, askConfirm } from "@/components/learn/kit";
import { Button, EmptyState, Notice, Status, ui } from "@/components/learn/ui";
import { Panel } from "@/components/learn/templates/parts";
import { PupilLink } from "@/components/learn/pupil/PupilLink";
import { saveCsv, toCsv } from "@/lib/learn/csv";
import { localDateKey } from "@/lib/learn/calendar";
import { BatchAward } from "./BatchAward";
import { StarManager } from "./StarManager";

// House points (owner feedback 11 Nov 2026, item 21: "house points system should be well"). One page with its
// parts down the left: the standings and awarding, a leaderboard of houses and pupils, the full history (who gave
// what, when and why, including anything taken back), Star of the Week, and for the head teacher the limits and
// the houses. House points are merits (behaviour_records), counted for each pupil's house by house_standings();
// the limits are enforced by the database (0217).

type Sec = "award" | "leaderboard" | "history" | "stars" | "settings";
type Period = "7" | "30" | "0";
type Standing = { house_id: string; name: string; colour: string; merit_points: number; bonus_points: number; total_points: number; member_count: number; is_mine: boolean; rank: number };
type Award = { id: string; child_id: string; class_id: string | null; points: number; category: string; note: string | null; occurred_on: string; created_at: string; voided_at: string | null; recorded_by: string; children: { name: string } | null; classes: { name: string } | null };
type Limits = { max_per_award: number; daily_cap_per_pupil: number };

const PERIODS: { key: Period; label: string }[] = [
  { key: "7", label: "This week" },
  { key: "30", label: "Last 30 days" },
  { key: "0", label: "All time" },
];
const fmt = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const daysAgo = (n: number) => localDateKey(new Date(Date.now() - n * 86_400_000));

function useStandings(days: Period, tick: number) {
  const [rows, setRows] = useState<Standing[] | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    supabase.rpc("house_standings", { p_days: Number(days) || null }).then(({ data }) => {
      if (alive) setRows(((data as Standing[] | null) || []).slice().sort((a, b) => a.rank - b.rank));
    });
    return () => {
      alive = false;
    };
  }, [days, tick]);
  return rows;
}

/** Which house each pupil is in (the pupils the viewer may see). */
function useHouseOf(tick: number) {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    supabase
      .from("house_members")
      .select("child_id, house_id")
      .limit(5000)
      .then(({ data }) => {
        if (alive) setMap(Object.fromEntries(((data as { child_id: string; house_id: string }[] | null) || []).map((r) => [r.child_id, r.house_id])));
      });
    return () => {
      alive = false;
    };
  }, [tick]);
  return map;
}

function HouseDot({ colour }: { colour?: string | null }) {
  return <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-ink/10" style={{ background: colour || "transparent" }} />;
}

/** The houses on one ruled line: place, colour, name and points. */
function Standings({ rows }: { rows: Standing[] | null }) {
  if (rows === null) return <Loading label="Loading the houses" bare />;
  if (rows.length === 0) return <EmptyState title="No houses yet.">The head teacher adds houses under Settings.</EmptyState>;
  const top = Math.max(1, ...rows.map((r) => r.total_points));
  return (
    <ol className="divide-y divide-gold-light/70 border-y border-gold-light" data-guide="house-standings">
      {rows.map((r) => (
        <li key={r.house_id} className="grid grid-cols-[2rem_minmax(0,1fr)_5rem] items-center gap-3 px-1 py-2.5 sm:grid-cols-[2rem_12rem_minmax(0,1fr)_5rem]">
          <span className="t-meta tabular-nums">{r.rank}.</span>
          <span className="flex min-w-0 items-center gap-2 font-medium text-ink">
            <HouseDot colour={r.colour} />
            <span className="truncate">{r.name}</span>
            {r.is_mine && <span className="t-meta">yours</span>}
          </span>
          <span className="hidden h-1.5 rounded-full bg-gold-light/50 sm:block" aria-hidden="true">
            <span className="block h-1.5 rounded-full bg-forest-500" style={{ width: `${(r.total_points / top) * 100}%` }} />
          </span>
          <span className="text-right font-semibold tabular-nums text-ink">{r.total_points}</span>
        </li>
      ))}
    </ol>
  );
}

export function HousePoints({ isHead, housesAdmin }: { isHead: boolean; housesAdmin?: React.ReactNode }) {
  const [sec, setSec] = useState<Sec>("award");
  const [period, setPeriod] = useState<Period>("7");
  const [tick, setTick] = useState(0);
  const changed = useCallback(() => setTick((t) => t + 1), []);
  const standings = useStandings(period, tick);
  const houseOf = useHouseOf(tick);
  const [me, setMe] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [awardOpen, setAwardOpen] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    supabase.auth.getUser().then(({ data }) => alive && setMe(data.user?.id || null));
    (isHead ? fetchAllClasses() : fetchTeacherClasses()).then((c) => alive && setClasses(c));
    supabase
      .from("house_point_settings")
      .select("max_per_award, daily_cap_per_pupil")
      .maybeSingle()
      .then(({ data }) => alive && setLimits((data as Limits | null) || null));
    return () => {
      alive = false;
    };
  }, [isHead, tick]);

  const houseById = useMemo(() => new Map((standings || []).map((s) => [s.house_id, s])), [standings]);
  const items: SectionItem<Sec>[] = [
    { key: "award", label: "Standings and award" },
    { key: "leaderboard", label: "Leaderboard" },
    { key: "history", label: "History" },
    { key: "stars", label: "Star of the week" },
    ...(isHead ? [{ key: "settings" as Sec, label: "Limits and houses" }] : []),
  ];

  return (
    <>
      <PageHeader
        title="House points"
        subtitle="Award points with a reason, see how the houses stand, and every award there has been."
        action={
          <Button variant="primary" icon="plus" onClick={() => setAwardOpen(true)} data-guide="house-award">
            Award points
          </Button>
        }
      />
      <SectionLayout nav={<SectionNav items={items} value={sec} onChange={setSec} label="House points sections" guide="house-sections" id="house-section" />}>
        {(sec === "award" || sec === "leaderboard") && (
          <div className="mb-4">
            <Tabs variant="switch" label="Period" value={period} onChange={setPeriod} items={PERIODS} />
          </div>
        )}
        {sec === "award" && (
          <div className="space-y-6">
            <Standings rows={standings} />
            {limits && (
              <p className="t-meta">
                One award can give up to {limits.max_per_award} points, and each member of staff up to {limits.daily_cap_per_pupil} points a pupil a day{isHead ? " (the head teacher is not limited)" : ""}.
              </p>
            )}
            <RecentAwards me={me} isHead={isHead} mineOnly houseOf={houseOf} houseById={houseById} tick={tick} onChanged={changed} />
          </div>
        )}
        {sec === "leaderboard" && (
          <div className="space-y-6">
            <Standings rows={standings} />
            <TopPupils period={period} houseOf={houseOf} houseById={houseById} tick={tick} />
          </div>
        )}
        {sec === "history" && <RecentAwards me={me} isHead={isHead} houseOf={houseOf} houseById={houseById} tick={tick} onChanged={changed} />}
        {sec === "stars" && <StarManager isHead={isHead} />}
        {sec === "settings" && isHead && (
          <div className="space-y-6">
            <LimitsForm limits={limits} onSaved={changed} />
            {housesAdmin}
          </div>
        )}
      </SectionLayout>
      {awardOpen && <AwardPanel classes={classes} onClose={() => setAwardOpen(false)} onAwarded={changed} />}
    </>
  );
}

/** Awarding in a panel over the page: choose the class, then pupils, a reason and points (the existing award form). */
function AwardPanel({ classes, onClose, onAwarded }: { classes: ClassSummary[] | null; onClose: () => void; onAwarded: () => void }) {
  const [classId, setClassId] = useState("");
  const [roster, setRoster] = useState<StudentOption[] | null>(null);
  const cls = classId || classes?.[0]?.id || "";
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !cls) return;
    let alive = true;
    loadStudents(supabase, [cls]).then((s) => alive && setRoster(s));
    return () => {
      alive = false;
    };
  }, [cls]);
  return (
    <SidePanel title="Award house points" eyebrow="House points" onClose={onClose} size="lg">
      {classes === null ? (
        <Loading label="Loading classes" bare />
      ) : classes.length === 0 ? (
        <EmptyState title="You have no classes to award points to." />
      ) : (
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="t-eyebrow mb-1 block">Class</span>
            <Select value={cls} onChange={(e) => setClassId(e.target.value)} aria-label="Class">
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          {roster === null ? <Loading label="Loading pupils" bare /> : <BatchAward classId={cls} roster={roster} onAwarded={onAwarded} />}
        </div>
      )}
    </SidePanel>
  );
}

/** Awards newest first. `mineOnly`: just today's and this week's from you, with Take back. `full`: the whole history with filters and a download. */
function RecentAwards({ me, isHead, mineOnly, houseOf, houseById, tick, onChanged }: { me: string | null; isHead: boolean; mineOnly?: boolean; houseOf: Record<string, string>; houseById: Map<string, Standing>; tick: number; onChanged: () => void }) {
  const [rows, setRows] = useState<Award[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [days, setDays] = useState(30);
  const [house, setHouse] = useState("");
  const [cat, setCat] = useState("");
  const [who, setWho] = useState("");
  const [showVoided, setShowVoided] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || (mineOnly && !me)) return;
    let alive = true;
    (async () => {
      let q = supabase
        .from("behaviour_records")
        .select("id, child_id, class_id, points, category, note, occurred_on, created_at, voided_at, recorded_by, children(name), classes(name)")
        .eq("kind", "merit")
        .gte("occurred_on", daysAgo(mineOnly ? 6 : days))
        .order("created_at", { ascending: false })
        .limit(mineOnly ? 50 : 2000);
      if (mineOnly && me) q = q.eq("recorded_by", me);
      const { data } = await q;
      const list = (data as unknown as Award[] | null) || [];
      const staff = [...new Set(list.map((r) => r.recorded_by))];
      const p = staff.length ? await supabase.from("profiles").select("id, full_name").in("id", staff) : { data: [] };
      if (!alive) return;
      setNames(Object.fromEntries(((p.data as { id: string; full_name: string | null }[] | null) || []).map((x) => [x.id, x.full_name || "Staff"])));
      setRows(list);
    })();
    return () => {
      alive = false;
    };
  }, [me, mineOnly, days, tick]);

  if (rows === null) return <Loading label="Loading awards" bare />;
  const today = localDateKey(new Date());
  const shown = rows.filter((r) => (showVoided || !r.voided_at) && (!house || houseOf[r.child_id] === house) && (!cat || r.category === cat) && (!who || r.recorded_by === who));
  const total = shown.filter((r) => !r.voided_at).reduce((s, r) => s + r.points, 0);
  const cats = [...new Set(rows.map((r) => r.category))].sort();
  const staff = [...new Set(rows.map((r) => r.recorded_by))];

  const takeBack = async (r: Award) => {
    if (!(await askConfirm(`Take back ${r.points} point${r.points === 1 ? "" : "s"} from ${r.children?.name || "this pupil"}? It stays in the history as taken back.`, { confirmLabel: "Take back" }))) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.from("behaviour_records").update({ voided_at: new Date().toISOString() }).eq("id", r.id);
    setErr(error ? "Couldn't take that back. Please try again." : null);
    onChanged();
  };

  const download = () =>
    saveCsv(
      "house-points.csv",
      toCsv(
        ["Date", "Pupil", "House", "Class", "Reason", "Points", "Note", "Given by", "Taken back"],
        shown.map((r) => [r.occurred_on, r.children?.name || "", houseById.get(houseOf[r.child_id])?.name || "", r.classes?.name || "", r.category, r.points, r.note || "", names[r.recorded_by] || "Staff", r.voided_at ? r.voided_at.slice(0, 10) : ""]),
      ),
    );

  const list = (
    <>
      {err && <Notice tone="bad">{err}</Notice>}
      {shown.length === 0 ? (
        <EmptyState title={mineOnly ? "You haven't awarded any points this week." : "No awards match."} />
      ) : (
        <ul className="divide-y divide-gold-light/60" data-guide="house-history">
          {shown.map((r) => {
            const h = houseById.get(houseOf[r.child_id]);
            const canTakeBack = !r.voided_at && (isHead || (r.recorded_by === me && r.occurred_on === today));
            return (
              <li key={r.id} className={`grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 px-4 py-2.5 text-sm ${r.voided_at ? "opacity-60" : ""}`}>
                <span className="t-meta">{fmt(r.occurred_on)}</span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2">
                    <PupilLink id={r.child_id} name={r.children?.name || "Pupil"} className="font-medium text-ink" />
                    {h && (
                      <span className="t-meta inline-flex items-center gap-1">
                        <HouseDot colour={h.colour} />
                        {h.name}
                      </span>
                    )}
                  </span>
                  <span className="t-meta block">
                    {[r.category, r.classes?.name, r.note, !mineOnly ? `by ${names[r.recorded_by] || "Staff"}` : null].filter(Boolean).join(" · ")}
                    {r.voided_at ? ` · taken back ${r.voided_at.slice(0, 10)}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className={`font-semibold tabular-nums ${r.voided_at ? "line-through" : "text-ink"}`}>+{r.points}</span>
                  {canTakeBack && (
                    <button type="button" onClick={() => void takeBack(r)} className="text-xs font-medium text-forest-700 hover:underline">
                      Take back
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  if (mineOnly) {
    return (
      <Panel title="Your awards this week" description="You can take back an award on the day you gave it." flush>
        {list}
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period" className={`${ui.select} w-full sm:w-40`}>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="120">Last 4 months</option>
          <option value="365">Last 12 months</option>
        </Select>
        <Select value={house} onChange={(e) => setHouse(e.target.value)} aria-label="House" className={`${ui.select} w-full sm:w-40`}>
          <option value="">Every house</option>
          {[...houseById.values()].map((h) => (
            <option key={h.house_id} value={h.house_id}>
              {h.name}
            </option>
          ))}
        </Select>
        <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Reason" className={`${ui.select} w-full sm:w-44`}>
          <option value="">Every reason</option>
          {cats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        {staff.length > 1 && (
          <Select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Given by" className={`${ui.select} w-full sm:w-44`}>
            <option value="">Everyone who gave points</option>
            {staff.map((s) => (
              <option key={s} value={s}>
                {names[s] || "Staff"}
              </option>
            ))}
          </Select>
        )}
        <label className="inline-flex items-center gap-2 text-sm text-ink/80">
          <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} className="h-4 w-4 accent-forest-700" />
          Show taken back
        </label>
        <Button size="sm" icon="download" className="ml-auto" onClick={download} disabled={shown.length === 0}>
          Download CSV
        </Button>
      </div>
      <p className="t-meta">
        {shown.length} award{shown.length === 1 ? "" : "s"}, {total} point{total === 1 ? "" : "s"}. {isHead ? "Every award and every one taken back is also in the audit log." : "You see awards for the pupils you teach."}
      </p>
      <div className="rounded-[10px] border border-gold-light bg-white">{list}</div>
    </div>
  );
}

/** The pupils with the most points in the period (the pupils the viewer may see), with their house. */
function TopPupils({ period, houseOf, houseById, tick }: { period: Period; houseOf: Record<string, string>; houseById: Map<string, Standing>; tick: number }) {
  const [rows, setRows] = useState<{ id: string; name: string; points: number }[] | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    let q = supabase.from("behaviour_records").select("child_id, points, children(name)").eq("kind", "merit").is("voided_at", null).limit(5000);
    if (period !== "0") q = q.gte("occurred_on", daysAgo(Number(period)));
    q.then(({ data }) => {
      if (!alive) return;
      const m = new Map<string, { id: string; name: string; points: number }>();
      for (const r of (data as unknown as { child_id: string; points: number; children: { name: string } | null }[] | null) || []) {
        const x = m.get(r.child_id) || { id: r.child_id, name: r.children?.name || "Pupil", points: 0 };
        x.points += r.points;
        m.set(r.child_id, x);
      }
      setRows([...m.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)).slice(0, 10));
    });
    return () => {
      alive = false;
    };
  }, [period, tick]);
  return (
    <Panel title="Top pupils" description="The most points in this period, among the pupils you can see." flush guide="house-top-pupils">
      {rows === null ? (
        <Loading label="Loading" bare />
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No points in this period yet." />
        </div>
      ) : (
        <ol className="divide-y divide-gold-light/60">
          {rows.map((r, i) => {
            const h = houseById.get(houseOf[r.id]);
            return (
              <li key={r.id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 text-sm">
                <span className="t-meta tabular-nums">{i + 1}.</span>
                <span className="flex min-w-0 items-center gap-2">
                  <PupilLink id={r.id} name={r.name} className="truncate font-medium text-ink" />
                  {h && (
                    <span className="t-meta inline-flex items-center gap-1">
                      <HouseDot colour={h.colour} />
                      {h.name}
                    </span>
                  )}
                </span>
                <span className="font-semibold tabular-nums">{r.points}</span>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

/** The head teacher's limits: the most points one award gives, and one member of staff a pupil a day. */
function LimitsForm({ limits, onSaved }: { limits: Limits | null; onSaved: () => void }) {
  const [max, setMax] = useState("");
  const [cap, setCap] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  useEffect(() => {
    if (!limits) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the form from the saved limits
    setMax(String(limits.max_per_award));
    setCap(String(limits.daily_cap_per_pupil));
  }, [limits]);
  const m = Number(max);
  const c = Number(cap);
  const bad = !Number.isInteger(m) || m < 1 || m > 50 || !Number.isInteger(c) || c < 1 || c > 200;
  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || bad) return;
    setState("saving");
    const { error } = await supabase.from("house_point_settings").update({ max_per_award: m, daily_cap_per_pupil: c }).eq("singleton", true);
    setState(error ? "error" : "saved");
    if (!error) onSaved();
  };
  return (
    <Panel title="Limits" description="Checked by the database on every award, so they cannot be got round. The head teacher and admin are not limited." guide="house-limits">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="t-eyebrow mb-1 block">Most points in one award</span>
          <input type="number" min={1} max={50} value={max} onChange={(e) => setMax(e.target.value)} className={`${ui.input} !w-28`} />
        </label>
        <label className="text-sm">
          <span className="t-eyebrow mb-1 block">Most a pupil can get from one member of staff in a day</span>
          <input type="number" min={1} max={200} value={cap} onChange={(e) => setCap(e.target.value)} className={`${ui.input} !w-28`} />
        </label>
        <Button variant="primary" disabled={bad || state === "saving"} onClick={() => void save()}>
          {state === "saving" ? "Saving…" : "Save limits"}
        </Button>
        {state === "saved" && <Status kind="completed">Saved</Status>}
        {state === "error" && <Status kind="overdue">Not saved</Status>}
      </div>
      {bad && <p className="mt-2 text-sm text-red-700">One award can be 1 to 50 points, and a day&apos;s most 1 to 200.</p>}
    </Panel>
  );
}
