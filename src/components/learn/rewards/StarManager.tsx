"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { fetchAllClasses, fetchTeacherClasses, type ClassSummary } from "@/lib/learn/classes";
import { getSupabaseClient } from "@/lib/supabase/client";
import { loadStudents, type StudentOption } from "@/components/learn/behaviour/data";

// Star of the week workflow (0074).
//  * Teachers nominate one pupil per class per week (suggestions come from the
//    week's merits) and can withdraw a nomination until it is decided.
//  * Headteacher/Admin approve or decline, nominate-and-approve directly, and
//    make/print/email the PDF certificate (star-certificate Edge Function).
// A child whose family opted out of the leaderboard can still be a star (they
// get a private certificate) but is flagged here: they are never shown in the
// public shout-out.

type Star = {
  id: string;
  class_id: string;
  child_id: string;
  week_start: string;
  reason: string;
  status: "nominated" | "approved" | "declined";
  certificate_path: string | null;
  certificate_emailed_at: string | null;
  children: { name: string; hide_from_leaderboard: boolean } | null;
  classes: { name: string } | null;
};

type Suggestion = { child_id: string; child_name: string; merits: number; hidden: boolean };

const STAR_SELECT = "id, class_id, child_id, week_start, reason, status, certificate_path, certificate_emailed_at, children(name, hide_from_leaderboard), classes(name)";

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Monday (local) of the week containing `d`, as YYYY-MM-DD. */
function mondayIso(d: Date): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return isoLocal(copy);
}

function weekOptions(): { value: string; label: string }[] {
  const now = new Date();
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
    const value = mondayIso(d);
    const label = new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    out.push({ value, label: `Week beginning ${label}${i === 0 ? " (this week)" : ""}` });
  }
  return out;
}

const STATUS_STYLE: Record<Star["status"], string> = {
  nominated: "bg-amber-100 text-amber-900",
  approved: "bg-green-100 text-green-900",
  declined: "bg-ink/10 text-ink/70",
};
const STATUS_LABEL: Record<Star["status"], string> = { nominated: "Waiting for approval", approved: "Approved", declined: "Not chosen" };

function StarRow({ star, isHead, busy, onAct }: { star: Star; isHead: boolean; busy: boolean; onAct: (action: "approve" | "decline" | "withdraw" | "certificate" | "email", star: Star) => void }) {
  const weekLabel = new Date(`${star.week_start}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold-light/50 px-3 py-2 text-sm">
      <span className="min-w-0">
        <span className="block font-medium text-ink">
          {star.children?.name || "Pupil"}
          <span className="ml-2 text-xs font-normal text-ink/50">
            {star.classes?.name ? `${star.classes.name} · ` : ""}week of {weekLabel}
          </span>
          <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[star.status]}`}>{STATUS_LABEL[star.status]}</span>
        </span>
        <span className="block text-xs text-ink/70">{star.reason}</span>
        {star.children?.hide_from_leaderboard && <span className="block text-[11px] text-ink/50">Family opted out of the leaderboard: no public shout-out; the certificate stays private to the family.</span>}
        {star.certificate_emailed_at && <span className="block text-[11px] text-ink/50">Certificate emailed {new Date(star.certificate_emailed_at).toLocaleDateString("en-GB")}.</span>}
      </span>
      <span className="flex shrink-0 flex-wrap gap-1.5">
        {star.status === "nominated" && isHead && (
          <>
            <button type="button" disabled={busy} onClick={() => onAct("approve", star)} className="rounded-md bg-green-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-800 disabled:opacity-50">
              Approve
            </button>
            <button type="button" disabled={busy} onClick={() => onAct("decline", star)} className="rounded-md border border-gold-light px-2.5 py-1 text-xs font-semibold text-ink/70 hover:bg-cream disabled:opacity-50">
              Decline
            </button>
          </>
        )}
        {star.status === "nominated" && (
          <button type="button" disabled={busy} onClick={() => onAct("withdraw", star)} className="rounded-md border border-gold-light px-2.5 py-1 text-xs font-semibold text-ink/70 hover:bg-cream disabled:opacity-50">
            Withdraw
          </button>
        )}
        {star.status === "approved" && (
          <>
            <button type="button" disabled={busy} onClick={() => onAct("certificate", star)} className="rounded-md border border-gold-light bg-white px-2.5 py-1 text-xs font-semibold text-ink/80 hover:bg-cream disabled:opacity-50">
              {star.certificate_path ? "Open certificate" : "Make certificate"}
            </button>
            {isHead && (
              <button type="button" disabled={busy} onClick={() => onAct("email", star)} className="rounded-md border border-gold-light bg-white px-2.5 py-1 text-xs font-semibold text-ink/80 hover:bg-cream disabled:opacity-50">
                Email to family
              </button>
            )}
          </>
        )}
      </span>
    </li>
  );
}

