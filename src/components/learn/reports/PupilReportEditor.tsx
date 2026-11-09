"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Tabs } from "@/components/learn/Tabs";
import { Notice, StatusChip, ui } from "@/components/learn/ui";
import { ReportDocument, fmtPct } from "./ReportDocument";
import { ReportAiDraft } from "./ReportAiDraft";
import {
  ATTAINMENT_OPTIONS,
  EFFORT_OPTIONS,
  asNarrative,
  buildClassSummaries,
  mergeNarrative,
  termRange,
  withRating,
  type ClassSummary,
  type ReportNarrative,
  type SubjectRating,
  type TermOption,
} from "./summary";
import { REPORT_COLS, STATE_LABEL, firstName, loadEnrolments, loadIssuedChildren, loadTermReports, reportsHref, stateOf, type ClassInfo, type Mode, type Pupil, type ReportRow } from "./data";
import { Select } from "@/components/learn/Select";

type Snippet = { id: string; text: string };
type Version = { overall_comment: string | null; narrative: unknown; released_at: string | null; subject_comments: Record<string, string> | null };

/** A ready-made sentence built from the recorded figures, for the teacher to keep or reword. */
type Prompt = { key: string; hint: string; sentence: string };

function promptsFor(name: string, s: ClassSummary | undefined, termLabel: string): Prompt[] {
  if (!s) return [];
  const fn = firstName(name);
  const period = termLabel === "All time" ? "so far" : "this term";
  const out: Prompt[] = [];
  const a = s.attendance;
  if (a.rate !== null) {
    if (a.rate >= 96) out.push({ key: "att", hint: `Attendance ${a.rate}%: excellent`, sentence: `${fn} has attended ${a.rate}% of lessons ${period}, which shows real commitment.` });
    else if (a.rate >= 90) out.push({ key: "att", hint: `Attendance ${a.rate}%`, sentence: `${fn}'s attendance ${period} was ${a.rate}%.` });
    else out.push({ key: "att", hint: `Attendance ${a.rate}%: below 90%`, sentence: `${fn} attended ${a.rate}% of lessons ${period}; attending every lesson will help them keep up with new learning.` });
  }
  const h = s.homework;
  if (h.total > 0) {
    if (h.done === h.total) out.push({ key: "hw", hint: `Homework ${h.done}/${h.total}: all handed in`, sentence: `${fn} handed in every homework task (${h.done} of ${h.total}).` });
    else out.push({ key: "hw", hint: `Homework ${h.done}/${h.total}`, sentence: `${fn} completed ${h.done} of ${h.total} homework tasks; handing in every task will help to secure their learning.` });
  }
  const b = s.behaviour;
  if (b && b.merits > 0) out.push({ key: "merits", hint: `${b.merits} merit${b.merits === 1 ? "" : "s"}`, sentence: `${fn} earned ${b.merits} merit${b.merits === 1 ? "" : "s"} ${period} for their effort and conduct.` });
  const q = s.quran;
  if (q.average_score !== null && q.average_score !== undefined) {
    out.push({ key: "quran", hint: `Qur'an ${q.average_score}/10${q.trend ? `, ${q.trend}` : ""}`, sentence: `In Qur'an, ${fn} averaged ${q.average_score} out of 10${q.trend ? ` and is ${q.trend}` : ""}${q.latest ? `, most recently working on ${q.latest}` : ""}.` });
  } else if (q.latest) {
    out.push({ key: "quran", hint: `Qur'an: ${q.latest}`, sentence: `In Qur'an, ${fn} is currently working on ${q.latest}.` });
  }
  const as = s.assessments;
  if (as.average_percent !== null) out.push({ key: "assess", hint: `Assessments average ${fmtPct(as.average_percent)}`, sentence: `Across ${as.count} assessment${as.count === 1 ? "" : "s"}, ${fn} averaged ${fmtPct(as.average_percent)}.` });
  return out;
}

