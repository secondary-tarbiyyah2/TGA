"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchAllClasses, fetchTeacherClasses, type ClassSummary } from "@/lib/learn/classes";
import { getSupabaseClient } from "@/lib/supabase/client";
import { loadStudents, type StudentOption } from "@/components/learn/behaviour/data";
import { Tabs } from "@/components/learn/Tabs";
import { EmptyState, ui } from "@/components/learn/ui";
import { BatchAward } from "./BatchAward";
import { HouseTable } from "./HouseTable";
import { StarApprovals } from "./StarApprovals";
import { StarHistory } from "./StarHistory";
import { StarWeek } from "./StarWeek";
import { weekOptions } from "./starData";

export { STAR_QUICK_TAGS } from "./starData";

// Star of the Week and house points (0073, 0074, 0131), as a weekly flow:
//  * This week: per class, suggested pupils with the week's evidence, choose,
//    pick reasons and a personal message, preview the certificate, submit.
//  * Approvals (Headteacher/Admin): approve (posting the class shout-out) or
//    decline with a note; then make / email the PDF certificate.
//  * History: past stars per class, and per pupil ("not star yet this term").
//  * House points: the leaderboard, and awarding merits to the class.
// A child whose family opted out of the leaderboard can still be a star (a
// private certificate) but never appears in a public shout-out.

type View = "week" | "approvals" | "history" | "houses";

export function StarManager({ isHead, housesAdmin }: { isHead: boolean; housesAdmin?: ReactNode }) {
  const weeks = useMemo(() => weekOptions(), []);
  const [view, setView] = useState<View>("week");
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [classId, setClassId] = useState("");
  const [weekStart, setWeekStart] = useState(weeks[0].value);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [pending, setPending] = useState(0);
  const [roster, setRoster] = useState<StudentOption[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    (isHead ? fetchAllClasses() : fetchTeacherClasses()).then((list) => {
      if (!alive) return;
      setClasses(list);
      setClassId((cur) => cur || list[0]?.id || "");
    });
    getSupabaseClient()
      ?.auth.getUser()
      .then(({ data }) => alive && setMe(data.user ? { id: data.user.id } : null));
    return () => {
      alive = false;
    };
  }, [isHead]);

  // How many nominations are waiting (the Approvals badge).
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !isHead) return;
    let alive = true;
    supabase
      .from("star_of_the_week")
      .select("id", { count: "exact", head: true })
      .eq("status", "nominated")
      .then(({ count }) => alive && setPending(count ?? 0));
    return () => {
      alive = false;
    };
  }, [isHead, tick]);

  // The class list for awarding merits.
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !classId || view !== "houses") return;
    let alive = true;
    loadStudents(supabase, [classId]).then((s) => alive && setRoster(s));
    return () => {
      alive = false;
    };
  }, [classId, view, tick]);

  const changed = useCallback(() => setTick((t) => t + 1), []);
  const cls = (classes || []).find((c) => c.id === classId) || null;

  const tabs = [
    { key: "week" as View, label: "This week" },
    ...(isHead ? [{ key: "approvals" as View, label: "Approvals", count: pending, countAlert: true }] : []),
    { key: "history" as View, label: "History" },
    { key: "houses" as View, label: "House points" },
  ];

  const pickers = (withWeek: boolean) =>
    classes && classes.length > 0 ? (
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-ink/75">
          <span>Class</span>
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className={`${ui.input} !w-auto !py-1.5`}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {withWeek && (
          <label className="flex items-center gap-2 text-sm text-ink/75">
            <span>Week</span>
            <select value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className={`${ui.input} !w-auto !py-1.5`}>
              {weeks.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <Tabs variant="switch" label="Star of the Week sections" items={tabs} value={view} onChange={setView} />

      {classes === null ? (
        <div className="h-40 animate-pulse rounded-2xl bg-white" />
      ) : view === "approvals" ? (
        <StarApprovals me={me} onChanged={changed} />
      ) : view === "houses" ? (
        <div className="space-y-4">
          {/* HousesAdmin carries its own house table. */}
          {housesAdmin || <HouseTable title="House points leaderboard" />}
          {cls && (
            <>
              {pickers(false)}
              <BatchAward key={classId} classId={classId} roster={roster} onAwarded={changed} />
            </>
          )}
        </div>
      ) : classes.length === 0 || !cls ? (
        <EmptyState title={isHead ? "There are no classes yet" : "You haven't been given any classes yet"} icon="star" tile="tile-gold">
          Stars are chosen per class, once a week.
        </EmptyState>
      ) : view === "week" ? (
        <>
          {pickers(true)}
          <StarWeek key={`${classId}-${weekStart}`} isHead={isHead} classId={classId} className={cls.name} weekStart={weekStart} me={me} onChanged={changed} />
        </>
      ) : (
        <>
          {pickers(false)}
          <StarHistory key={`${classId}-${tick}`} isHead={isHead} classId={classId} />
        </>
      )}
    </div>
  );
}
