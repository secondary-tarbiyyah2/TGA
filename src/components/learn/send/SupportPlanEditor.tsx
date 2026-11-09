"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Button, Field, Notice, Section, StatusChip, Switch, ui } from "@/components/learn/ui";
import {
  ADJUSTMENTS,
  PLAN_COLUMNS,
  PLAN_STATUS,
  PRIMARY_NEED,
  RESPONSE_COLUMNS,
  REVIEW_COLUMNS,
  SUPPORT_LEVEL,
  TARGET_COLUMNS,
  TARGET_STATUS,
  fmtDate,
  reviewState,
  type FamilyResponse,
  type PlanReview,
  type PlanTarget,
  type PrimaryNeed,
  type SupportLevel,
  type SupportPlan,
  type TargetStatus,
} from "@/lib/learn/send";
import { ChangeLog, DocumentsSection } from "./SendExtras";
import { Select } from "@/components/learn/Select";

type Sources = {
  application_notes: string | null;
  application_ref: string | null;
  record_sen_notes: string | null;
  record_medical: string | null;
  assessment_access: { extraTimePct?: number; readAloud?: boolean; largeText?: boolean; breaks?: unknown; other?: string } | null;
  assessment_notes: string | null;
};
type Staff = { user_id: string; full_name: string; is_senco: boolean };

const EXTRA_TIME = [0, 10, 15, 25, 50, 100];
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
};
const meaningful = (t: string | null | undefined) => !!t && !/^(none|n\/?a|no|nil|-|nothing|not applicable)\.?$/i.test(t.trim());
const errText = (e: { message?: string } | null) => (e?.message ? e.message.replace(/^.*?:\s*/, "") : "Please try again.");

/**
 * A pupil's support plan, for the SENCo, Headteacher and admin: needs,
 * strengths, classroom adjustments, access arrangements, SMART targets,
 * reviews with the family, and the family's comments. Used in the SEND
 * register and on the pupil's profile.
 */
