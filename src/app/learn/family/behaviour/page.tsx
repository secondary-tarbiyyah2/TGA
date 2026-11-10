"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { EmptyState, ui } from "@/components/learn/ui";
import { getSupabaseClient } from "@/lib/supabase/client";
import { BadgeShelf } from "@/components/learn/behaviour/BadgeShelf";
import { RecordsTable } from "@/components/learn/behaviour/RecordsTable";
import { StatTile } from "@/components/learn/behaviour/StatTile";
import {
  fmtDate,
  loadBadges,
  loadDetentions,
  loadRecords,
  todayIso,
  type BadgeAward,
  type BehaviourRecord,
  type Detention,
} from "@/components/learn/behaviour/data";

type Child = { id: string; name: string };

function FamilyBehaviourContent() {
  const searchParams = useSearchParams();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [selected, setSelected] = useState<string>(searchParams.get("child") || "");
  const [records, setRecords] = useState<BehaviourRecord[] | null>(null);
  const [badges, setBadges] = useState<BadgeAward[]>([]);
  const [detentions, setDetentions] = useState<Detention[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(15);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("children")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        const rows = (data as Child[] | null) || [];
        setChildren(rows);
        // A ?child= that isn't one of this parent's children falls back to the first.
        setSelected((cur) => (rows.some((r) => r.id === cur) ? cur : rows[0]?.id || ""));
      });
  }, []);

  const load = useCallback(async (childId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase || !childId) return;
    setRecords(null);
    setError(null);
    setShown(15);
    try {
      const [recs, bdg, dets] = await Promise.all([
        loadRecords(supabase, { childIds: [childId] }),
        loadBadges(supabase, { childIds: [childId] }),
        loadDetentions(supabase, { childIds: [childId] }),
      ]);
      setRecords(recs);
      setBadges(bdg);
      setDetentions(dets);
    } catch {
      setError("Couldn't load behaviour records.");
      setRecords([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the chosen child's records when the selection changes
    if (selected) load(selected);
  }, [selected, load]);

  const total = useMemo(() => (records || []).reduce((n, r) => n + (r.kind === "incident" || r.voided_at ? 0 : r.points), 0), [records]);
  const merits = useMemo(() => (records || []).filter((r) => r.kind === "merit" && !r.voided_at).length, [records]);
  const upcoming = detentions.filter((d) => d.status === "scheduled" && d.scheduled_for >= todayIso());
  const childName = children?.find((c) => c.id === selected)?.name || "your child";

  return (
    <>
      <PageHeader crumbs={[{ label: "Today", href: "/family/dashboard" }, { label: "Behaviour" }]} title="Behaviour" subtitle={`Celebrating ${childName}'s good choices and progress.`} />
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {children && children.length > 1 && (
        <div role="group" aria-label="Child" className="mb-4 flex flex-wrap gap-2">
          {children.map((c) => (
            <button key={c.id} type="button" aria-pressed={selected === c.id} onClick={() => setSelected(c.id)} className={`${selected === c.id ? ui.chipOn : ui.chip} min-h-10`}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      {children !== null && children.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gold-light bg-cream/30 px-4 py-8 text-center text-sm text-ink/65">No children are linked to your account yet.</p>
      ) : records === null ? (
        <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />
      ) : records.length === 0 && badges.length === 0 && upcoming.length === 0 ? (
        // Nothing yet: one friendly message instead of three zero tiles and two empty boxes.
        <EmptyState title="Nothing recorded yet" icon="heartHandshake">
          Merits, badges and any follow-ups for {childName.split(" ")[0]} will appear here as teachers record them. Good things are on the way, in sha Allah.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile label="Points total" value={String(total)} sub={total > 0 ? "Keep it up!" : undefined} tone="good" />
            <StatTile label="Merits earned" value={String(merits)} />
            <StatTile label="Badges" value={String(badges.length)} />
          </div>

          {upcoming.length > 0 && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <h3 className="text-base font-semibold text-amber-900">Upcoming follow-up sessions</h3>
              <ul className="mt-2 space-y-1 text-sm text-amber-900">
                {upcoming.map((d) => (
                  <li key={d.id}>
                    {fmtDate(d.scheduled_for)} · {d.duration_minutes} minutes{d.notes ? ` · ${d.notes}` : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-900/80">A chance to reset and move forward. Please talk it through at home.</p>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-base font-semibold text-ink">Badges</h3>
            <BadgeShelf badges={badges} empty="No badges yet. Every merit is a step towards one." />
          </section>

          <section className="rounded-2xl border border-gold-light/50 bg-white p-4">
            <h3 className="mb-3 text-base font-semibold text-ink">
              Recent records {records.length > 0 && <span className="font-normal text-ink/60">· {records.length}</span>}
            </h3>
            <RecordsTable records={records.slice(0, shown)} showStudent={false} empty="Nothing recorded yet. Good things are on the way, in sha Allah." />
            {records.length > shown && (
              <button type="button" onClick={() => setShown((n) => n + 30)} className={`${ui.btnSecondary} mt-3 w-full sm:w-auto`}>
                Show {Math.min(30, records.length - shown)} more
              </button>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export default function FamilyBehaviourPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <LearnShell role="family">
          <Suspense fallback={<p className="text-ink/65">Loading…</p>}>
            <FamilyBehaviourContent />
          </Suspense>
        </LearnShell>
      </LearnGate>
    </section>
  );
}
