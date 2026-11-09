"use client";

import { Icon } from "@/components/learn/Icon";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { EmptyState, Notice, StatusChip, ui } from "@/components/learn/ui";
import { StarCertificatePreview } from "./StarCertificatePreview";
import {
  STAR_QUICK_TAGS,
  STAR_SELECT,
  STATUS_LABEL,
  candidateScore,
  certificateAction,
  firstName,
  postShoutOut,
  sentenceFromTags,
  shortDay,
  weeksBetween,
  type Candidate,
  type Star,
} from "./starData";

/** Short, factual evidence lines for one pupil's week. */
export function evidence(c: Candidate): string[] {
  const out: string[] = [];
  if (c.merits > 0) out.push(`${c.merits} merit${c.merits === 1 ? "" : "s"} (+${c.merit_points})`);
  if (c.homework_set > 0) out.push(`${c.homework_done}/${c.homework_set} homework`);
  if (c.lessons > 0) out.push(`${c.attended}/${c.lessons} lessons`);
  if (c.quran_sessions > 0) out.push(c.quran_average != null ? `Qur'an ${Number(c.quran_average)}/10` : `${c.quran_sessions} Qur'an session${c.quran_sessions === 1 ? "" : "s"}`);
  return out;
}

export function StarHistoryChip({ c, weekStart }: { c: Candidate; weekStart: string }) {
  if (c.stars_this_term === 0) return <StatusChip tone="good">Not star yet this term</StatusChip>;
  const ago = c.last_star_week ? weeksBetween(c.last_star_week, weekStart) : null;
  return (
    <StatusChip tone="warn">
      Star {c.stars_this_term}× this term{ago !== null && ago > 0 ? ` · ${ago} week${ago === 1 ? "" : "s"} ago` : ""}
    </StatusChip>
  );
}

type Draft = { childId: string; tags: string[]; reason: string; reasonEdited: boolean; message: string };
const EMPTY: Draft = { childId: "", tags: [], reason: "", reasonEdited: false, message: "" };

