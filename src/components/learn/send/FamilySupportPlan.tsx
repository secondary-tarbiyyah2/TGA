"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useFamilyChildren } from "@/lib/learn/classes";
import { PageHeader } from "@/components/learn/PageHeader";
import { Tabs } from "@/components/learn/Tabs";
import { Button, EmptyState, Field, Notice, Section, StatusChip, ui } from "@/components/learn/ui";
import {
  ADJUSTMENTS,
  PLAN_COLUMNS,
  PRIMARY_NEED,
  RESPONSE_COLUMNS,
  REVIEW_COLUMNS,
  SUPPORT_LEVEL,
  TARGET_COLUMNS,
  TARGET_STATUS,
  accessList,
  fmtDate,
  staffNames,
  type FamilyResponse,
  type PlanReview,
  type PlanTarget,
  type SupportPlan,
} from "@/lib/learn/send";

const ADJ_LABEL = new Map(ADJUSTMENTS.map((a) => [a.key, a.label]));

/**
 * The Parent Portal's read-only view of a child's support plan: needs,
 * adjustments, access arrangements, targets and shared review notes, with a
 * place to comment and to agree. Only plans the school has made active are
 * shown (RLS); drafts stay with the school.
 */
export function FamilySupportPlan() {
  const kids = useFamilyChildren();
  const [plans, setPlans] = useState<SupportPlan[] | null>(null);
  const [childId, setChildId] = useState<string>("");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || kids === null) return;
    if (!kids.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no children on this account
      setPlans([]);
      return;
    }
    supabase
      .from("send_support_plans")
      .select(PLAN_COLUMNS)
      .in("child_id", kids.map((k) => k.id))
      .then(({ data }) => setPlans((data as unknown as SupportPlan[]) || []));
  }, [kids]);

  const withPlan = useMemo(() => (kids || []).filter((k) => (plans || []).some((p) => p.child_id === k.id)), [kids, plans]);
  const current = withPlan.find((k) => k.id === childId) || withPlan[0];
  const plan = current ? (plans || []).find((p) => p.child_id === current.id) : undefined;

  return (
    <>
      <PageHeader title="Support plan" subtitle="Your child's individual support plan: the help we give in lessons and assessments, their targets and our reviews with you." />
      {plans === null ? (
        <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />
      ) : !plan || !current ? (
        <EmptyState title="No support plan">
          If your child has special educational needs, a support plan sets out the adjustments in lessons, extra time or a reader or scribe in assessments, and regular reviews with you. Message the school if you would like to talk about one.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {withPlan.length > 1 && <Tabs variant="switch" label="Child" value={current.id} onChange={setChildId} items={withPlan.map((k) => ({ key: k.id, label: k.name.split(" ")[0] }))} />}
          <PlanView key={plan.id} plan={plan} childName={current.name} />
        </div>
      )}
    </>
  );
}

