"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { StatusChip } from "@/components/learn/ui";
import { PRIMARY_NEED, TARGET_COLUMNS, TARGET_STATUS, accessList, adjustmentList, fmtDate, staffNames, type PlanTarget, type SupportPlan } from "@/lib/learn/send";

/**
 * "Support at a glance" for a class: the pupils with an active support plan
 * and what to do for each, where teachers already are (the register, the
 * gradebook). `mode="assessment"` shows only the access arrangements, open,
 * so they are applied when a test is set or marked. Renders nothing when no
 * pupil in the list has a plan this user may read.
 */
export function SupportAtAGlance({
  pupils,
  plans,
  mode = "lesson",
  className = "",
}: {
  pupils: { id: string; name: string }[];
  plans: Record<string, SupportPlan> | null;
  mode?: "lesson" | "assessment";
  className?: string;
}) {
  if (!plans) return null;
  const rows = pupils
    .map((p) => ({ p, plan: plans[p.id] }))
    .filter((r): r is { p: { id: string; name: string }; plan: SupportPlan } => !!r.plan)
    .map((r) => ({ ...r, access: accessList(r.plan), adj: adjustmentList(r.plan) }))
    .filter((r) => (mode === "assessment" ? r.access.length > 0 : r.access.length + r.adj.length > 0));
  if (!rows.length) return null;

  const title =
    mode === "assessment"
      ? `Access arrangements: ${rows.length} pupil${rows.length === 1 ? "" : "s"}`
      : `Support at a glance: ${rows.length} pupil${rows.length === 1 ? "" : "s"} with a support plan`;

  return (
    <details open={mode === "assessment"} className={`rounded-xl border border-teal-700/20 bg-teal-100/40 text-sm ${className}`}>
      <summary className="cursor-pointer px-4 py-2.5 font-semibold text-teal-900">{title}</summary>
      <ul className="divide-y divide-teal-700/10 border-t border-teal-700/10">
        {rows.map(({ p, adj, access }) => (
          <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2">
            <span className="w-full font-medium text-ink sm:w-40 sm:shrink-0">{p.name}</span>
            <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {mode === "lesson" &&
                adj.map((a) => (
                  <StatusChip key={a} tone="info">
                    {a}
                  </StatusChip>
                ))}
              {access.map((a) => (
                <StatusChip key={a} tone="warn">
                  {a}
                </StatusChip>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-teal-700/10 px-4 py-2 text-xs text-ink/65">
        {mode === "assessment"
          ? "Apply these in every test and timed task. Ask the SENCo if you can't provide one online."
          : "Blue: adjustments in lessons. Amber: access arrangements in tests. Full plans are under Pupils, Support plans."}
      </p>
    </details>
  );
}

/** A small "Support plan" chip beside a pupil's name; the title lists what to do. */
export function SupportBadge({ plan }: { plan: SupportPlan | undefined }) {
  if (!plan) return null;
  const all = [...adjustmentList(plan), ...accessList(plan)];
  return (
    <span title={all.join(" · ") || "Support plan"} className="ml-2 inline-block rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-900">
      Support plan
    </span>
  );
}

/** One pupil's active plan as a teacher sees it: needs, adjustments, access arrangements, targets and who to ask. */
export function PupilSupportCard({ plan }: { plan: SupportPlan }) {
  const [targets, setTargets] = useState<PlanTarget[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    supabase
      .from("send_plan_targets")
      .select(TARGET_COLUMNS)
      .eq("plan_id", plan.id)
      .order("sort")
      .then(({ data }) => alive && setTargets(((data as PlanTarget[]) || []).filter((t) => t.status !== "achieved")));
    void staffNames([plan.senco_id, plan.key_adult_id]).then((n) => alive && setNames(n));
    return () => {
      alive = false;
    };
  }, [plan.id, plan.senco_id, plan.key_adult_id]);

  const adj = adjustmentList(plan);
  const access = accessList(plan);
  const who = [plan.senco_id && names[plan.senco_id] ? `SENCo: ${names[plan.senco_id]}` : "", plan.key_adult_id && names[plan.key_adult_id] ? `Key adult: ${names[plan.key_adult_id]}` : ""].filter(Boolean).join(" · ");

  return (
    <section className="rounded-xl border border-teal-700/20 bg-white p-4" aria-labelledby={`sp-${plan.id}`}>
      <h3 id={`sp-${plan.id}`} className="text-sm font-semibold text-ink">
        Support at a glance
      </h3>
      <p className="text-xs text-ink/65">
        {[plan.primary_need ? PRIMARY_NEED[plan.primary_need] : "", who, plan.next_review_due ? `Next review ${fmtDate(plan.next_review_due)}` : ""].filter(Boolean).join(" · ")}
      </p>
      {plan.needs_summary && <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{plan.needs_summary}</p>}
      {plan.strengths && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink/80">
          <span className="font-medium text-ink">Strengths: </span>
          {plan.strengths}
        </p>
      )}
      {adj.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/65">In lessons</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {adj.map((a) => (
              <StatusChip key={a} tone="info">
                {a}
              </StatusChip>
            ))}
          </div>
        </div>
      )}
      {access.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/65">In tests and assessments</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {access.map((a) => (
              <StatusChip key={a} tone="warn">
                {a}
              </StatusChip>
            ))}
          </div>
        </div>
      )}
      {targets && targets.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/65">Current targets</p>
          <ul className="mt-1 space-y-1 text-sm text-ink">
            {targets.map((t) => (
              <li key={t.id}>
                {t.target}
                <span className="text-ink/65"> · {TARGET_STATUS[t.status]}</span>
                {t.support ? <span className="block text-xs text-ink/65">How to help: {t.support}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