const fillName = (text: string, name: string) => text.replace(/\{(name|first|first_name)\}/gi, firstName(name)).replace(/\{full_name\}/gi, name);
const append = (cur: string, add: string) => (cur.trim() ? `${cur.trim().replace(/\s+$/, "")} ${add}` : add);

/** One pupil's report for one class: the figures, the teacher's judgement and comment, and the next step. */
export function PupilReportEditor({
  mode,
  cls,
  term,
  termKey,
  termLabel,
  childId,
  me,
  onChanged,
  onNavigate,
}: {
  mode: Mode;
  cls: ClassInfo;
  term: TermOption | null;
  termKey: string;
  termLabel: string;
  childId: string;
  me: { id: string; name: string } | null;
  onChanged: () => void;
  onNavigate: (childId: string) => void;
}) {
  const [roster, setRoster] = useState<Pupil[] | null>(null);
  const [rep, setRep] = useState<ReportRow | null | undefined>(undefined);
  const [issued, setIssued] = useState(false);
  const [version, setVersion] = useState<Version | null>(null);
  const [live, setLive] = useState<ClassSummary | undefined>(undefined);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [comment, setComment] = useState("");
  const [rating, setRating] = useState<SubjectRating>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad" | "warn"; text: string } | null>(null);
  const [pane, setPane] = useState<"write" | "preview">("write");
  const [returning, setReturning] = useState<string | null>(null);
  const [bankQ, setBankQ] = useState("");
  const [printing, setPrinting] = useState(false);
  const req = useRef(0);

  // The class list, once (for Previous / Next) and the comment bank.
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const [enrol, { data: snip }] = await Promise.all([loadEnrolments(supabase, [cls.id]), supabase.from("comment_bank").select("id, text").order("created_at", { ascending: false }).limit(60)]);
      if (!alive) return;
      setRoster(enrol[cls.id] || []);
      setSnippets((snip as Snippet[]) || []);
    })();
    return () => {
      alive = false;
    };
  }, [cls.id]);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const n = ++req.current;
    const [reps, iss, sums] = await Promise.all([loadTermReports(supabase, term?.id || null, [childId]), loadIssuedChildren(supabase, term?.id || null, [childId]), buildClassSummaries(supabase, { id: cls.id, name: cls.name }, [childId], termRange(term))]);
    const row = reps[childId] || null;
    let ver: Version | null = null;
    if (iss.has(childId)) {
      let vq = supabase.from("term_report_versions").select("overall_comment, narrative, released_at, subject_comments").eq("child_id", childId);
      vq = term ? vq.eq("term_id", term.id) : vq.is("term_id", null);
      const { data } = await vq.order("version", { ascending: false }).limit(1);
      ver = ((data as Version[] | null) || [])[0] || null;
    }
    if (n !== req.current) return;
    setRep(row);
    setIssued(iss.has(childId));
    setVersion(ver);
    setLive(sums[childId]);
    setComment(row?.overall_comment || "");
    setRating(asNarrative(row?.narrative)?.ratings?.[cls.id] || {});
    setDirty(false);
    setReturning(null);
  }, [childId, cls.id, cls.name, term]);

  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      if (alive) {
        setRep(undefined);
        setMsg(null);
        await load();
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const pupil = roster?.find((p) => p.id === childId) || null;
  const idx = roster ? roster.findIndex((p) => p.id === childId) : -1;
  const state = stateOf(rep || undefined, issued);
  const status = rep?.status || null;
  const canEdit = status === null ? state !== "released" : status === "released" ? false : mode === "admin" ? true : status === "draft" || status === "pending_approval";

  // What the report looks like with what's on screen now.
  const previewNarrative = useMemo<ReportNarrative | null>(() => {
    if (!canEdit && state === "released") return asNarrative((rep?.status === "released" ? rep?.narrative : null) ?? version?.narrative);
    const stored = asNarrative(rep?.narrative);
    const base = live ? mergeNarrative(stored, live, termLabel) : stored;
    return base ? withRating(base, cls.id, { ...rating, by: rating.by || me?.name || null }) : null;
  }, [canEdit, state, rep, version, live, termLabel, cls.id, rating, me]);

  const prompts = useMemo(() => promptsFor(pupil?.name || "", live, termLabel), [pupil, live, termLabel]);
  const bank = useMemo(() => {
    const q = bankQ.trim().toLowerCase();
    return snippets.filter((s) => !q || s.text.toLowerCase().includes(q)).slice(0, 12);
  }, [snippets, bankQ]);

  /** Save what's on screen. Re-reads the stored narrative first so another class's section is never overwritten. */
  const save = async (nextStatus?: string): Promise<boolean> => {
    const supabase = getSupabaseClient();
    if (!supabase || !me || !pupil) return false;
    setBusy(true);
    setMsg(null);
    try {
      let stored: ReportNarrative | null = null;
      let current: { id: string; status: string } | null = null;
      if (rep) {
        const { data } = await supabase.from("term_reports").select(REPORT_COLS).eq("id", rep.id).maybeSingle();
        const fresh = data as ReportRow | null;
        stored = asNarrative(fresh?.narrative);
        current = fresh ? { id: fresh.id, status: fresh.status } : null;
      }
      let narrative = live ? mergeNarrative(stored, live, termLabel) : stored;
      if (narrative) narrative = withRating(narrative, cls.id, { ...rating, by: me.name || rating.by || null });
      const payload: Record<string, unknown> = { overall_comment: comment.trim() || null, narrative };
      if (nextStatus) payload.status = nextStatus;
      if (current) {
        if (mode === "teach") payload.written_by = me.id;
        const { error } = await supabase.from("term_reports").update(payload).eq("id", current.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("term_reports").insert({ child_id: pupil.id, term_id: term ? term.id : null, written_by: me.id, status: nextStatus || "draft", ...payload });
        if (error) throw error;
      }
      const name = firstName(pupil.name);
      setMsg({ tone: "good", text: nextStatus === "released" ? `Issued ${name}'s report to the family.` : nextStatus === "pending_approval" ? `Submitted ${name}'s report for approval.` : `Saved ${name}'s report.` });
      setDirty(false);
      await load();
      onChanged();
      return true;
    } catch (e) {
      setMsg({ tone: "bad", text: `Couldn't save: ${(e as { message?: string }).message || "please try again."}` });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const sendBack = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !rep || returning === null) return;
    if (!returning.trim()) return setMsg({ tone: "warn", text: "Say what needs changing, so the teacher knows." });
    setBusy(true);
    const { error } = await supabase.from("term_reports").update({ status: "draft", returned_reason: returning.trim() }).eq("id", rep.id);
    setBusy(false);
    if (error) return setMsg({ tone: "bad", text: `Couldn't send it back: ${error.message}` });
    setMsg({ tone: "good", text: "Sent back to the teacher with your note." });
    await load();
    onChanged();
  };

  const reopen = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !rep) return;
    setBusy(true);
    const { error } = await supabase.from("term_reports").update({ status: "draft", returned_reason: "Reopened for a correction." }).eq("id", rep.id);
    setBusy(false);
    if (error) return setMsg({ tone: "bad", text: `Couldn't reopen: ${error.message}` });
    setMsg({ tone: "good", text: "Reopened. The family still sees the issued copy until you issue it again." });
    await load();
    onChanged();
  };

  const move = async (dir: -1 | 1) => {
    if (!roster) return;
    const next = roster[idx + dir];
    if (!next) return;
    if (dirty && canEdit) {
      const ok = await save();
      if (!ok) return;
    }
    onNavigate(next.id);
  };

  const print = () => {
    setPrinting(true);
    window.addEventListener("afterprint", () => setPrinting(false), { once: true });
    setTimeout(() => window.print(), 100);
  };

  const missing: string[] = [];
  if (!comment.trim()) missing.push("a comment");
  if (!live && !asNarrative(rep?.narrative)) missing.push("the figures");

  if (roster !== null && !pupil) {
    return (
      <div className={ui.card}>
        <p className="text-sm text-ink/75">That pupil isn&apos;t in {cls.name}.</p>
        <Link href={reportsHref(mode, { view: "class", term: termKey, cls: cls.id })} className={`mt-3 ${ui.btnSecondary}`}>
          Back to {cls.name}
        </Link>
      </div>
    );
  }

  const loading = rep === undefined || !pupil;

  return (
    <div className="space-y-4">
      {/* Who, where in the class, and moving on. */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gold-light bg-white px-3 py-2.5 print:hidden">
        <button type="button" className={`${ui.btnSecondary} ${ui.sm}`} disabled={busy || idx <= 0} onClick={() => move(-1)}>
          ‹ Previous
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-ink">{pupil?.name || "Loading…"}</p>
          <p className="text-xs text-ink/65">
            {cls.name} · {termLabel}
            {roster && idx >= 0 ? ` · ${idx + 1} of ${roster.length}` : ""}
          </p>
        </div>
        <button type="button" className={`${ui.btnSecondary} ${ui.sm}`} disabled={busy || !roster || idx < 0 || idx >= roster.length - 1} onClick={() => move(1)}>
          {dirty && canEdit ? "Save and next ›" : "Next ›"}
        </button>
      </div>

      {msg && (
        <div className="print:hidden">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}

      {loading ? (
        <div className="h-64 animate-pulse rounded-2xl bg-white" />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone={state === "released" ? "good" : state === "pending" || state === "returned" ? "warn" : state === "draft" ? "info" : "neutral"}>{STATE_LABEL[state]}</StatusChip>
              {dirty && <span className="text-xs text-amber-900">Unsaved changes</span>}
            </div>
            <Tabs
              variant="switch"
              label="Write or preview"
              value={pane}
              onChange={setPane}
              className="lg:hidden"
              items={[
                { key: "write", label: "Write" },
                { key: "preview", label: "Preview" },
              ]}
            />
          </div>

          {rep?.status === "draft" && rep.returned_reason && (
            <Notice tone="warn">
              <span className="font-semibold">Sent back by the Headteacher:</span> {rep.returned_reason}
            </Notice>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className={`space-y-4 print:hidden ${pane === "preview" ? "hidden lg:block" : ""}`}>
              <Figures s={live} />

              <section className={ui.card} aria-labelledby="subject-h">
                <h2 id="subject-h" className="text-sm font-semibold text-ink">
                  {cls.name}: your judgement
                </h2>
                <p className={ui.hint}>Shown in this class&apos;s section of the report.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className={ui.label}>
                    Attainment
                    <Select disabled={!canEdit} value={rating.attainment || ""} onChange={(e) => { setRating((r) => ({ ...r, attainment: e.target.value || null })); setDirty(true); }} className={`mt-1 ${ui.input}`}>
                      <option value="">Not given</option>
                      {ATTAINMENT_OPTIONS.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </Select>
                  </label>
                  <label className={ui.label}>
                    Effort
                    <Select disabled={!canEdit} value={rating.effort || ""} onChange={(e) => { setRating((r) => ({ ...r, effort: e.target.value || null })); setDirty(true); }} className={`mt-1 ${ui.input}`}>
                      <option value="">Not given</option>
                      {EFFORT_OPTIONS.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </Select>
                  </label>
                </div>
                <label className={`mt-3 ${ui.label}`}>
                  Subject comment (optional)
                  <textarea disabled={!canEdit} rows={2} maxLength={600} value={rating.comment || ""} onChange={(e) => { setRating((r) => ({ ...r, comment: e.target.value })); setDirty(true); }} className={`mt-1 ${ui.input}`} placeholder="One or two sentences on this subject." />
                </label>
              </section>

              <section className={ui.card} aria-labelledby="comment-h">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="comment-h" className="text-sm font-semibold text-ink">
                    Comment for {firstName(pupil.name)}
                  </h2>
                  <span className={`text-xs tabular-nums ${comment.length > 1200 ? "text-amber-900" : "text-ink/65"}`}>{comment.length} characters · aim for 400 to 1,000</span>
                </div>
                <textarea
                  id="report-comment"
                  aria-labelledby="comment-h"
                  rows={7}
                  disabled={!canEdit}
                  value={comment}
                  onChange={(e) => { setComment(e.target.value); setDirty(true); }}
                  className={`mt-2 ${ui.input}`}
                  placeholder="What went well, one thing to work on next, and how home can help."
                />
                {canEdit && (
                  <ReportAiDraft
                    key={childId}
                    childId={childId}
                    firstName={firstName(pupil.name)}
                    yearGroup={cls.group}
                    subject={cls.name}
                    rating={rating}
                    live={live}
                    comment={comment}
                    onUse={(text, how) => {
                      setComment((c) => (how === "append" ? append(c, text) : text));
                      setDirty(true);
                    }}
                  />
                )}
                {canEdit && prompts.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-ink/75">From the figures (tap to add, then reword):</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {prompts.map((p) => (
                        <button key={p.key} type="button" onClick={() => { setComment((c) => append(c, p.sentence)); setDirty(true); }} className={`${ui.chip} !py-1 !text-xs`}>
                          + {p.hint}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {canEdit && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-teal-700">Comment bank ({snippets.length})</summary>
                    {snippets.length === 0 ? (
                      <p className="mt-2 text-xs text-ink/65">{mode === "admin" ? "Add reusable sentences under Settings." : "The office hasn't added any sentences yet."}</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <input type="search" value={bankQ} onChange={(e) => setBankQ(e.target.value)} placeholder="Search the comment bank" aria-label="Search the comment bank" className={ui.input} />
                        <ul className="max-h-56 space-y-1 overflow-y-auto">
                          {bank.map((s) => (
                            <li key={s.id}>
                              <button type="button" onClick={() => { setComment((c) => append(c, fillName(s.text, pupil.name))); setDirty(true); }} className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-ink/80 hover:bg-cream">
                                + {fillName(s.text, pupil.name)}
                              </button>
                            </li>
                          ))}
                        </ul>
                        <p className={ui.hint}>Write {"{name}"} in a bank sentence and it becomes the pupil&apos;s first name.</p>
                      </div>
                    )}
                  </details>
                )}
              </section>

              <section className={`${ui.card} space-y-3`}>
                {canEdit && missing.length > 0 && <p className="text-xs text-ink/70">Before it can be {mode === "admin" ? "issued" : "submitted"}, this report needs {missing.join(" and ")}.</p>}
                <div className="flex flex-wrap gap-2">
                  {canEdit && (
                    <button type="button" disabled={busy || !dirty} onClick={() => save()} className={ui.btnSecondary}>
                      {busy ? "Saving…" : "Save draft"}
                    </button>
                  )}
                  {mode === "teach" && canEdit && (
                    <button type="button" disabled={busy || missing.length > 0 || (status === "pending_approval" && !dirty)} onClick={() => save("pending_approval")} className={ui.btnPrimary}>
                      {status === "pending_approval" ? "Resubmit" : "Submit for approval"}
                    </button>
                  )}
                  {mode === "admin" && canEdit && (
                    <button type="button" disabled={busy || missing.length > 0} onClick={() => save("released")} className={ui.btnPrimary}>
                      Approve and issue
                    </button>
                  )}
                  {mode === "admin" && status === "pending_approval" && returning === null && (
                    <button type="button" disabled={busy} onClick={() => setReturning("")} className={ui.btnSecondary}>
                      Send back
                    </button>
                  )}
                  {mode === "admin" && status === "released" && (
                    <button type="button" disabled={busy} onClick={reopen} className={ui.btnSecondary}>
                      Reopen for a correction
                    </button>
                  )}
                  <button type="button" onClick={print} className={ui.btnSecondary}>
                    Print or save as PDF
                  </button>
                </div>
                {returning !== null && (
                  <div>
                    <label htmlFor="return-note" className={ui.label}>
                      What needs changing? The teacher sees this.
                    </label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <input id="return-note" value={returning} onChange={(e) => setReturning(e.target.value)} className={`min-w-0 flex-1 ${ui.input}`} placeholder="e.g. Please mention progress in Qur'an recitation." />
                      <button type="button" disabled={busy} onClick={sendBack} className={ui.btnPrimary}>
                        Send back
                      </button>
                      <button type="button" onClick={() => setReturning(null)} className={ui.btnSecondary}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {!canEdit && state === "released" && <p className={ui.hint}>This report has been issued. {mode === "admin" ? "Reopen it to make a correction; the family keeps the issued copy until you issue it again." : "Ask the Headteacher if something needs correcting."}</p>}
                {!canEdit && state === "pending" && mode === "teach" && <p className={ui.hint}>With the Headteacher for approval.</p>}
                {mode === "teach" && canEdit && <p className={ui.hint}>Once submitted, the Headteacher approves it and issues it to the family.</p>}
              </section>
            </div>

            <div className={`${pane === "write" ? "hidden lg:block" : ""} print:block`}>
              <div className="lg:sticky lg:top-4">
                <p className="mb-2 text-xs font-medium text-ink/65 print:hidden">What the family will see</p>
                <ReportDocument
                  childName={pupil.name}
                  termLabel={termLabel}
                  status={state === "released" ? "released" : status || undefined}
                  issuedAt={state === "released" ? version?.released_at : undefined}
                  narrative={previewNarrative}
                  comment={(canEdit ? comment : rep?.overall_comment ?? version?.overall_comment) || null}
                  printing={printing}
                  live={canEdit}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Figures({ s }: { s: ClassSummary | undefined }) {
  if (!s) return <div className="h-24 animate-pulse rounded-2xl bg-white" />;
  const a = s.attendance;
  const h = s.homework;
  const b = s.behaviour;
  const q = s.quran;
  const as = s.assessments;
  const items = [
    { label: "Attendance", value: fmtPct(a.rate), sub: a.total ? `${a.attended} of ${a.attended + a.absent} lessons` : "No lessons recorded" },
    { label: "Homework", value: h.total ? `${h.done}/${h.total}` : "–", sub: h.total ? `${h.rate}% handed in` : "None set" },
    { label: "Merits", value: b ? String(b.merits) : "–", sub: b ? `${b.demerits} demerit${b.demerits === 1 ? "" : "s"} · net ${b.net_points > 0 ? "+" : ""}${b.net_points}` : "" },
    { label: "Qur'an", value: q.average_score != null ? `${q.average_score}/10` : q.entries ? String(q.entries) : "–", sub: q.entries ? [q.trend, q.latest].filter(Boolean).join(" · ") || `${q.entries} entries` : "No entries" },
    { label: "Assessments", value: fmtPct(as.average_percent), sub: as.count ? `${as.count} recorded` : "None recorded" },
  ];
  return (
    <section className={ui.card} aria-labelledby="figs-h">
      <h2 id="figs-h" className="text-sm font-semibold text-ink">
        Figures for {s.class_name}
      </h2>
      <p className={ui.hint}>Filled in from the registers, homework, behaviour, Qur&apos;an and assessment records. They refresh each time you save.</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((i) => (
          <div key={i.label} className="rounded-lg bg-cream/60 p-2.5">
            <dt className="text-[11px] text-ink/65">{i.label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-ink">{i.value}</dd>
            {i.sub && <dd className="text-[11px] text-ink/65">{i.sub}</dd>}
          </div>
        ))}
      </dl>
      {as.items.length > 0 && (
        <ul className="mt-3 divide-y divide-gold-light/40 text-sm">
          {as.items.map((it, i) => (
            <li key={`${it.title}-${i}`} className="flex justify-between gap-3 py-1">
              <span className="min-w-0 truncate text-ink/80">{it.title}</span>
              <span className="shrink-0 text-ink/70">
                {it.percent === null ? "–" : `${Math.round(it.percent)}%`}
                {it.grade ? ` · ${it.grade}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