export function StarManager({ isHead }: { isHead: boolean }) {
  const weeks = useMemo(() => weekOptions(), []);
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [classId, setClassId] = useState("");
  const [weekStart, setWeekStart] = useState(weeks[0].value);
  const [roster, setRoster] = useState<StudentOption[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [stars, setStars] = useState<Star[]>([]);
  const [pending, setPending] = useState<Star[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [childId, setChildId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (isHead ? fetchAllClasses() : fetchTeacherClasses()).then((list) => {
      if (cancelled) return;
      setClasses(list);
      setClassId((cur) => cur || list[0]?.id || "");
    });
    return () => {
      cancelled = true;
    };
  }, [isHead]);

  const loadPending = useCallback(async () => {
    if (!isHead) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase.from("star_of_the_week").select(STAR_SELECT).eq("status", "nominated").order("week_start", { ascending: false }).limit(50);
    setPending((data as unknown as Star[] | null) || []);
  }, [isHead]);

  const loadClass = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !classId) return;
    const [students, starRes, sugRes] = await Promise.all([
      loadStudents(supabase, [classId]),
      supabase.from("star_of_the_week").select(STAR_SELECT).eq("class_id", classId).order("week_start", { ascending: false }).limit(10),
      supabase.rpc("star_suggestions", { p_class_id: classId, p_week_start: weekStart }),
    ]);
    setRoster(students);
    setStars((starRes.data as unknown as Star[] | null) || []);
    setSuggestions(sugRes.error ? [] : ((sugRes.data as Suggestion[] | null) || []));
    const ids = students.map((s) => s.childId);
    if (ids.length > 0) {
      const { data } = await supabase.from("children").select("id, hide_from_leaderboard").in("id", ids);
      setHiddenIds(new Set(((data as { id: string; hide_from_leaderboard: boolean }[] | null) || []).filter((r) => r.hide_from_leaderboard).map((r) => r.id)));
    } else {
      setHiddenIds(new Set());
    }
  }, [classId, weekStart]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (!cancelled) await loadClass();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadClass]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (!cancelled) await loadPending();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPending]);

  const thisWeeksStar = stars.find((s) => s.week_start === weekStart);

  const nominate = async (pupilId: string, why: string) => {
    const supabase = getSupabaseClient();
    if (!supabase || !classId || !pupilId || why.trim().length < 3) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.from("star_of_the_week").insert({
      class_id: classId,
      child_id: pupilId,
      week_start: weekStart,
      reason: why.trim(),
      status: isHead ? "approved" : "nominated",
    });
    setBusy(false);
    if (error) {
      setMessage({ tone: "error", text: error.code === "23505" ? "This class already has a star for that week." : "Couldn't save that nomination." });
      return;
    }
    setReason("");
    setChildId("");
    setMessage({ tone: "ok", text: isHead ? "Star added and approved." : "Nominated. The Headteacher will approve it." });
    await Promise.all([loadClass(), loadPending()]);
  };

  const act = async (action: "approve" | "decline" | "withdraw" | "certificate" | "email", star: Star) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    try {
      if (action === "approve" || action === "decline") {
        const { error } = await supabase.from("star_of_the_week").update({ status: action === "approve" ? "approved" : "declined" }).eq("id", star.id);
        if (error) throw new Error("Couldn't save that decision.");
      } else if (action === "withdraw") {
        if (!window.confirm("Withdraw this nomination?")) return;
        const { error } = await supabase.from("star_of_the_week").delete().eq("id", star.id);
        if (error) throw new Error("Couldn't withdraw that nomination.");
      } else {
        const tab = action === "certificate" ? window.open("about:blank", "_blank") : null;
        const res = await callEdgeFunction("star-certificate", { star_id: star.id, email: action === "email" });
        if (!res.ok) {
          tab?.close();
          throw new Error(edgeErrorMessage(res));
        }
        if (action === "certificate" && typeof res.url === "string") {
          if (tab) tab.location.href = res.url;
          else window.location.assign(res.url);
        }
        if (action === "email") {
          setMessage({ tone: res.emailed ? "ok" : "error", text: res.emailed ? "Certificate emailed to the family." : `Not emailed: ${typeof res.email_note === "string" ? res.email_note : "unknown reason"}` });
        }
      }
      await Promise.all([loadClass(), loadPending()]);
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const rosterForForm = useMemo(() => roster.filter((r) => r.classId === classId), [roster, classId]);

  return (
    <div className="space-y-5">
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${message.tone === "error" ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>
          {message.text}
        </p>
      )}

      {isHead && (
        <section className="rounded-2xl border border-gold-light/50 bg-white p-4">
          <h2 className="text-base font-semibold text-ink">Waiting for approval</h2>
          {pending.length === 0 ? (
            <p className="mt-2 text-sm text-ink/60">No nominations are waiting.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {pending.map((s) => (
                <StarRow key={s.id} star={s} isHead busy={busy} onAct={act} />
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-gold-light/50 bg-white p-4">
        <h2 className="text-base font-semibold text-ink">{isHead ? "Stars by class" : "Nominate a star"}</h2>
        {classes === null ? (
          <p className="mt-2 text-sm text-ink/60">Loading…</p>
        ) : classes.length === 0 ? (
          <p className="mt-2 text-sm text-ink/60">{isHead ? "There are no classes yet." : "You haven't been assigned to any classes yet."}</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-3">
              <label className="text-sm text-ink/70">
                <span className="mr-2">Class</span>
                <select value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm">
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-ink/70">
                <span className="mr-2">Week</span>
                <select value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm">
                  {weeks.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {thisWeeksStar ? (
              <p className="mt-3 text-sm text-ink/70">This class already has a star for the week (below).</p>
            ) : (
              <div className="mt-4 space-y-3">
                {suggestions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-ink/70">Top merit earners this week (a suggestion, not a rule)</p>
                    <ul className="mt-1.5 flex flex-wrap gap-2">
                      {suggestions.map((s) => (
                        <li key={s.child_id}>
                          <button
                            type="button"
                            onClick={() => {
                              setChildId(s.child_id);
                              if (!reason.trim()) setReason(`Earned ${s.merits} merit ${s.merits === 1 ? "point" : "points"} this week`);
                            }}
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${childId === s.child_id ? "border-teal-600 bg-teal-50 text-teal-900" : "border-gold-light bg-white text-ink/80 hover:bg-cream"}`}
                          >
                            {s.child_name} · {s.merits}
                            {s.hidden ? " · private" : ""}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <label className="block text-sm text-ink/70">
                  <span className="mb-1 block text-xs font-medium">Pupil</span>
                  <select value={childId} onChange={(e) => setChildId(e.target.value)} className="w-full max-w-sm rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm">
                    <option value="">Choose a pupil…</option>
                    {rosterForForm.map((r) => (
                      <option key={r.childId} value={r.childId}>
                        {r.name}
                        {hiddenIds.has(r.childId) ? " (private: no public shout-out)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-ink/70">
                  <span className="mb-1 block text-xs font-medium">Why are they the star? (shown on the certificate and in the school shout-out)</span>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} className="w-full max-w-xl rounded-lg border border-gold-light px-3 py-2 text-sm" placeholder="Kindness, effort, a big improvement…" />
                </label>
                <button
                  type="button"
                  disabled={busy || !childId || reason.trim().length < 3}
                  onClick={() => nominate(childId, reason)}
                  className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50"
                >
                  {isHead ? "Add and approve" : "Nominate"}
                </button>
              </div>
            )}

            <h3 className="mt-5 text-sm font-semibold text-ink">Recent stars in this class</h3>
            {stars.length === 0 ? (
              <p className="mt-1 text-sm text-ink/60">None yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {stars.map((s) => (
                  <StarRow key={s.id} star={s} isHead={isHead} busy={busy} onAct={act} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