/** The weekly flow for one class: who stood out, choose, say why, preview, submit. */
export function StarWeek({ isHead, classId, className, weekStart, me, onChanged }: { isHead: boolean; classId: string; className: string; weekStart: string; me: { id: string } | null; onChanged: () => void }) {
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [star, setStar] = useState<Star | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !classId) return;
    const [c, s] = await Promise.all([
      supabase.rpc("star_candidates", { p_class_id: classId, p_week_start: weekStart }),
      supabase.from("star_of_the_week").select(STAR_SELECT).eq("class_id", classId).eq("week_start", weekStart).maybeSingle(),
    ]);
    let list = (c.data as Candidate[] | null) || [];
    if (c.error) {
      // Without this week's figures (e.g. before migration 0131), still let the teacher choose from the class.
      const { data: en } = await supabase.from("enrolments").select("child_id, children(name, hide_from_leaderboard)").eq("class_id", classId);
      list = ((en as unknown as { child_id: string; children: { name: string; hide_from_leaderboard: boolean } | null }[]) || [])
        .filter((r) => r.children)
        .map((r) => ({ child_id: r.child_id, child_name: r.children!.name, hidden: r.children!.hide_from_leaderboard, merits: 0, merit_points: 0, net_points: 0, homework_set: 0, homework_done: 0, quran_sessions: 0, quran_average: null, lessons: 0, attended: 0, stars_this_term: 0, stars_all_time: 0, last_star_week: null }));
      setMsg({ tone: "bad", text: "This week's figures couldn't load, so there are no suggestions. You can still choose from the class." });
    }
    setCands(list);
    setStar((s.data as unknown as Star | null) || null);
  }, [classId, weekStart]);

  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      if (!alive) return;
      setCands(null);
      setStar(undefined);
      setDraft(EMPTY);
      setEditing(false);
      setMsg(null);
      await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const ranked = useMemo(() => [...(cands || [])].sort((a, b) => candidateScore(b) - candidateScore(a) || a.child_name.localeCompare(b.child_name)), [cands]);
  const suggested = ranked.filter((c) => candidateScore(c) > 0).slice(0, 3);
  const chosen = (cands || []).find((c) => c.child_id === draft.childId) || null;

  const toggleTag = (t: string) =>
    setDraft((d) => {
      const tags = d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags, t];
      return { ...d, tags, reason: d.reasonEdited ? d.reason : sentenceFromTags(tags) };
    });

  const startEdit = (s: Star) => {
    setDraft({ childId: s.child_id, tags: s.reasons || [], reason: s.reason, reasonEdited: true, message: s.message || "" });
    setEditing(true);
  };

  const submit = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !draft.childId || draft.reason.trim().length < 3) return;
    setBusy(true);
    setMsg(null);
    const fields = { child_id: draft.childId, reason: draft.reason.trim().slice(0, 300), reasons: draft.tags, message: draft.message.trim() || null };
    const { error } =
      editing && star
        ? await supabase.from("star_of_the_week").update(fields).eq("id", star.id)
        : await supabase.from("star_of_the_week").insert({ ...fields, class_id: classId, week_start: weekStart, status: isHead ? "approved" : "nominated" });
    setBusy(false);
    if (error) {
      setMsg({ tone: "bad", text: error.code === "23505" ? "This class already has a star for that week." : `Couldn't save: ${error.message}` });
      return;
    }
    setMsg({ tone: "good", text: editing ? "Nomination updated." : isHead ? "Star added and approved. You can post the shout-out and make the certificate below." : `${firstName(chosen?.child_name || "")} has been nominated. The Headteacher will approve it.` });
    setEditing(false);
    setDraft(EMPTY);
    await load();
    onChanged();
  };

  const act = async (kind: "withdraw" | "certificate" | "email" | "shout") => {
    if (!star) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    try {
      if (kind === "withdraw") {
        if (!window.confirm("Withdraw this nomination?")) return;
        const { error } = await supabase.from("star_of_the_week").delete().eq("id", star.id);
        if (error) throw new Error("Couldn't withdraw that nomination.");
        setMsg({ tone: "good", text: "Nomination withdrawn." });
      } else if (kind === "shout") {
        if (!me) return;
        const err = await postShoutOut(star, me.id);
        if (err) throw new Error(`Couldn't post the shout-out: ${err}`);
        setMsg({ tone: "good", text: "Shout-out posted to the class." });
      } else {
        const r = await certificateAction(star, kind === "email");
        if (!r.ok) throw new Error(r.text || "Something went wrong.");
        if (r.text) setMsg({ tone: "good", text: r.text });
      }
      await load();
      onChanged();
    } catch (e) {
      setMsg({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (cands === null || star === undefined) return <div className="h-48 motion-safe:animate-pulse rounded-2xl bg-white" />;
  if (cands.length === 0) return <EmptyState title="No pupils in this class yet" icon="star" tile="tile-gold" />;

  // ── This week's star is already chosen ──
  if (star && !editing) {
    const hidden = !!star.children?.hide_from_leaderboard;
    return (
      <div className="space-y-3">
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <section className={`${ui.card} grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]`}>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-ink">{star.children?.name || "Pupil"}</h2>
              <StatusChip tone={star.status === "approved" ? "good" : star.status === "declined" ? "neutral" : "warn"}>{STATUS_LABEL[star.status]}</StatusChip>
            </div>
            <p className="text-sm text-ink/80">{star.reason}</p>
            {star.message && <p className="text-sm italic text-ink/65">&ldquo;{star.message}&rdquo;</p>}
            <p className="text-xs text-ink/65">
              Nominated{star.nominator?.full_name ? ` by ${star.nominator.full_name}` : ""} · {className} · week beginning {shortDay(star.week_start)}
            </p>
            {star.status === "declined" && star.decision_note && <p className="text-xs text-ink/70">Note from the Headteacher: {star.decision_note}</p>}
            {star.status === "declined" && !isHead && <p className="text-xs text-ink/70">Ask the Headteacher if you&apos;d like to nominate someone else this week.</p>}
            {hidden && <p className="text-xs text-ink/65">The family has opted out of the leaderboard: no public shout-out, and the certificate stays private to them.</p>}
            {star.announced_at && <p className="text-xs text-green-800">Shout-out posted to the class.</p>}
            {star.certificate_emailed_at && <p className="text-xs text-green-800">Certificate emailed to the family on {new Date(star.certificate_emailed_at).toLocaleDateString("en-GB")}.</p>}
            <div className="flex flex-wrap gap-2 pt-2">
              {star.status === "nominated" && (
                <>
                  <button type="button" disabled={busy} onClick={() => startEdit(star)} className={`${ui.btnSecondary} ${ui.sm}`}>
                    Change
                  </button>
                  <button type="button" disabled={busy} onClick={() => act("withdraw")} className={`${ui.btnSecondary} ${ui.sm}`}>
                    Withdraw
                  </button>
                </>
              )}
              {star.status === "approved" && (
                <>
                  <button type="button" disabled={busy} onClick={() => act("certificate")} className={`${ui.btnPrimary} ${ui.sm}`}>
                    {star.certificate_path ? "Open certificate" : "Make certificate"}
                  </button>
                  {isHead && (
                    <button type="button" disabled={busy} onClick={() => act("email")} className={`${ui.btnSecondary} ${ui.sm}`}>
                      {star.certificate_emailed_at ? "Email again" : "Email to family"}
                    </button>
                  )}
                  {!hidden && !star.announced_at && (
                    <button type="button" disabled={busy} onClick={() => act("shout")} className={`${ui.btnSecondary} ${ui.sm}`}>
                      Post class shout-out
                    </button>
                  )}
                </>
              )}
              {star.status === "declined" && isHead && (
                <button type="button" disabled={busy} onClick={() => act("withdraw")} className={`${ui.btnSecondary} ${ui.sm}`}>
                  Clear and choose again
                </button>
              )}
            </div>
          </div>
          <StarCertificatePreview name={star.children?.name || ""} reason={star.reason} message={star.message} className={className} weekStart={star.week_start} />
        </section>
      </div>
    );
  }

  // ── Choosing this week's star ──
  const step = !draft.childId ? 1 : draft.reason.trim().length < 3 ? 2 : 3;
  const row = (c: Candidate) => {
    const on = draft.childId === c.child_id;
    return (
      <li key={c.child_id}>
        <button
          type="button"
          aria-pressed={on}
          onClick={() => setDraft((d) => ({ ...d, childId: on ? "" : c.child_id }))}
          className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2.5 text-left transition ${on ? "border-teal-700 bg-teal-100/40 ring-1 ring-teal-700" : "border-gold-light bg-white hover:bg-cream"}`}
        >
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-teal-700 bg-teal-700 text-white" : "border-ink/30"}`} aria-hidden="true">
            {on ? <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">
              {c.child_name}
              {c.hidden && <span className="ml-2 text-xs font-normal text-ink/60">private: no public shout-out</span>}
            </span>
            <span className="block text-xs text-ink/65">{evidence(c).join(" · ") || "Nothing recorded this week yet"}</span>
          </span>
          <StarHistoryChip c={c} weekStart={weekStart} />
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-3">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-4">
          <section className={ui.card} aria-labelledby="step1">
            <StepHead n={1} id="step1" title="Choose a pupil" done={step > 1} />
            {suggested.length > 0 ? (
              <>
                <p className="mt-1 text-xs text-ink/65">Suggested from this week&apos;s merits, homework, attendance and Qur&apos;an, with pupils who haven&apos;t been star this term first. A suggestion, not a rule.</p>
                <ul className="mt-3 space-y-2">{suggested.map(row)}</ul>
              </>
            ) : (
              <p className="mt-1 text-xs text-ink/65">Nothing has been recorded for this class this week yet, so there are no suggestions. Choose from the class below.</p>
            )}
            <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll || suggested.length === 0} className={`mt-3 ${ui.btnLink}`}>
              {showAll || suggested.length === 0 ? "Hide the whole class" : `Show the whole class (${ranked.length})`}
            </button>
            {(showAll || suggested.length === 0) && <ul className="mt-2 max-h-[28rem] space-y-2 overflow-y-auto pr-1">{[...ranked].sort((a, b) => a.child_name.localeCompare(b.child_name)).map(row)}</ul>}
          </section>

          <section className={`${ui.card} ${step < 2 ? "opacity-60" : ""}`} aria-labelledby="step2">
            <StepHead n={2} id="step2" title={chosen ? `Why is ${firstName(chosen.child_name)} the star?` : "Why are they the star?"} done={step > 2} />
            <div role="group" aria-label="Reasons" className="mt-3 flex flex-wrap gap-1.5">
              {STAR_QUICK_TAGS.map((t) => {
                const on = draft.tags.includes(t);
                return (
                  <button key={t} type="button" disabled={!draft.childId} aria-pressed={on} onClick={() => toggleTag(t)} className={`${on ? ui.chipOn : ui.chip} !py-1 !text-xs`}>
                    <Icon name={on ? "check" : "plus"} className="h-3.5 w-3.5" strokeWidth={2.25} />
                    {t}
                  </button>
                );
              })}
            </div>
            <label className={`mt-3 ${ui.label}`}>
              On the certificate and in the shout-out
              <textarea
                disabled={!draft.childId}
                value={draft.reason}
                maxLength={300}
                rows={2}
                onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value, reasonEdited: e.target.value.trim() !== "" }))}
                className={`mt-1 ${ui.input}`}
                placeholder="Tap reasons above, or write your own sentence."
              />
            </label>
            <p className={`mt-1 ${ui.hint}`}>{draft.reason.length}/300</p>
            <label className={`mt-3 ${ui.label}`}>
              Personal message to the pupil (optional)
              <textarea disabled={!draft.childId} value={draft.message} maxLength={400} rows={2} onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))} className={`mt-1 ${ui.input}`} placeholder="Printed on the certificate. Not shown in the shout-out." />
            </label>
          </section>

          <section className={`${ui.card} ${step < 3 ? "opacity-60" : ""}`} aria-labelledby="step3">
            <StepHead n={3} id="step3" title={isHead ? "Approve" : "Submit for approval"} done={false} />
            <p className="mt-1 text-xs text-ink/65">
              {isHead ? "As Headteacher your choice is approved straight away. You can then post the class shout-out and make the certificate." : "The Headteacher approves it, then the family gets the certificate and the class sees the shout-out."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy || step < 3} onClick={submit} className={ui.btnPrimary}>
                {busy ? "Saving…" : editing ? "Save changes" : isHead ? "Approve as star" : "Submit nomination"}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setDraft(EMPTY);
                  }}
                  className={ui.btnSecondary}
                >
                  Cancel
                </button>
              )}
            </div>
          </section>
        </div>
        <div className="lg:sticky lg:top-4 lg:self-start">
          <StarCertificatePreview name={chosen?.child_name || ""} reason={draft.reason} message={draft.message} className={className} weekStart={weekStart} />
        </div>
      </div>
    </div>
  );
}

function StepHead({ n, id, title, done }: { n: number; id: string; title: string; done: boolean }) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-sm font-semibold text-ink">
      <span aria-hidden="true" className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-green-600 text-white" : "bg-gold-700 text-white"}`}>
        {done ? <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.5} /> : n}
      </span>
      {title}
    </h2>
  );
}
