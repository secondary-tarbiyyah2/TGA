"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { EmptyState, Notice, ui } from "@/components/learn/ui";
import { StarCertificatePreview } from "./StarCertificatePreview";
import { StarHistoryChip, evidence } from "./StarWeek";
import { STAR_SELECT, firstName, postShoutOut, shortDay, type Candidate, type Star } from "./starData";

/** The Headteacher's queue of nominations: read the evidence, approve (and post the shout-out) or decline with a note. */
export function StarApprovals({ me, onChanged }: { me: { id: string } | null; onChanged: () => void }) {
  const [rows, setRows] = useState<Star[] | null>(null);
  const [facts, setFacts] = useState<Record<string, Candidate>>({});
  const [shout, setShout] = useState<Record<string, boolean>>({});
  const [declining, setDeclining] = useState<{ id: string; note: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad" | "warn"; text: string } | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase.from("star_of_the_week").select(STAR_SELECT).eq("status", "nominated").order("week_start", { ascending: false }).order("created_at").limit(100);
    const list = (data as unknown as Star[] | null) || [];
    setRows(list);
    // This week's evidence for each nominee, one call per class and week.
    const pairs = Array.from(new Set(list.map((s) => `${s.class_id}|${s.week_start}`)));
    const res = await Promise.all(pairs.map((p) => supabase.rpc("star_candidates", { p_class_id: p.split("|")[0], p_week_start: p.split("|")[1] })));
    const out: Record<string, Candidate> = {};
    pairs.forEach((p, i) => {
      for (const c of (res[i].data as Candidate[] | null) || []) {
        const s = list.find((x) => `${x.class_id}|${x.week_start}` === p && x.child_id === c.child_id);
        if (s) out[s.id] = c;
      }
    });
    setFacts(out);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const approve = async (s: Star) => {
    const supabase = getSupabaseClient();
    if (!supabase || !me) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("star_of_the_week").update({ status: "approved" }).eq("id", s.id);
    if (error) {
      setBusy(false);
      return setMsg({ tone: "bad", text: "Couldn't approve that nomination." });
    }
    let note = "";
    if ((shout[s.id] ?? true) && !s.children?.hide_from_leaderboard) {
      const err = await postShoutOut(s, me.id);
      note = err ? ` The shout-out couldn't be posted (${err}).` : " The class shout-out has been posted.";
    }
    setBusy(false);
    setMsg({ tone: note.includes("couldn't") ? "warn" : "good", text: `${firstName(s.children?.name || "")} approved as Star of the Week.${note} Make or email the certificate from This week or History.` });
    await load();
    onChanged();
  };

  const decline = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !declining) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("star_of_the_week").update({ status: "declined", decision_note: declining.note.trim() || null }).eq("id", declining.id);
    setBusy(false);
    if (error) return setMsg({ tone: "bad", text: "Couldn't save that decision." });
    setDeclining(null);
    setMsg({ tone: "good", text: "Marked as not chosen. The teacher can see your note." });
    await load();
    onChanged();
  };

  if (rows === null) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;

  return (
    <div className="space-y-3">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {rows.length === 0 ? (
        <EmptyState title="No nominations are waiting" icon="star" tile="tile-gold">
          When a teacher nominates a Star of the Week it appears here for you to approve.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => {
            const f = facts[s.id];
            const hidden = !!s.children?.hide_from_leaderboard;
            return (
              <li key={s.id} className={ui.card}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-semibold text-ink">
                      {s.children?.name || "Pupil"} <span className="font-normal text-ink/65">· {s.classes?.name || "Class"} · week beginning {shortDay(s.week_start)}</span>
                    </p>
                    <p className="text-sm text-ink/80">{s.reason}</p>
                    {s.message && <p className="text-sm italic text-ink/65">&ldquo;{s.message}&rdquo;</p>}
                    <p className="text-xs text-ink/65">Nominated by {s.nominator?.full_name || "a teacher"}</p>
                    {f && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-xs text-ink/70">{evidence(f).join(" · ") || "Nothing recorded this week"}</span>
                        <StarHistoryChip c={f} weekStart={s.week_start} />
                      </div>
                    )}
                    {hidden && <p className="text-xs text-ink/65">Family opted out of the leaderboard: private certificate, no shout-out.</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setPreview(preview === s.id ? null : s.id)} aria-expanded={preview === s.id} className={`${ui.btnSecondary} ${ui.sm}`}>
                      {preview === s.id ? "Hide certificate" : "Certificate"}
                    </button>
                    <button type="button" disabled={busy} onClick={() => setDeclining(declining?.id === s.id ? null : { id: s.id, note: "" })} className={`${ui.btnSecondary} ${ui.sm}`}>
                      Decline
                    </button>
                    <button type="button" disabled={busy} onClick={() => approve(s)} className={`${ui.btnPrimary} ${ui.sm}`}>
                      Approve
                    </button>
                  </div>
                </div>
                {!hidden && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-ink/75">
                    <input type="checkbox" checked={shout[s.id] ?? true} onChange={(e) => setShout((m) => ({ ...m, [s.id]: e.target.checked }))} />
                    Post a shout-out to the class when approved (first name and initial only)
                  </label>
                )}
                {declining?.id === s.id && (
                  <div className="mt-3">
                    <label htmlFor={`dec-${s.id}`} className={ui.label}>
                      Note for the teacher (optional)
                    </label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <input id={`dec-${s.id}`} maxLength={400} value={declining.note} onChange={(e) => setDeclining({ id: s.id, note: e.target.value })} className={`min-w-0 flex-1 ${ui.input}`} placeholder="e.g. Already star twice this term; please choose someone else." />
                      <button type="button" disabled={busy} onClick={decline} className={ui.btnPrimary}>
                        Decline
                      </button>
                    </div>
                  </div>
                )}
                {preview === s.id && (
                  <div className="mt-3 max-w-md">
                    <StarCertificatePreview name={s.children?.name || ""} reason={s.reason} message={s.message} className={s.classes?.name || ""} weekStart={s.week_start} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