export function SupportPlanEditor({ childId, childName, onChanged }: { childId: string; childName: string; onChanged?: () => void }) {
  const supabase = getSupabaseClient();
  const [plan, setPlan] = useState<SupportPlan | null | undefined>(undefined);
  const [form, setForm] = useState<SupportPlan | null>(null);
  const [targets, setTargets] = useState<PlanTarget[]>([]);
  const [reviews, setReviews] = useState<PlanReview[]>([]);
  const [responses, setResponses] = useState<FamilyResponse[]>([]);
  const [sources, setSources] = useState<Sources | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [logKey, setLogKey] = useState(0);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("send_support_plans").select(PLAN_COLUMNS).eq("child_id", childId).maybeSingle();
    if (error) {
      setMsg({ tone: "bad", text: `Couldn't load the plan: ${errText(error)}` });
      setPlan(null);
      return;
    }
    const p = (data as unknown as SupportPlan | null) || null;
    setPlan(p);
    setForm(p);
    if (p) {
      const [t, r, f] = await Promise.all([
        supabase.from("send_plan_targets").select(TARGET_COLUMNS).eq("plan_id", p.id).order("sort").order("by_when"),
        supabase.from("send_plan_reviews").select(REVIEW_COLUMNS).eq("plan_id", p.id).order("held_on", { ascending: false }),
        supabase.from("send_plan_family_responses").select(RESPONSE_COLUMNS).eq("plan_id", p.id).order("created_at", { ascending: false }),
      ]);
      setTargets((t.data as PlanTarget[]) || []);
      setReviews((r.data as PlanReview[]) || []);
      setResponses((f.data as FamilyResponse[]) || []);
    }
  }, [supabase, childId]);

  useEffect(() => {
    if (!supabase) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load when the pupil changes
    void load();
    supabase.rpc("send_sources", { p_child: childId }).then(({ data }) => setSources((data as Sources) || null));
    supabase.rpc("send_staff_options").then(({ data }) => setStaff((data as Staff[]) || []));
  }, [supabase, childId, load]);

  const done = async (text: string) => {
    setMsg({ tone: "good", text });
    await load();
    onChanged?.();
  };

  const start = async () => {
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    const fromApp = meaningful(sources?.application_notes) ? sources!.application_notes : null;
    const fromRecord = meaningful(sources?.record_sen_notes) ? sources!.record_sen_notes : null;
    const acc = sources?.assessment_access || {};
    const senco = staff.find((s) => s.is_senco);
    const { error } = await supabase.from("send_support_plans").insert({
      child_id: childId,
      needs_summary: fromApp || fromRecord,
      needs_source: fromApp ? `From the application${sources?.application_ref ? ` ${sources.application_ref}` : ""}, in the family's words` : fromRecord ? "From the family's pupil information" : null,
      access_extra_time_pct: Math.min(100, Math.max(0, Math.round(Number(acc.extraTimePct) || 0))),
      access_reader: !!acc.readAloud,
      access_rest_breaks: !!acc.breaks,
      access_other: acc.other || null,
      senco_id: senco?.user_id || null,
      next_review_due: addDays(42),
    });
    setBusy(false);
    if (error) return setMsg({ tone: "bad", text: `Couldn't start the plan: ${errText(error)}` });
    await done("Draft plan started. Only the SENCo, Headteacher and admin can see it until you make it active.");
  };

  const dirty = useMemo(() => !!plan && !!form && JSON.stringify(plan) !== JSON.stringify(form), [plan, form]);

  const save = async (patch?: Partial<SupportPlan>) => {
    if (!supabase || !form) return;
    const next = { ...form, ...patch };
    setBusy(true);
    setMsg(null);
    const { error } = await supabase
      .from("send_support_plans")
      .update({
        status: next.status,
        support_level: next.support_level,
        primary_need: next.primary_need,
        needs_summary: next.needs_summary?.trim() || null,
        needs_source: next.needs_source,
        strengths: next.strengths?.trim() || null,
        pupil_views: next.pupil_views?.trim() || null,
        adjustments: next.adjustments,
        adjustments_other: next.adjustments_other?.trim() || null,
        access_extra_time_pct: next.access_extra_time_pct,
        access_reader: next.access_reader,
        access_scribe: next.access_scribe,
        access_rest_breaks: next.access_rest_breaks,
        access_word_processor: next.access_word_processor,
        access_separate_room: next.access_separate_room,
        access_other: next.access_other?.trim() || null,
        senco_id: next.senco_id,
        key_adult_id: next.key_adult_id,
        next_review_due: next.next_review_due || null,
      })
      .eq("id", form.id);
    setBusy(false);
    if (error) return setMsg({ tone: "bad", text: `Couldn't save: ${errText(error)}` });
    await done(patch?.status === "active" ? `Plan is active. ${childName}'s teachers now see the adjustments and access arrangements, and the family can read it in the Parent Portal.` : "Saved.");
  };

  if (plan === undefined) return <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />;

  if (!plan || !form) {
    const hasSource = meaningful(sources?.application_notes) || meaningful(sources?.record_sen_notes);
    return (
      <div className="space-y-4">
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <Section title="No support plan yet" description={`Start one if ${childName} needs adjustments in lessons, access arrangements in tests or targets reviewed with the family.`}>
          <SourcesPanel sources={sources} />
          <div className="mt-4">
            <Button variant="primary" onClick={start} disabled={busy}>
              {busy ? "Starting…" : hasSource ? "Start a plan from what the family told us" : "Start a support plan"}
            </Button>
          </div>
        </Section>
      </div>
    );
  }

  const set = <K extends keyof SupportPlan>(k: K, v: SupportPlan[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const toggleAdj = (k: string) => set("adjustments", form.adjustments.includes(k) ? form.adjustments.filter((x) => x !== k) : [...form.adjustments, k]);
  const rs = reviewState(plan.next_review_due);
  const agreedCurrent = responses.some((r) => r.agreed && r.plan_updated_at && new Date(r.plan_updated_at).getTime() >= new Date(plan.updated_at).getTime() - 1000);

  return (
    <div className="space-y-4">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {/* Status and people */}
      <section className={ui.card}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={plan.status === "active" ? "good" : plan.status === "draft" ? "warn" : "neutral"}>{PLAN_STATUS[plan.status]}</StatusChip>
          {plan.status !== "draft" && <StatusChip tone={rs.state === "overdue" ? "bad" : rs.state === "soon" ? "warn" : "neutral"}>{rs.label}</StatusChip>}
          {plan.status === "active" && <StatusChip tone={agreedCurrent ? "good" : "neutral"}>{agreedCurrent ? "Family agreed this version" : "Not yet agreed by the family"}</StatusChip>}
          <span className="flex-1" />
          {plan.status === "draft" && (
            <Button variant="primary" size="sm" disabled={busy} onClick={() => save({ status: "active" })}>
              Make active and share
            </Button>
          )}
          {plan.status === "active" && (
            <Button size="sm" disabled={busy} onClick={() => window.confirm("Close this plan? Teachers will stop seeing it; the family can still read it.") && save({ status: "closed" })}>
              Close plan
            </Button>
          )}
          {plan.status === "closed" && (
            <Button size="sm" disabled={busy} onClick={() => save({ status: "active" })}>
              Reopen
            </Button>
          )}
        </div>
        <p className={`${ui.hint} mt-2`}>
          {plan.status === "draft"
            ? "Draft: only the SENCo, Headteacher and admin can see it. Make it active to share it with the pupil's teachers and the family."
            : plan.status === "active"
              ? "Active: the pupil's teachers see the adjustments, access arrangements and targets; the family reads the plan and shared reviews. Pupils never see it."
              : "Closed: teachers no longer see it. The family can still read it."}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Level of support" htmlFor="sp-level">
            <Select id="sp-level" className={ui.select} value={form.support_level} onChange={(e) => set("support_level", e.target.value as SupportLevel)}>
              {(Object.keys(SUPPORT_LEVEL) as SupportLevel[]).map((k) => (
                <option key={k} value={k}>
                  {SUPPORT_LEVEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Main area of need" htmlFor="sp-need">
            <Select id="sp-need" className={ui.select} value={form.primary_need || ""} onChange={(e) => set("primary_need", (e.target.value || null) as PrimaryNeed | null)}>
              <option value="">Not set</option>
              {(Object.keys(PRIMARY_NEED) as PrimaryNeed[]).map((k) => (
                <option key={k} value={k}>
                  {PRIMARY_NEED[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="SENCo" htmlFor="sp-senco">
            <Select id="sp-senco" className={ui.select} value={form.senco_id || ""} onChange={(e) => set("senco_id", e.target.value || null)}>
              <option value="">Not named</option>
              {staff.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.full_name}
                  {s.is_senco ? " (SENCo)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Key adult" htmlFor="sp-key" hint="Who the pupil and family go to first">
            <Select id="sp-key" className={ui.select} value={form.key_adult_id || ""} onChange={(e) => set("key_adult_id", e.target.value || null)}>
              <option value="">Not named</option>
              {staff.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Next review due" htmlFor="sp-next" hint="Recording a review moves this on">
            <input id="sp-next" type="date" className={ui.input} value={form.next_review_due || ""} onChange={(e) => set("next_review_due", e.target.value || null)} />
          </Field>
        </div>
      </section>

      {/* Needs */}
      <Section title="Needs and strengths" description="In plain words the family and teachers will understand.">
        <div className="space-y-4">
          <Field label="Needs summary" htmlFor="sp-needs" hint={form.needs_source ? `Started from: ${form.needs_source}. Edit it into the school's summary.` : undefined}>
            <textarea id="sp-needs" className={ui.textarea} rows={5} maxLength={4000} value={form.needs_summary || ""} onChange={(e) => set("needs_summary", e.target.value)} />
          </Field>
          <SourcesPanel sources={sources} onUse={(t) => set("needs_summary", [form.needs_summary?.trim(), t.trim()].filter(Boolean).join("\n\n"))} compact />
          <Field label="Strengths and interests" htmlFor="sp-str">
            <textarea id="sp-str" className={ui.textarea} rows={3} maxLength={3000} value={form.strengths || ""} onChange={(e) => set("strengths", e.target.value)} />
          </Field>
          <Field label="What helps me (the pupil's own views)" htmlFor="sp-views">
            <textarea id="sp-views" className={ui.textarea} rows={3} maxLength={3000} value={form.pupil_views || ""} onChange={(e) => set("pupil_views", e.target.value)} />
          </Field>
        </div>
      </Section>

      {/* Adjustments */}
      <Section title="Adjustments in lessons" description="Teachers see these on the register and the pupil's record.">
        <div className="grid gap-1 sm:grid-cols-2">
          {ADJUSTMENTS.map((a) => (
            <label key={a.key} className="flex min-h-11 items-start gap-3 rounded-lg px-3 py-2 text-sm text-ink hover:bg-cream">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-teal-700" checked={form.adjustments.includes(a.key)} onChange={() => toggleAdj(a.key)} />
              {a.label}
            </label>
          ))}
        </div>
        <Field label="Other adjustments" htmlFor="sp-adj-other" className="mt-3">
          <textarea id="sp-adj-other" className={ui.textarea} rows={2} maxLength={2000} value={form.adjustments_other || ""} onChange={(e) => set("adjustments_other", e.target.value)} placeholder="For example: sits with a parent nearby for the first ten minutes" />
        </Field>
      </Section>

      {/* Access arrangements */}
      <Section title="Access arrangements in assessments" description="Shown to staff when they set up a test, and applied to the online entry assessment.">
        <div className="grid gap-1 sm:grid-cols-2">
          <label className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-cream">
            <span className="font-medium text-ink">Extra time</span>
            <Select className={`${ui.select} !w-auto`} value={form.access_extra_time_pct} onChange={(e) => set("access_extra_time_pct", Number(e.target.value))}>
              {[...new Set([...EXTRA_TIME, form.access_extra_time_pct])].sort((a, b) => a - b).map((v) => (
                <option key={v} value={v}>
                  {v ? `${v}%` : "None"}
                </option>
              ))}
            </Select>
          </label>
          <Switch checked={form.access_reader} onChange={(v) => set("access_reader", v)} label="Reader" hint="Questions read aloud by an adult or the computer" />
          <Switch checked={form.access_scribe} onChange={(v) => set("access_scribe", v)} label="Scribe" hint="An adult types or writes the pupil's answers" />
          <Switch checked={form.access_rest_breaks} onChange={(v) => set("access_rest_breaks", v)} label="Supervised rest breaks" hint="The clock stops during the break" />
          <Switch checked={form.access_word_processor} onChange={(v) => set("access_word_processor", v)} label="Word processor" hint="Types instead of handwriting, spellcheck off" />
          <Switch checked={form.access_separate_room} onChange={(v) => set("access_separate_room", v)} label="Separate breakout room" hint="Sits the test in a Teams breakout room with an adult" />
        </div>
        <Field label="Other arrangements" htmlFor="sp-acc-other" className="mt-3">
          <input id="sp-acc-other" className={ui.input} maxLength={1000} value={form.access_other || ""} onChange={(e) => set("access_other", e.target.value)} placeholder="For example: coloured background, enlarged paper, prompter" />
        </Field>
      </Section>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-gold-light bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <Button variant="primary" disabled={busy || !dirty} onClick={() => save()}>
          {busy ? "Saving…" : "Save plan"}
        </Button>
        <span className={ui.hint}>{dirty ? "You have unsaved changes." : `Last saved ${fmtDate(plan.updated_at)}.`}</span>
      </div>

      <TargetsSection planId={plan.id} targets={targets} onChanged={() => done("Targets updated.")} />
      <ReviewsSection planId={plan.id} reviews={reviews} targets={targets} onChanged={() => done("Review recorded. The next review date has moved on.")} />
      <ResponsesSection responses={responses} onChanged={() => done("Reply saved. The family sees it on their child's plan.")} />
      <DocumentsSection planId={plan.id} onChanged={() => setLogKey((k) => k + 1)} />
      <Section title="Change history" description="Every change to this pupil's plan, targets, reviews, family comments and documents: who made it and when.">
        <ChangeLog childId={childId} refreshKey={logKey + (plan.updated_at ? new Date(plan.updated_at).getTime() : 0) + targets.length + reviews.length} />
      </Section>
    </div>
  );
}

/** What the family and admissions already told us: shown so nothing is retyped. */
function SourcesPanel({ sources, onUse, compact = false }: { sources: Sources | null; onUse?: (text: string) => void; compact?: boolean }) {
  if (!sources) return null;
  const items: { label: string; text: string }[] = [];
  if (meaningful(sources.application_notes)) items.push({ label: `Application${sources.application_ref ? ` ${sources.application_ref}` : ""}`, text: sources.application_notes! });
  if (meaningful(sources.record_sen_notes) && sources.record_sen_notes !== sources.application_notes) items.push({ label: "Pupil information: additional needs", text: sources.record_sen_notes! });
  if (meaningful(sources.record_medical)) items.push({ label: "Pupil information: medical", text: sources.record_medical! });
  if (meaningful(sources.assessment_notes) && sources.assessment_notes !== sources.application_notes) items.push({ label: "Entry assessment notes", text: sources.assessment_notes! });
  const acc = sources.assessment_access;
  const accText = acc ? [acc.extraTimePct ? `${acc.extraTimePct}% extra time` : "", acc.readAloud ? "questions read aloud" : "", acc.largeText ? "larger text" : "", acc.breaks ? "breaks" : "", acc.other || ""].filter(Boolean).join(", ") : "";
  if (!items.length && !accText) return compact ? null : <p className="text-sm text-ink/65">The application and the family&apos;s pupil information don&apos;t mention any needs.</p>;
  return (
    <details open={!compact} className="rounded-xl border border-gold-light bg-cream/50 text-sm">
      <summary className="cursor-pointer px-4 py-2.5 font-medium text-ink">What the family has already told us</summary>
      <ul className="space-y-3 border-t border-gold-light px-4 py-3">
        {items.map((i) => (
          <li key={i.label}>
            <p className="text-xs font-medium uppercase tracking-wide text-ink/65">{i.label}</p>
            <p className="mt-0.5 whitespace-pre-wrap text-ink">{i.text}</p>
            {onUse && (
              <button type="button" className={ui.btnLink} onClick={() => onUse(i.text)}>
                Add to the needs summary
              </button>
            )}
          </li>
        ))}
        {accText && (
          <li>
            <p className="text-xs font-medium uppercase tracking-wide text-ink/65">Used in the entry assessment</p>
            <p className="mt-0.5 text-ink">{accText}</p>
          </li>
        )}
      </ul>
    </details>
  );
}

type TargetDraft = { target: string; success_criteria: string; support: string; by_when: string; status: TargetStatus; review_note: string };
const blankTarget = (): TargetDraft => ({ target: "", success_criteria: "", support: "", by_when: addDays(84), status: "working_towards", review_note: "" });

function TargetsSection({ planId, targets, onChanged }: { planId: string; targets: PlanTarget[]; onChanged: () => void }) {
  const supabase = getSupabaseClient();
  const [editing, setEditing] = useState<{ id: string | null; d: TargetDraft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!supabase || !editing) return;
    if (!editing.d.target.trim()) return setErr("Write the target.");
    setBusy(true);
    setErr(null);
    const row = {
      target: editing.d.target.trim(),
      success_criteria: editing.d.success_criteria.trim() || null,
      support: editing.d.support.trim() || null,
      by_when: editing.d.by_when || null,
      status: editing.d.status,
      review_note: editing.d.review_note.trim() || null,
    };
    const { error } = editing.id
      ? await supabase.from("send_plan_targets").update(row).eq("id", editing.id)
      : await supabase.from("send_plan_targets").insert({ ...row, plan_id: planId, sort: targets.length });
    setBusy(false);
    if (error) return setErr(errText(error));
    setEditing(null);
    onChanged();
  };

  const remove = async (id: string) => {
    if (!supabase || !window.confirm("Delete this target? Mark it as achieved or not achieved instead if it has been reviewed.")) return;
    const { error } = await supabase.from("send_plan_targets").delete().eq("id", id);
    if (error) return setErr(errText(error));
    onChanged();
  };

  const d = editing?.d;
  const setD = (patch: Partial<TargetDraft>) => setEditing((e) => (e ? { ...e, d: { ...e.d, ...patch } } : e));

  return (
    <Section
      title="Targets"
      description="Specific, measurable and time-bound: what the pupil will do, how we'll know, and how we'll help."
      action={!editing && <Button size="sm" icon="plus" onClick={() => setEditing({ id: null, d: blankTarget() })}>Add target</Button>}
    >
      {err && <Notice tone="bad">{err}</Notice>}
      {targets.length === 0 && !editing && <p className="text-sm text-ink/65">No targets yet. Most plans have two to four.</p>}
      <ul className="space-y-2">
        {targets.map((t) => (
          <li key={t.id} className="rounded-xl border border-gold-light/70 p-3">
            <div className="flex flex-wrap items-start gap-2">
              <p className="min-w-0 flex-1 font-medium text-ink">{t.target}</p>
              <StatusChip tone={t.status === "achieved" ? "good" : t.status === "not_achieved" ? "bad" : t.status === "partly_achieved" ? "warn" : "info"}>{TARGET_STATUS[t.status]}</StatusChip>
            </div>
            <dl className="mt-1 grid gap-x-4 text-sm text-ink/80 sm:grid-cols-3">
              {t.success_criteria && <div><dt className="text-xs text-ink/65">How we&apos;ll know</dt><dd>{t.success_criteria}</dd></div>}
              {t.support && <div><dt className="text-xs text-ink/65">How we&apos;ll help</dt><dd>{t.support}</dd></div>}
              {t.by_when && <div><dt className="text-xs text-ink/65">By</dt><dd>{fmtDate(t.by_when)}</dd></div>}
            </dl>
            {t.review_note && <p className="mt-1 text-sm text-ink/75"><span className="text-xs text-ink/65">Review note: </span>{t.review_note}</p>}
            <div className="mt-1 flex gap-3">
              <button type="button" className={ui.btnLink} onClick={() => setEditing({ id: t.id, d: { target: t.target, success_criteria: t.success_criteria || "", support: t.support || "", by_when: t.by_when || "", status: t.status, review_note: t.review_note || "" } })}>
                Edit or update progress
              </button>
              <button type="button" className={ui.btnLinkDanger} onClick={() => remove(t.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      {editing && d && (
        <div className="mt-3 space-y-3 rounded-xl border border-teal-700/30 bg-teal-100/30 p-4">
          <Field label="Target" htmlFor="t-target" hint="What the pupil will be able to do, e.g. &quot;Read and follow a three-step written instruction without an adult&quot;">
            <textarea id="t-target" className={ui.textarea} rows={2} maxLength={1000} value={d.target} onChange={(e) => setD({ target: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="How we'll know (measurable)" htmlFor="t-crit">
              <input id="t-crit" className={ui.input} maxLength={1000} value={d.success_criteria} onChange={(e) => setD({ success_criteria: e.target.value })} placeholder="e.g. 4 out of 5 lessons over two weeks" />
            </Field>
            <Field label="How we'll help" htmlFor="t-support">
              <input id="t-support" className={ui.input} maxLength={1000} value={d.support} onChange={(e) => setD({ support: e.target.value })} placeholder="e.g. steps in the chat, ticked off as done" />
            </Field>
            <Field label="By" htmlFor="t-by">
              <input id="t-by" type="date" className={ui.input} value={d.by_when} onChange={(e) => setD({ by_when: e.target.value })} />
            </Field>
            <Field label="Progress" htmlFor="t-status">
              <Select id="t-status" className={ui.select} value={d.status} onChange={(e) => setD({ status: e.target.value as TargetStatus })}>
                {(Object.keys(TARGET_STATUS) as TargetStatus[]).map((k) => (
                  <option key={k} value={k}>
                    {TARGET_STATUS[k]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {editing.id && (
            <Field label="Review note (optional)" htmlFor="t-note">
              <input id="t-note" className={ui.input} maxLength={1500} value={d.review_note} onChange={(e) => setD({ review_note: e.target.value })} />
            </Field>
          )}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save target"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

function ReviewsSection({ planId, reviews, targets, onChanged }: { planId: string; reviews: PlanReview[]; targets: PlanTarget[]; onChanged: () => void }) {
  const supabase = getSupabaseClient();
  const blank = () => ({ held_on: addDays(0), attendees: "", parent_attended: true, pupil_views: "", notes: "", outcomes: "", next_review_due: addDays(84), shared_with_family: true });
  const [d, setD] = useState<ReturnType<typeof blank> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const open = targets.filter((t) => t.status !== "achieved" && t.status !== "not_achieved").length;

  const save = async () => {
    if (!supabase || !d) return;
    if (!d.notes.trim() && !d.outcomes.trim()) return setErr("Write what was discussed or agreed.");
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("send_plan_reviews").insert({
      plan_id: planId,
      held_on: d.held_on,
      attendees: d.attendees.trim() || null,
      parent_attended: d.parent_attended,
      pupil_views: d.pupil_views.trim() || null,
      notes: d.notes.trim() || null,
      outcomes: d.outcomes.trim() || null,
      next_review_due: d.next_review_due || null,
      shared_with_family: d.shared_with_family,
    });
    setBusy(false);
    if (error) return setErr(errText(error));
    setD(null);
    onChanged();
  };

  return (
    <Section
      title="Reviews"
      description="Review the plan with the family at least termly. Notes marked as shared appear in the Parent Portal."
      action={!d && <Button size="sm" icon="plus" onClick={() => setD(blank())}>Record a review</Button>}
    >
      {err && <Notice tone="bad">{err}</Notice>}
      {d && (
        <div className="mb-4 space-y-3 rounded-xl border border-teal-700/30 bg-teal-100/30 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Held on" htmlFor="r-on">
              <input id="r-on" type="date" className={ui.input} value={d.held_on} onChange={(e) => setD({ ...d, held_on: e.target.value })} />
            </Field>
            <Field label="Who attended" htmlFor="r-who">
              <input id="r-who" className={ui.input} maxLength={500} value={d.attendees} onChange={(e) => setD({ ...d, attendees: e.target.value })} placeholder="e.g. SENCo, form tutor, mother, pupil" />
            </Field>
          </div>
          <Switch checked={d.parent_attended} onChange={(v) => setD({ ...d, parent_attended: v })} label="A parent or carer took part" />
          <Field label="The pupil's views" htmlFor="r-views">
            <textarea id="r-views" className={ui.textarea} rows={2} maxLength={2000} value={d.pupil_views} onChange={(e) => setD({ ...d, pupil_views: e.target.value })} />
          </Field>
          <Field label="What was discussed" htmlFor="r-notes" hint={open ? `Update the ${open} open target${open === 1 ? "" : "s"} above with their progress too.` : undefined}>
            <textarea id="r-notes" className={ui.textarea} rows={4} maxLength={5000} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
          </Field>
          <Field label="Agreed actions" htmlFor="r-out">
            <textarea id="r-out" className={ui.textarea} rows={2} maxLength={3000} value={d.outcomes} onChange={(e) => setD({ ...d, outcomes: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Next review due" htmlFor="r-next">
              <input id="r-next" type="date" className={ui.input} value={d.next_review_due} onChange={(e) => setD({ ...d, next_review_due: e.target.value })} />
            </Field>
            <div className="self-end">
              <Switch checked={d.shared_with_family} onChange={(v) => setD({ ...d, shared_with_family: v })} label="Share these notes with the family" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save review"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setD(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {reviews.length === 0 ? (
        !d && <p className="text-sm text-ink/65">No reviews recorded yet.</p>
      ) : (
        <ol className="space-y-2">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-xl border border-gold-light/70 p-3 text-sm">
              <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                {fmtDate(r.held_on)}
                {r.parent_attended && <StatusChip tone="good">Parent attended</StatusChip>}
                {!r.shared_with_family && <StatusChip>Staff only</StatusChip>}
              </p>
              {r.attendees && <p className="text-xs text-ink/65">With {r.attendees}</p>}
              {r.pupil_views && <p className="mt-1 whitespace-pre-wrap text-ink/80"><span className="text-xs text-ink/65">Pupil&apos;s views: </span>{r.pupil_views}</p>}
              {r.notes && <p className="mt-1 whitespace-pre-wrap text-ink">{r.notes}</p>}
              {r.outcomes && <p className="mt-1 whitespace-pre-wrap text-ink"><span className="text-xs text-ink/65">Agreed: </span>{r.outcomes}</p>}
              {r.next_review_due && <p className="mt-1 text-xs text-ink/65">Next review set for {fmtDate(r.next_review_due)}</p>}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function ResponsesSection({ responses, onChanged }: { responses: FamilyResponse[]; onChanged: () => void }) {
  const supabase = getSupabaseClient();
  const [reply, setReply] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  if (!responses.length) return null;

  const send = async (id: string, patch: { reply?: string; seen_at?: string }) => {
    if (!supabase) return;
    setErr(null);
    const { error } = await supabase.from("send_plan_family_responses").update(patch).eq("id", id);
    if (error) return setErr(errText(error));
    setReply((r) => ({ ...r, [id]: "" }));
    onChanged();
  };

  return (
    <Section title="From the family" description="Comments and agreement the family added in the Parent Portal.">
      {err && <Notice tone="bad">{err}</Notice>}
      <ul className="space-y-2">
        {responses.map((r) => (
          <li key={r.id} className="rounded-xl border border-gold-light/70 p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2 text-xs text-ink/65">
              {fmtDate(r.created_at)}
              {r.agreed && <StatusChip tone="good">Agreed to the plan</StatusChip>}
              {!r.seen_at && r.comment && <StatusChip tone="warn">New</StatusChip>}
            </p>
            {r.comment && <p className="mt-1 whitespace-pre-wrap text-ink">{r.comment}</p>}
            {r.reply ? (
              <p className="mt-2 rounded-lg bg-cream px-3 py-2 text-ink/80">
                <span className="text-xs text-ink/65">School&apos;s reply, {fmtDate(r.replied_at)}: </span>
                {r.reply}
              </p>
            ) : (
              r.comment && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input aria-label="Reply to the family" className={`${ui.input} min-w-[14rem] flex-1`} maxLength={3000} value={reply[r.id] || ""} onChange={(e) => setReply((x) => ({ ...x, [r.id]: e.target.value }))} placeholder="Reply (the family sees this)" />
                  <Button size="sm" variant="primary" disabled={!reply[r.id]?.trim()} onClick={() => send(r.id, { reply: reply[r.id].trim() })}>
                    Reply
                  </Button>
                  {!r.seen_at && (
                    <Button size="sm" onClick={() => send(r.id, { seen_at: new Date().toISOString() })}>
                      Mark as read
                    </Button>
                  )}
                </div>
              )
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
