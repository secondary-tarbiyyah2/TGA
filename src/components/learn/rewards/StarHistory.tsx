"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Tabs } from "@/components/learn/Tabs";
import { EmptyState, Notice, StatusChip, ui } from "@/components/learn/ui";
import { STAR_SELECT, STATUS_LABEL, certificateAction, mondayIso, shortDay, type Candidate, type Star } from "./starData";

/** Past stars for one class, by week and by pupil, so no child is left out or chosen every week. */
export function StarHistory({ isHead, classId }: { isHead: boolean; classId: string }) {
  const [stars, setStars] = useState<Star[] | null>(null);
  const [pupils, setPupils] = useState<Candidate[] | null>(null);
  const [view, setView] = useState<"weeks" | "pupils">("weeks");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !classId) return;
    const [s, c] = await Promise.all([
      supabase.from("star_of_the_week").select(STAR_SELECT).eq("class_id", classId).order("week_start", { ascending: false }).limit(60),
      supabase.rpc("star_candidates", { p_class_id: classId, p_week_start: mondayIso(new Date()) }),
    ]);
    setStars((s.data as unknown as Star[] | null) || []);
    setPupils(c.error ? [] : ((c.data as Candidate[] | null) || []));
  }, [classId]);

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

  const notYet = useMemo(() => (pupils || []).filter((p) => p.stars_this_term === 0), [pupils]);
  const byPupil = useMemo(() => [...(pupils || [])].sort((a, b) => a.stars_this_term - b.stars_this_term || a.child_name.localeCompare(b.child_name)), [pupils]);

  const cert = async (s: Star, email: boolean) => {
    setBusy(true);
    setMsg(null);
    const r = await certificateAction(s, email);
    setBusy(false);
    if (!r.ok) setMsg({ tone: "bad", text: r.text || "Something went wrong." });
    else if (r.text) setMsg({ tone: "good", text: r.text });
    await load();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          variant="switch"
          label="History view"
          value={view}
          onChange={setView}
          items={[
            { key: "weeks", label: "By week" },
            { key: "pupils", label: "By pupil" },
          ]}
        />
        {pupils && pupils.length > 0 && (
          <p className="text-xs text-ink/70">
            {notYet.length === 0 ? "Every pupil has been star this term." : `${notYet.length} of ${pupils.length} pupils haven't been star yet this term.`}
          </p>
        )}
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {view === "weeks" ? (
        stars === null ? (
          <div className="h-32 motion-safe:animate-pulse rounded-2xl bg-white" />
        ) : stars.length === 0 ? (
          <EmptyState title="No stars in this class yet" icon="star" tile="tile-gold" />
        ) : (
          <ul className="divide-y divide-gold-light/60 rounded-2xl border border-gold-light bg-white">
            {stars.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-sm">
                <span className="w-24 shrink-0 text-xs text-ink/65">w/b {shortDay(s.week_start)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{s.children?.name || "Pupil"}</span>
                  <span className="block truncate text-xs text-ink/65">{s.reason}</span>
                </span>
                <StatusChip tone={s.status === "approved" ? "good" : s.status === "declined" ? "neutral" : "warn"}>{STATUS_LABEL[s.status]}</StatusChip>
                {s.status === "approved" && (
                  <span className="flex gap-1.5">
                    <button type="button" disabled={busy} onClick={() => cert(s, false)} className={`${ui.btnSecondary} ${ui.sm}`}>
                      Certificate
                    </button>
                    {isHead && (
                      <button type="button" disabled={busy} onClick={() => cert(s, true)} className={`${ui.btnSecondary} ${ui.sm}`}>
                        {s.certificate_emailed_at ? "Email again" : "Email"}
                      </button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )
      ) : pupils === null ? (
        <div className="h-32 motion-safe:animate-pulse rounded-2xl bg-white" />
      ) : (
        <ul className="divide-y divide-gold-light/60 rounded-2xl border border-gold-light bg-white">
          {byPupil.map((p) => (
            <li key={p.child_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 font-medium text-ink">{p.child_name}</span>
              <span className="text-xs text-ink/65">
                {p.stars_all_time === 0 ? "Never star" : `${p.stars_all_time} time${p.stars_all_time === 1 ? "" : "s"} in all`}
                {p.last_star_week ? ` · last w/b ${shortDay(p.last_star_week)}` : ""}
              </span>
              {p.stars_this_term === 0 ? <StatusChip tone="good">Not star yet this term</StatusChip> : <StatusChip>{p.stars_this_term}× this term</StatusChip>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