function PlanView({ plan, childName }: { plan: SupportPlan; childName: string }) {
  const supabase = getSupabaseClient();
  const [targets, setTargets] = useState<PlanTarget[]>([]);
  const [reviews, setReviews] = useState<PlanReview[]>([]);
  const [responses, setResponses] = useState<FamilyResponse[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const first = childName.split(" ")[0];

  const load = useCallback(async () => {
    if (!supabase) return;
    const [t, r, f] = await Promise.all([
      supabase.from("send_plan_targets").select(TARGET_COLUMNS).eq("plan_id", plan.id).order("sort"),
      supabase.from("send_plan_reviews").select(REVIEW_COLUMNS).eq("plan_id", plan.id).order("held_on", { ascending: false }),
      supabase.from("send_plan_family_responses").select(RESPONSE_COLUMNS).eq("plan_id", plan.id).order("created_at", { ascending: false }),
    ]);
    setTargets((t.data as PlanTarget[]) || []);
    setReviews((r.data as PlanReview[]) || []);
    setResponses((f.data as FamilyResponse[]) || []);
  }, [supabase, plan.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the plan's parts
    void load();
    void staffNames([plan.senco_id, plan.key_adult_id]).then(setNames);
  }, [load, plan.senco_id, plan.key_adult_id]);

  const agreed = responses.find((r) => r.agreed && r.plan_updated_at && new Date(r.plan_updated_at).getTime() >= new Date(plan.updated_at).getTime() - 1000);

  const send = async (agree: boolean) => {
    if (!supabase) return;
    if (!agree && !comment.trim()) return setMsg({ tone: "bad", text: "Write your comment first." });
    setBusy(true);
    setMsg(null);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("send_plan_family_responses").insert({ plan_id: plan.id, agreed: agree, comment: comment.trim() || null, parent_id: u.user?.id });
    setBusy(false);
    if (error) return setMsg({ tone: "bad", text: "We couldn't send that just now. Please try again." });
    setComment("");
    setMsg({ tone: "good", text: agree ? "Thank you. The school can see that you agree with the plan." : "Thank you. The SENCo will read your comment and reply here." });
    await load();
  };

  const adj = [...plan.adjustments.map((k) => ADJ_LABEL.get(k) || k), ...(plan.adjustments_other?.trim() ? [plan.adjustments_other.trim()] : [])];
  const access = accessList(plan);
  const who = [plan.senco_id && names[plan.senco_id] ? `SENCo: ${names[plan.senco_id]}` : "", plan.key_adult_id && names[plan.key_adult_id] ? `Key adult: ${names[plan.key_adult_id]}` : ""].filter(Boolean);

  return (
    <>
      <section className={ui.card}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-ink">{childName}</h2>
          <StatusChip tone={plan.status === "active" ? "good" : "neutral"}>{plan.status === "active" ? SUPPORT_LEVEL[plan.support_level] : "Plan closed"}</StatusChip>
          {agreed && <StatusChip tone="good">You agreed on {fmtDate(agreed.created_at)}</StatusChip>}
        </div>
        <p className="mt-1 text-sm text-ink/70">
          {[plan.primary_need ? PRIMARY_NEED[plan.primary_need] : "", ...who, plan.last_reviewed_on ? `Last reviewed ${fmtDate(plan.last_reviewed_on)}` : "", plan.status === "active" && plan.next_review_due ? `Next review by ${fmtDate(plan.next_review_due)}` : ""]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {plan.needs_summary && <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{plan.needs_summary}</p>}
        {plan.strengths && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-ink">
            <span className="font-medium">Strengths: </span>
            {plan.strengths}
          </p>
        )}
        {plan.pupil_views && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-ink">
            <span className="font-medium">What helps {first}: </span>
            {plan.pupil_views}
          </p>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="In lessons">
          {adj.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
              {adj.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink/65">No specific adjustments.</p>
          )}
        </Section>
        <Section title="In tests and assessments">
          {access.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
              {access.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink/65">No access arrangements.</p>
          )}
          <p className={`${ui.hint} mt-2`}>Public exams (GCSE) have their own rules and evidence: the exam centre decides those arrangements.</p>
        </Section>
      </div>

      {targets.length > 0 && (
        <Section title="Targets">
          <ul className="space-y-2">
            {targets.map((t) => (
              <li key={t.id} className="rounded-xl border border-gold-light/70 p-3 text-sm">
                <div className="flex flex-wrap items-start gap-2">
                  <p className="min-w-0 flex-1 font-medium text-ink">{t.target}</p>
                  <StatusChip tone={t.status === "achieved" ? "good" : t.status === "not_achieved" ? "bad" : "info"}>{TARGET_STATUS[t.status]}</StatusChip>
                </div>
                <p className="mt-1 text-ink/75">{[t.success_criteria ? `How we'll know: ${t.success_criteria}` : "", t.support ? `How we'll help: ${t.support}` : "", t.by_when ? `By ${fmtDate(t.by_when)}` : ""].filter(Boolean).join(" · ")}</p>
                {t.review_note && <p className="mt-1 text-ink/75">{t.review_note}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {reviews.length > 0 && (
        <Section title="Reviews">
          <ol className="space-y-2">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl border border-gold-light/70 p-3 text-sm">
                <p className="font-medium text-ink">
                  {fmtDate(r.held_on)}
                  {r.attendees ? <span className="font-normal text-ink/65"> · with {r.attendees}</span> : null}
                </p>
                {r.pupil_views && <p className="mt-1 whitespace-pre-wrap text-ink/80">{first}&apos;s views: {r.pupil_views}</p>}
                {r.notes && <p className="mt-1 whitespace-pre-wrap text-ink">{r.notes}</p>}
                {r.outcomes && <p className="mt-1 whitespace-pre-wrap text-ink"><span className="font-medium">Agreed: </span>{r.outcomes}</p>}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {plan.status === "active" && (
        <div data-guide="support-comments">
        <Section title="Your comments" description="Tell us what you think of the plan, or that you agree with it. The SENCo reads every comment.">
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <Field label="Comment (optional when agreeing)" htmlFor="fam-comment" className="mt-2">
            <textarea id="fam-comment" className={ui.textarea} rows={3} maxLength={3000} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <div className="mt-3 flex flex-wrap gap-2">
            {!agreed && (
              <Button variant="primary" disabled={busy} onClick={() => send(true)}>
                I agree with this plan
              </Button>
            )}
            <Button disabled={busy || !comment.trim()} onClick={() => send(false)}>
              Send comment
            </Button>
          </div>
          {responses.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-gold-light/60 pt-3">
              {responses.map((r) => (
                <li key={r.id} className="text-sm">
                  <p className="text-xs text-ink/65">
                    {fmtDate(r.created_at)}
                    {r.agreed ? " · You agreed with the plan" : ""}
                  </p>
                  {r.comment && <p className="whitespace-pre-wrap text-ink">{r.comment}</p>}
                  {r.reply && (
                    <p className="mt-1 rounded-lg bg-cream px-3 py-2 text-ink/80">
                      <span className="text-xs text-ink/65">The school replied: </span>
                      {r.reply}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
        </div>
      )}
    </>
  );
}
