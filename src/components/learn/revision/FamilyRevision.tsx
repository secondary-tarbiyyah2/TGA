"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useFamilyChildren } from "@/lib/learn/classes";
import { PageHeader } from "@/components/learn/PageHeader";
import { Icon } from "@/components/learn/Icon";
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
const started = (u: Unit) => u.quizzes > 0 || u.practice > 0 || u.mastered > 0;

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
        <RevisionBySubject list={list} name={name} />
      )}
    </>
  );
}

function UnitCard({ u }: { u: Unit }) {
  const last = u.last_quiz ? pct(u.last_quiz.correct, u.last_quiz.total) : null;
  const tone = last === null ? "neutral" : last >= 80 ? "good" : last >= 60 ? "info" : "warn";
  return (
    <li className="rounded-2xl border border-gold-light bg-white p-4">
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
        <StatusChip tone={tone}>
          {u.quizzes} quiz{u.quizzes === 1 ? "" : "zes"} taken
        </StatusChip>
        {u.practice > 0 && (
          <span>
            {u.practice} practice round{u.practice === 1 ? "" : "s"}
          </span>
        )}
        {u.last_quiz && <span>last on {new Date(u.last_quiz.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}</span>}
      </div>
      {u.practise_next && u.mastered < u.topics && (
        <p className="mt-2 text-sm text-ink/80">
          Worth practising next: <span className="font-medium">{u.practise_next}</span>
        </p>
      )}
    </li>
  );
}

/**
 * Units grouped by subject. Units with any activity get a full card; units
 * not started yet are a single compact line each, folded away, so a new
 * pupil's page is not a wall of identical empty cards.
 */
function RevisionBySubject({ list, name }: { list: Unit[]; name: string }) {
  const subjects = useMemo(() => {
    const map = new Map<string, Unit[]>();
    for (const u of list) map.set(u.subject, [...(map.get(u.subject) || []), u]);
    return [...map.entries()].map(([subject, units]) => ({ subject, active: units.filter(started), idle: units.filter((u) => !started(u)) }));
  }, [list]);
  const startedCount = list.filter(started).length;
  const topics = list.reduce((n, u) => n + u.topics, 0);
  const mastered = list.reduce((n, u) => n + u.mastered, 0);

  return (
    <div className="space-y-4">
      <p className="rounded-2xl border border-gold-light bg-white px-4 py-3 text-sm text-ink/80">
        {startedCount === 0 ? (
          <>{name === "your child" ? "Your child hasn't" : `${name} hasn't`} started any revision yet. Each unit has a short summary, a quiz and practice; a good first step is the unit being taught in class now.</>
        ) : (
          <>
            <span className="font-semibold text-ink">{startedCount}</span> of {list.length} units started · <span className="font-semibold text-ink">{mastered}</span> of {topics} topics mastered
          </>
        )}
      </p>
      {subjects.map(({ subject, active, idle }) => (
        <section key={subject} aria-label={subject}>
          <h2 className="mb-2 text-sm font-semibold text-ink">
            {subject} <span className="font-normal text-ink/65">· {active.length + idle.length} unit{active.length + idle.length === 1 ? "" : "s"}</span>
          </h2>
          {active.length > 0 && (
            <ul className="mb-2 grid gap-3 sm:grid-cols-2">
              {active.map((u) => (
                <UnitCard key={u.id} u={u} />
              ))}
            </ul>
          )}
          {idle.length > 0 && (
            <details className="group rounded-xl border border-gold-light bg-white">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-sm text-ink/75">
                <span>
                  {idle.length} unit{idle.length === 1 ? "" : "s"} not started yet
                </span>
                <Icon name="chevronDown" className="h-4 w-4 text-ink/65 transition-transform group-open:rotate-180" />
              </summary>
              <ul className="divide-y divide-gold-light/60 border-t border-gold-light px-4">
                {idle.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="text-ink">{u.title}</span>
                    <span className="text-xs text-ink/65">
                      {u.topics} topic{u.topics === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ))}
    </div>
  );
}
