"use client";

import { useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { BADGE_TYPES, MERIT_CATEGORIES, todayIso, type StudentOption } from "@/components/learn/behaviour/data";

import { Select } from "@/components/ui/Dropdown";
import { Icon } from "@/components/learn/Icon";
// Reward several pupils, or the whole class, in one go.
//  * Merits: every merit adds house points to the pupil's house automatically
//    (behaviour_records, 0039/0073), so this is how a class earns house points.
//  * Star badges: the badge shelf awards (behaviour_badges, 0039).
// Teachers can award to pupils they teach (RLS); Headteacher/Admin to anyone.

type Kind = "merit" | "badge";

export function BatchAward({ classId, roster, onAwarded }: { classId: string; roster: StudentOption[]; onAwarded?: () => void }) {
  const pupils = useMemo(() => roster.filter((r) => r.classId === classId), [roster, classId]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<Kind>("merit");
  const [category, setCategory] = useState(MERIT_CATEGORIES[0].label);
  const [points, setPoints] = useState(MERIT_CATEGORIES[0].points);
  const [badge, setBadge] = useState(BADGE_TYPES[1].name);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const allPicked = pupils.length > 0 && pupils.every((p) => picked.has(p.childId));
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(pupils.map((p) => p.childId)));

  async function award(ids: string[]) {
    const supabase = getSupabaseClient();
    if (!supabase || ids.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      if (kind === "merit") {
        if (!category.trim() || points < 1) return setMsg({ ok: false, text: "Choose a reason and points." });
        const rows = ids.map((child_id) => ({ child_id, class_id: classId, kind: "merit", points, category: category.trim(), note: note.trim() || null, occurred_on: todayIso() }));
        const { error } = await supabase.from("behaviour_records").insert(rows);
        if (error) return setMsg({ ok: false, text: "Couldn't save. You can only reward pupils you teach." });
        setMsg({ ok: true, text: `${ids.length} ${ids.length === 1 ? "pupil" : "pupils"} each earned ${points} merit ${points === 1 ? "point" : "points"} (${points * ids.length} house points in total).` });
      } else {
        const rows = ids.map((child_id) => ({ child_id, badge }));
        const { error } = await supabase.from("behaviour_badges").insert(rows);
        if (error) return setMsg({ ok: false, text: "Couldn't award the badge. You can only reward pupils you teach." });
        setMsg({ ok: true, text: `${badge} badge awarded to ${ids.length} ${ids.length === 1 ? "pupil" : "pupils"}.` });
      }
      setPicked(new Set());
      setNote("");
      onAwarded?.();
    } finally {
      setBusy(false);
    }
  }

  const everyone = () => {
    if (!window.confirm(`Reward all ${pupils.length} pupils in this class?`)) return;
    void award(pupils.map((p) => p.childId));
  };

  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-xs font-medium ${active ? "border-teal-600 bg-teal-50 text-teal-900" : "border-gold-light bg-white text-ink/80 hover:bg-cream"}`;

  return (
    <section className="rounded-2xl border border-gold-light/50 bg-white p-4" aria-labelledby="batch-award-h">
      <h2 id="batch-award-h" className="text-base font-semibold text-ink">
        Reward a group or the whole class
      </h2>
      <p className="mt-1 text-xs text-ink/65">Tick pupils, or reward everyone at once. Merits earn house points automatically; badges go on the pupil&apos;s shelf.</p>

      {pupils.length === 0 ? (
        <p className="mt-3 text-sm text-ink/65">No pupils in this class.</p>
      ) : (
        <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div>
            <label className="flex items-center gap-2 border-b border-gold-light/50 pb-2 text-sm font-medium text-ink">
              <input type="checkbox" checked={allPicked} onChange={toggleAll} />
              Select whole class ({pupils.length})
            </label>
            <ul className="mt-1 max-h-64 overflow-y-auto" aria-label="Pupils">
              {pupils.map((p) => (
                <li key={p.childId}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm text-ink hover:bg-cream/60">
                    <input type="checkbox" checked={picked.has(p.childId)} onChange={() => toggle(p.childId)} />
                    {p.name}
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <div role="group" aria-label="What to award" className="flex gap-0.5 self-start rounded-lg bg-cream p-0.5">
              {([
                ["merit", "Merit (house points)"],
                ["badge", "Star badge"],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={kind === id} onClick={() => setKind(id)} className={`flex-1 rounded-md px-2.5 py-1 text-xs font-semibold ${kind === id ? "bg-white text-ink shadow-sm" : "text-ink/65 hover:text-ink"}`}>
                  {label}
                </button>
              ))}
            </div>

            {kind === "merit" ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {MERIT_CATEGORIES.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      aria-pressed={category === c.label}
                      onClick={() => {
                        setCategory(c.label);
                        setPoints(c.points);
                      }}
                      className={chip(category === c.label)}
                    >
                      {c.label} · {c.points}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs font-medium text-ink/70">
                  Points each
                  <Select allowEmpty value={points} onChange={(e) => setPoints(Number(e.target.value))} className="rounded-lg border border-gold-light bg-white px-2 py-1 text-sm">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block text-xs font-medium text-ink/70">
                  Note (optional)
                  <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="mt-1 block w-full rounded-lg border border-gold-light px-3 py-1.5 text-sm" placeholder="e.g. Brilliant teamwork on the project" />
                </label>
              </>
            ) : (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Badge">
                {BADGE_TYPES.map((b) => (
                  <button key={b.name} type="button" aria-pressed={badge === b.name} onClick={() => setBadge(b.name)} className={chip(badge === b.name)}>
                    <Icon name={b.icon} size="sm" />
                    {b.name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy || picked.size === 0} onClick={() => award([...picked])} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
                {busy ? "Saving…" : `Award to selected (${picked.size})`}
              </button>
              <button type="button" disabled={busy} onClick={everyone} className="rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-semibold text-ink/80 hover:bg-cream disabled:opacity-50">
                Award whole class ({pupils.length})
              </button>
            </div>
            {msg && (
              <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-green-800" : "text-red-700"}`}>
                {msg.text}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
