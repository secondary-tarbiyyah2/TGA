"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
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
        setSelected((cur) => cur || rows[0]?.id || "");
      });
  }, []);

  const load = useCallback(async (childId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase || !childId) return;
    setRecords(null);
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
    if (selected) load(selected);
  }, [selected, load]);

  const total = useMemo(() => (records || []).reduce((n, r) => n + (r.kind === "incident" || r.voided_at ? 0 : r.points), 0), [records]);
  const merits = useMemo(() => (records || []).filter((r) => r.kind === "merit" && !r.voided_at).length, [records]);
  const upcoming = detentions.filter((d) => d.status === "scheduled" && d.scheduled_for >= todayIso());
  const childName = children?.find((c) => c.id === selected)?.name || "your child";

  return (
    <>
      <PageHeader crumbs={[{ label: "Dashboard", href: "/family/dashboard" }, { label: "Behaviour" }]} title="Behaviour" subtitle={`Celebrating ${childName}'s good choices and progress.`} />
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {children && children.length > 1 && (
        <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Child" className="mb-4 rounded-lg border border-gold-light bg-white px-3 py-2 text-sm">
          {children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      {children !== null && children.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gold-light bg-cream/30 px-4 py-8 text-center text-sm text-ink/60">No children are linked to your account yet.</p>
      ) : records === null ? (
        <p className="text-ink/60">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile label="Points total" value={String(total)} sub={total > 0 ? "Keep it up!" : undefined} tone="good" />
            <StatTile label="Merits earned" value={String(merits)} />
            <StatTile label="Badges" value={String(badges.length)} />
          </div>

          <section>
            <h3 className="mb-2 text-base font-semibold text-ink">Badges</h3>
            <BadgeShelf badges={badges} empty="No badges yet. Every merit is a step towards one." />
          </section>

          {upcoming.length > 0 && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <h3 className="text-base font-semibold text-amber-900">Upcoming detentions</h3>
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

          <section className="rounded-2xl border border-gold-light/50 bg-white p-4">
            <h3 className="mb-3 text-base font-semibold text-ink">Recent records</h3>
            <RecordsTable records={records.slice(0, 30)} showStudent={false} empty="Nothing recorded yet. Good things are on the way, in sha Allah." />
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
          <Suspense fallback={<p className="text-ink/60">Loading…</p>}>
            <FamilyBehaviourContent />
          </Suspense>
        </LearnShell>
      </LearnGate>
    </section>
  );
}
