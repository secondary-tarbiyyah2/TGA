"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useFamilyChildren } from "@/lib/learn/classes";
import { PageHeader } from "@/components/learn/PageHeader";
import { EmptyState, StatusChip, ui } from "@/components/learn/ui";

type Unit = {
  id: string;
  subject: string;
  unit: string;
  title: string;
  has_video: boolean;
  topics: number;
  mastered: number;
  quizzes: number;
  practice: number;
  last_quiz: { correct: number; total: number; at: string } | null;
  best_pct: number | null;
  practise_next: string | null;
};

const pct = (c: number, t: number) => (t ? Math.round((c / t) * 100) : 0);

/**
 * Parents: how each child is getting on with Unit revision (0098
 * family_revision): latest and best quiz score, topics mastered, and the one
 * topic worth practising next. Questions and answers are never shown here.
 */
export function FamilyRevision() {
  const children = useFamilyChildren();
  const [childId, setChildId] = useState("");
  const [units, setUnits] = useState<{ child: string; list: Unit[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = childId || children?.[0]?.id || "";

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !current) return;
    let alive = true;
    supabase.rpc("family_revision", { p_child: current }).then(({ data, error: err }) => {
      if (!alive) return;
      setError(err ? "Couldn't load revision progress. Refresh to try again." : null);
      setUnits({ child: current, list: (data as Unit[]) || [] });
    });
    return () => {
      alive = false;
    };
  }, [current]);

  const list = units && units.child === current ? units.list : null;
  const name = children?.find((c) => c.id === current)?.name?.split(" ")[0] || "your child";

  return (
    <>
      <PageHeader crumbs={[{ label: "Home", href: "/family/dashboard" }, { label: "Revision" }]} title="Revision" subtitle={`How ${name} is getting on with each unit's summary, quiz and practice.`} />
      {children && children.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Child">
          {children.map((c) => (
            <button key={c.id} type="button" aria-pressed={current === c.id} onClick={() => setChildId(c.id)} className={current === c.id ? ui.chipOn : ui.chip}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {children !== null && children.length === 0 ? (
        <EmptyState title="No children on your account yet." />
      ) : list === null ? (
        <div className="h-32 animate-pulse rounded-2xl bg-white" />
      ) : list.length === 0 ? (
        <EmptyState title="No revision units for this year yet.">Teachers add a summary and a quiz for each unit as the year goes on. They will appear here.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((u) => {
            const last = u.last_quiz ? pct(u.last_quiz.correct, u.last_quiz.total) : null;
            const tone = last === null ? "neutral" : last >= 80 ? "good" : last >= 60 ? "info" : "warn";
            return (
              <li key={u.id} className="rounded-2xl border border-gold-light bg-white p-4">
                <p className="text-xs text-ink/60">{u.subject}</p>
                <p className="font-semibold text-ink">{u.title}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-cream/70 p-2">
                    <p className="text-lg font-semibold tabular-nums text-ink">{last === null ? "–" : `${last}%`}</p>
                    <p className="text-[11px] text-ink/65">latest quiz</p>
                  </div>
                  <div className="rounded-xl bg-cream/70 p-2">
                    <p className="text-lg font-semibold tabular-nums text-ink">{u.best_pct === null ? "–" : `${u.best_pct}%`}</p>
                    <p className="text-[11px] text-ink/65">best</p>
                  </div>
                  <div className="rounded-xl bg-cream/70 p-2">
                    <p className="text-lg font-semibold tabular-nums text-ink">
                      {u.mastered}/{u.topics}
                    </p>
                    <p className="text-[11px] text-ink/65">topics mastered</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink/70">
                  {u.quizzes === 0 ? <StatusChip>Not started</StatusChip> : <StatusChip tone={tone}>{u.quizzes} quiz{u.quizzes === 1 ? "" : "zes"} taken</StatusChip>}
                  {u.practice > 0 && <span>{u.practice} practice rounds</span>}
                  {u.last_quiz && <span>last on {new Date(u.last_quiz.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
                </div>
                {u.practise_next && u.mastered < u.topics && (
                  <p className="mt-2 text-sm text-ink/80">
                    Worth practising next: <span className="font-medium">{u.practise_next}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
