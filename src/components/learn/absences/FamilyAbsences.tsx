"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/learn/PageHeader";
import { getSupabaseClient } from "@/lib/supabase/client";
import { localDateKey } from "@/lib/learn/calendar";
import { STATUS_LABEL, dateKeyDaysAgo, fetchAbsences, fetchNotes, formatDay, formatRange, type Absence, type AbsenceNote, type NoteStatus } from "./data";
import { ui } from "@/components/learn/ui";

type Child = { id: string; name: string };
const CHIP: Record<NoteStatus, string> = {
  undecided: "bg-amber-50 text-amber-900",
  authorised: "bg-green-50 text-green-800",
  unauthorised: "bg-red-50 text-red-800",
};
const fieldCls = `mt-1 ${ui.input}`;

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
  const [fromDate, setFromDate] = useState(localDateKey(new Date()));
  const [toDate, setToDate] = useState(localDateKey(new Date()));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

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
      const a = await fetchAbsences(dateKeyDaysAgo(30), localDateKey(new Date()), n.notes);
      if (cancelled) return;
      setUnexplained(a.absences.filter((x) => x.kind === "unexplained"));
      setLoadError(kids.error?.message || n.error || a.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  // One nudge per child and day, however many lessons were missed.
  const nudges = useMemo(() => {
    const seen = new Set<string>();
    return unexplained.filter((a) => {
      const k = `${a.childId}|${a.date}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [unexplained]);

  const prefill = (a: Absence) => {
    setChildIds([a.childId]);
    setWhen("dates");
    setFromDate(a.date);
    setToDate(a.date);
    setSent(false);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!childIds.length) return setFormError("Please choose which child this is for.");
    const today = localDateKey(new Date());
    const tmw = new Date();
    tmw.setDate(tmw.getDate() + 1);
    const [from, to] = when === "today" ? [today, today] : when === "tomorrow" ? [localDateKey(tmw), localDateKey(tmw)] : [fromDate, toDate];
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
    await supabase.from("absence_notes").delete().eq("id", id);
    setTick((t) => t + 1);
  };

  const nameOf = (id: string) => children?.find((c) => c.id === id)?.name || "Your child";

  return (
    <>
      <PageHeader crumbs={[{ label: "Dashboard", href: "/family/dashboard" }, { label: "Absences" }]} title="Report an absence" subtitle="Let us know why your child was, or will be, away. It helps us look after them." />
      {loadError && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">Some of this couldn&apos;t load. Please refresh in a moment.</p>}

      {nudges.length > 0 && (
        <section aria-label="Absences we haven't heard about" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <h2 className="text-sm font-semibold text-amber-950">We haven&apos;t heard about these yet</h2>
          <ul className="mt-2 space-y-2">
            {nudges.map((a) => (
              <li key={`${a.childId}|${a.date}`} className="flex flex-wrap items-center justify-between gap-2 text-sm text-amber-950">
                <span>
                  Please tell us why {a.childName} was absent on {formatDay(a.date)}
                </span>
                <button type="button" onClick={() => prefill(a)} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-950 hover:bg-amber-100">
                  Tell us why
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <form ref={formRef} onSubmit={submit} className="space-y-4 rounded-2xl border border-gold-light bg-white p-4">
          <h2 className="text-base font-semibold text-ink">Tell us about an absence</h2>
          {children !== null && children.length === 0 ? (
            <p className="text-sm text-ink/60">There are no children on your account yet. Once your child is enrolled you can send notes here.</p>
          ) : (
            <>
              <fieldset>
                <legend className="text-sm font-medium text-ink">Who will be away?</legend>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {(children || []).map((c) => {
                    const on = childIds.includes(c.id);
                    return (
                      <button key={c.id} type="button" aria-pressed={on} onClick={() => setChildIds((ids) => (on ? ids.filter((x) => x !== c.id) : [...ids, c.id]))} className={on ? ui.chipOn : ui.chip}>
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-sm font-medium text-ink">When?</legend>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {(
                    [
                      ["today", "Today"],
                      ["tomorrow", "Tomorrow"],
                      ["dates", "Other dates"],
                    ] as const
                  ).map(([k, label]) => (
                    <button key={k} type="button" aria-pressed={when === k} onClick={() => setWhen(k)} className={when === k ? ui.chipOn : ui.chip}>
                      {label}
                    </button>
                  ))}
                </div>
                {when === "dates" && (
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm text-ink">
                      First day away
                      <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={fieldCls} />
                    </label>
                    <label className="block text-sm text-ink">
                      Last day away
                      <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} className={fieldCls} />
                    </label>
                  </div>
                )}
              </fieldset>
              <fieldset>
                <legend className="text-sm font-medium text-ink">Why?</legend>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {["Unwell", "Medical or dental appointment", "Family emergency", "Religious observance", "Other"].map((c) => (
                    <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={category === c ? ui.chipOn : ui.chip}>
                      {c}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="block text-sm font-medium text-ink">
                {category === "Other" ? "Tell us why" : "Anything else? (optional)"}
                <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. A temperature since last night, back on Thursday." className={fieldCls} />
              </label>
              {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p>}
              {sent && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Thank you. Your child&apos;s teachers can see the reason, and the office will be in touch only if they need anything else.</p>}
              <button type="submit" disabled={busy} className="w-full rounded-lg bg-gold-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50 sm:w-auto">
                {busy ? "Sending…" : "Send"}
              </button>
            </>
          )}
        </form>

        <section className="rounded-2xl border border-gold-light bg-white p-4">
          <h2 className="text-base font-semibold text-ink">Your notes</h2>
          {notes === null ? (
            <p className="mt-3 text-sm text-ink/60">Loading…</p>
          ) : notes.length === 0 ? (
            <p className="mt-3 text-sm text-ink/60">You haven&apos;t sent any notes yet. If your child is ever unwell or away, tell us here and we&apos;ll take it from there.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {notes.map((n) => (
                <li key={n.id} className="rounded-xl border border-gold-light/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-medium text-ink">
                      {nameOf(n.child_id)} <span className="font-normal text-ink/65">· {formatRange(n.from_date, n.to_date)}</span>
                    </p>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${CHIP[n.status]}`}>{n.status === "undecided" ? "Awaiting" : STATUS_LABEL[n.status]}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink/75">{n.reason}</p>
                  {n.decision_note && <p className="mt-1 text-sm text-ink/60">From the school: {n.decision_note}</p>}
                  {n.status === "undecided" && (
                    <button type="button" onClick={() => remove(n.id)} className="mt-2 text-xs font-medium text-ink/55 underline hover:text-ink">
                      Withdraw this note
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
