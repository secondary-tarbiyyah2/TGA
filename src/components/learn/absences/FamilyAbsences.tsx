"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/learn/PageHeader";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDateKey, shiftDateKey, ukToday } from "@/lib/learn/ukTime";
import { STATUS_LABEL, fetchAbsences, fetchNotes, formatDay, formatRange, type Absence, type AbsenceNote, type NoteStatus } from "./data";
import { ui } from "@/components/learn/ui";

type Child = { id: string; name: string };
const CHIP: Record<NoteStatus, string> = {
  undecided: "bg-amber-50 text-amber-900",
  authorised: "bg-green-50 text-green-800",
  unauthorised: "bg-red-50 text-red-800",
};
const fieldCls = `mt-1 ${ui.input}`;
const REASONS = ["Unwell", "Medical or dental appointment", "Family emergency", "Religious observance", "Other"];

export function FamilyAbsences() {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [notes, setNotes] = useState<AbsenceNote[] | null>(null);
  const [unexplained, setUnexplained] = useState<Absence[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // One note can cover several children (e.g. a family trip or everyone unwell).
  const [childIds, setChildIds] = useState<string[]>([]);
  const [when, setWhen] = useState<"today" | "tomorrow" | "dates">("today");
  const [category, setCategory] = useState("");
  // "Today" is the school's (UK) today, whatever zone the family is in.
  const [fromDate, setFromDate] = useState(() => ukToday());
  const [toDate, setToDate] = useState(() => ukToday());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  // "Tell us why" on an unexplained absence opens a short form in place,
  // so the parent never loses their spot on the page.
  const [showNote, setShowNote] = useState(false);
  // Days answered this visit drop out at once, before the reload comes back.
  const [sentKeys, setSentKeys] = useState<string[]>([]);
  const [qCategory, setQCategory] = useState("");
  const [qReason, setQReason] = useState("");
  const [qBusy, setQBusy] = useState(false);
  const [qError, setQError] = useState<string | null>(null);
  const [thanked, setThanked] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [showAllNotes, setShowAllNotes] = useState(false);
  // One thing at a time: a simple start screen, then either the report form
  // or the missed days one by one.
  const [view, setView] = useState<"home" | "report" | "reasons">("home");
  const [step, setStep] = useState(0);
  const [applyAll, setApplyAll] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const [kids, n] = await Promise.all([supabase.from("children").select("id, name").order("name"), fetchNotes()]);
      if (cancelled) return;
      const list = (kids.data as unknown as Child[]) || [];
      setChildren(list);
      setNotes(n.notes);
      setChildIds((cur) => (cur.length ? cur : list.length === 1 ? [list[0].id] : []));
      const today = ukToday();
      const a = await fetchAbsences(shiftDateKey(today, -30), today, n.notes);
      if (cancelled) return;
      setUnexplained(a.absences.filter((x) => x.kind === "unexplained"));
      setLoadError(kids.error?.message || n.error || a.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  // One nudge per child and day, however many lessons were missed. A day
  // already covered by a note the parent sent (even one still awaiting a
  // decision) is not asked about again: the staff-side classifier counts an
  // undecided note as "unexplained", which used to make the nudge reappear
  // straight after the parent had answered it.
  const nudges = useMemo(() => {
    const seen = new Set<string>();
    return unexplained.filter((a) => {
      const k = `${a.childId}|${a.date}`;
      if (seen.has(k)) return false;
      if (sentKeys.includes(k)) return false;
      if ((notes || []).some((n) => n.child_id === a.childId && a.date >= n.from_date && a.date <= n.to_date)) return false;
      seen.add(k);
      return true;
    });
  }, [unexplained, notes, sentKeys]);

  const resetQuick = () => {
    setQCategory("");
    setQReason("");
    setQError(null);
    setShowNote(false);
  };

  const startReasons = () => {
    resetQuick();
    setStep(0);
    setApplyAll(false);
    setDoneCount(0);
    setThanked(null);
    setView("reasons");
  };

  const sendQuick = async (list: Absence[]) => {
    const supabase = getSupabaseClient();
    if (!supabase || !list.length) return;
    if (!qCategory) return setQError("Please choose a reason.");
    if (qCategory === "Other" && !qReason.trim()) return setQError("Please tell us a little about why.");
    setQBusy(true);
    setQError(null);
    const text = qReason.trim() ? `${qCategory}: ${qReason.trim()}` : qCategory;
    const { error } = await supabase.from("absence_notes").insert(list.map((a) => ({ child_id: a.childId, from_date: a.date, to_date: a.date, reason: text })));
    setQBusy(false);
    if (error) return setQError("We couldn't send that just now. Please try again.");
    setDoneCount((n) => n + list.length);
    setSentKeys((k) => [...k, ...list.map((a) => `${a.childId}|${a.date}`)]);
    resetQuick();
    setApplyAll(false);
    setTick((t) => t + 1);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!childIds.length) return setFormError("Please choose which child this is for.");
    const today = ukToday();
    const tmw = shiftDateKey(today, 1);
    const [from, to] = when === "today" ? [today, today] : when === "tomorrow" ? [tmw, tmw] : [fromDate, toDate];
    if (!from || !to || to < from) return setFormError("Please check the dates. The last day can't be before the first.");
    if (!category) return setFormError("Please choose a reason.");
    if (category === "Other" && !reason.trim()) return setFormError("Please tell us a little about why.");
    const text = reason.trim() ? `${category}: ${reason.trim()}` : category;
    setBusy(true);
    setFormError(null);
    const { error } = await supabase.from("absence_notes").insert(childIds.map((id) => ({ child_id: id, from_date: from, to_date: to, reason: text })));
    setBusy(false);
    if (error) return setFormError("We couldn't send that just now. Please try again.");
    setCategory("");
    setReason("");
    setSent(true);
    setTick((t) => t + 1);
  };

  const remove = async (id: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setConfirmWithdraw(null);
    const { error } = await supabase.from("absence_notes").delete().eq("id", id);
    setWithdrawError(error ? "We couldn't withdraw that note just now. Please try again." : null);
    setTick((t) => t + 1);
  };

  // Starting a new note clears the last "Thank you".
  const edit =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setSent(false);
      setFormError(null);
      setter(v);
    };
  const todayKey = ukToday();
  const dayChip = (key: string) => formatDateKey(key, { weekday: "short", day: "numeric", month: "short" });
  const NOTES_SHOWN = 5;
  const visibleNotes = notes && !showAllNotes ? notes.slice(0, NOTES_SHOWN) : notes;

  const nameOf = (id: string) => children?.find((c) => c.id === id)?.name || "Your child";

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/family/dashboard" }, { label: "Absences" }]}
        title="Report an absence"
        subtitle="Let us know why your child was, or will be, away. It helps us look after them."
      />
      {loadError && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">Some of this couldn&apos;t load. Please refresh in a moment.</p>}

      {view === "home" && (
        <>
          {thanked && (
            <p role="status" className="mb-4 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-800">
              {thanked}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setFormError(null);
                setView("report");
              }}
              className="flex min-h-28 flex-col items-start justify-between rounded-2xl border border-gold-light bg-white p-5 text-left shadow-sm transition hover:border-gold-500 hover:shadow-md"
            >
              <span className="text-lg font-semibold text-ink">Report an absence</span>
              <span className="mt-1 text-sm text-ink/65">Your child is, or will be, away.</span>
            </button>
            {nudges.length > 0 ? (
              <button
                type="button"
                onClick={startReasons}
                className="flex min-h-28 flex-col items-start justify-between rounded-2xl border border-amber-300 bg-amber-50 p-5 text-left shadow-sm transition hover:border-amber-500 hover:shadow-md"
              >
                <span className="flex items-center gap-2 text-lg font-semibold text-amber-950">
                  Give reasons
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{nudges.length}</span>
                </span>
                <span className="mt-1 text-sm text-amber-900/80">
                  {nudges.length === 1 ? "1 missed day needs a reason." : `${nudges.length} missed days need a reason.`} One at a time, a few taps each.
                </span>
              </button>
            ) : (
              <div className="flex min-h-28 flex-col justify-center rounded-2xl border border-green-200 bg-green-50/60 p-5">
                <span className="text-lg font-semibold text-green-900">All up to date</span>
                <span className="mt-1 text-sm text-green-800/80">Every missed day has a reason.</span>
              </div>
            )}
          </div>
          <p className="mt-3 text-sm text-ink/65">
            You can also email <a href="mailto:absence@globalacademy.tarbiyyah.co.uk" className="font-medium text-teal-700 underline-offset-2 hover:underline">absence@globalacademy.tarbiyyah.co.uk</a> from your registered email address and we&apos;ll record it for you.
          </p>

          <section className="mt-6 rounded-2xl border border-gold-light bg-white p-4">
            <h2 className="text-base font-semibold text-ink">Your notes{notes && notes.length > 0 ? <span className="font-normal text-ink/60"> · {notes.length}</span> : null}</h2>
            {withdrawError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{withdrawError}</p>}
            {notes === null ? (
              <p className="mt-3 text-sm text-ink/65">Loading…</p>
            ) : notes.length === 0 ? (
              <p className="mt-3 text-sm text-ink/65">No notes yet. When you report an absence it will appear here, with the school&apos;s reply.</p>
            ) : (
              <ul className="mt-2 divide-y divide-gold-light/50">
                {(visibleNotes || []).map((n) => (
                  <li key={n.id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-medium text-ink">
                        {nameOf(n.child_id)} <span className="font-normal text-ink/65">· {formatRange(n.from_date, n.to_date)}</span>
                      </p>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${CHIP[n.status]}`}>{n.status === "undecided" ? "Awaiting" : STATUS_LABEL[n.status]}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink/70">{n.reason}</p>
                    {n.decision_note && <p className="mt-1 text-sm text-ink/65">From the school: {n.decision_note}</p>}
                    {n.status === "undecided" &&
                      (confirmWithdraw === n.id ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-ink/75">Withdraw this note?</span>
                          <button type="button" onClick={() => remove(n.id)} className={`${ui.btnPrimary} ${ui.sm}`}>
                            Yes, withdraw
                          </button>
                          <button type="button" onClick={() => setConfirmWithdraw(null)} className={`${ui.btnSecondary} ${ui.sm}`}>
                            Keep it
                          </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setConfirmWithdraw(n.id)} className="mt-1 inline-flex min-h-9 items-center text-xs font-medium text-ink/65 underline hover:text-ink">
                          Withdraw
                        </button>
                      ))}
                  </li>
                ))}
              </ul>
            )}
            {notes && notes.length > NOTES_SHOWN && (
              <button type="button" onClick={() => setShowAllNotes((v) => !v)} className="mt-2 text-sm font-medium text-teal-700 hover:underline">
                {showAllNotes ? "Show fewer" : `Show all ${notes.length} notes`}
              </button>
            )}
          </section>
        </>
      )}

      {view !== "home" && (
        <button type="button" onClick={() => setView("home")} className="mb-4 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-gold-700 hover:underline">
          <span aria-hidden="true">←</span> Back to absences
        </button>
      )}

      {view === "reasons" &&
        (() => {
          const remaining = nudges.slice(step);
          const current = remaining[0];
          if (!current) {
            return (
              <section className="mx-auto max-w-xl rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
                <p className="text-lg font-semibold text-green-900">{nudges.length ? "Thank you." : doneCount ? "Thank you, that's everything." : "Nothing left to explain."}</p>
                <p className="mt-1 text-sm text-green-800">
                  {doneCount ? `We've noted ${doneCount === 1 ? "1 reason" : `${doneCount} reasons`}. ` : ""}
                  {nudges.length ? `You skipped ${nudges.length === 1 ? "1 day" : `${nudges.length} days`}; come back to ${nudges.length === 1 ? "it" : "them"} any time.` : "The school will be in touch only if they need anything else."}
                </p>
                <button type="button" onClick={() => { setView("home"); }} className={`${ui.btnPrimary} mt-4`}>
                  Done
                </button>
              </section>
            );
          }
          const sameChild = remaining.filter((a) => a.childId === current.childId);
          const others = remaining.length - 1;
          const batch = applyAll ? remaining : [current];
          return (
            <section className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                {nudges.length - remaining.length + 1} of {nudges.length}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-ink">
                Why was {current.childName.split(" ")[0]} away on {formatDay(current.date)}?
              </h2>
              <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Reason">
                {REASONS.map((c) => (
                  <button key={c} type="button" aria-pressed={qCategory === c} onClick={() => setQCategory(c)} className={qCategory === c ? ui.chipOn : ui.chip}>
                    {c}
                  </button>
                ))}
              </div>
              {(qCategory === "Other" || showNote) && (
                <label className="mt-4 block text-sm font-medium text-ink">
                  {qCategory === "Other" ? "Tell us why" : "Anything else? (optional)"}
                  <textarea rows={2} value={qReason} onChange={(e) => setQReason(e.target.value)} className={fieldCls} />
                </label>
              )}
              {qCategory && qCategory !== "Other" && !showNote && (
                <button type="button" onClick={() => setShowNote(true)} className="mt-3 text-sm font-medium text-teal-700 hover:underline">
                  Add a note (optional)
                </button>
              )}
              {others > 0 && (
                <label className="mt-4 flex items-start gap-2 text-sm text-ink/80">
                  <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} className="mt-0.5 h-4 w-4" />
                  <span>
                    Use this reason for the other {others === 1 ? "missed day" : `${others} missed days`} too
                    {sameChild.length === remaining.length ? "" : " (all children)"}
                  </span>
                </label>
              )}
              {qError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{qError}</p>}
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" disabled={qBusy} onClick={() => sendQuick(batch)} className={`${ui.btnPrimary} disabled:opacity-50`}>
                  {qBusy ? "Sending…" : others > 0 && !applyAll ? "Send and next" : "Send"}
                </button>
                {others > 0 && (
                  <button type="button" onClick={() => { resetQuick(); setStep((n) => n + 1); }} className={ui.btnSecondary}>
                    Skip for now
                  </button>
                )}
              </div>
            </section>
          );
        })()}

      {view === "report" && (
        <form ref={formRef} onSubmit={submit} className="mx-auto max-w-xl space-y-5 rounded-2xl border border-gold-light bg-white p-5 sm:p-6">
          {children !== null && children.length === 0 ? (
            <p className="text-sm text-ink/65">There are no children on your account yet. Once your child is enrolled you can send notes here.</p>
          ) : sent ? (
            <div className="text-center">
              <p className="text-lg font-semibold text-green-900">Thank you, we&apos;ve got it.</p>
              <p className="mt-1 text-sm text-ink/70">Your child&apos;s teachers can see the reason. The office will be in touch only if they need anything else.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => setView("home")} className={ui.btnPrimary}>
                  Done
                </button>
                <button type="button" onClick={() => setSent(false)} className={ui.btnSecondary}>
                  Report another
                </button>
              </div>
            </div>
          ) : (
            <>
              {(children || []).length > 1 && (
                <fieldset>
                  <legend className="text-sm font-semibold text-ink">Who is away?</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(children || []).map((c) => {
                      const on = childIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => edit(setChildIds)(on ? childIds.filter((x) => x !== c.id) : [...childIds, c.id])}
                          className={on ? ui.chipOn : ui.chip}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}
              <fieldset>
                <legend className="text-sm font-semibold text-ink">When?</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      ["today", `Today (${dayChip(todayKey)})`],
                      ["tomorrow", `Tomorrow (${dayChip(shiftDateKey(todayKey, 1))})`],
                      ["dates", "Other dates"],
                    ] as const
                  ).map(([k, label]) => (
                    <button key={k} type="button" aria-pressed={when === k} onClick={() => edit(setWhen)(k)} className={when === k ? ui.chipOn : ui.chip}>
                      {label}
                    </button>
                  ))}
                </div>
                {when === "dates" && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm text-ink">
                      First day away
                      <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => {
                          const v = e.target.value;
                          edit(setFromDate)(v);
                          if (v && toDate < v) setToDate(v);
                        }}
                        className={fieldCls}
                      />
                    </label>
                    <label className="block text-sm text-ink">
                      Last day away
                      <input type="date" value={toDate} min={fromDate} onChange={(e) => edit(setToDate)(e.target.value)} className={fieldCls} />
                    </label>
                  </div>
                )}
              </fieldset>
              <fieldset>
                <legend className="text-sm font-semibold text-ink">Why?</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {REASONS.map((c) => (
                    <button key={c} type="button" aria-pressed={category === c} onClick={() => edit(setCategory)(c)} className={category === c ? ui.chipOn : ui.chip}>
                      {c}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="block text-sm font-semibold text-ink">
                {category === "Other" ? "Tell us why" : "Anything else? (optional)"}
                <textarea rows={2} value={reason} onChange={(e) => edit(setReason)(e.target.value)} placeholder="e.g. A temperature since last night, back on Thursday." className={`${fieldCls} font-normal`} />
              </label>
              {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p>}
              <button type="submit" disabled={busy} className={`${ui.btnPrimary} w-full disabled:opacity-50`}>
                {busy ? "Sending…" : "Send"}
              </button>
            </>
          )}
        </form>
      )}
    </>
  );
}
