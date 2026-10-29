"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { BADGE_TYPES, badgeEmoji, fmtDate, type BadgeAward, type StudentOption } from "./data";

/** Awarded badges as a shelf of tiles. */
export function BadgeShelf({ badges, showStudent = false, empty = "No badges yet. They will appear here as they are earned." }: { badges: BadgeAward[]; showStudent?: boolean; empty?: string }) {
  if (badges.length === 0) {
    return <p className="rounded-xl border border-dashed border-gold-light bg-cream/30 px-4 py-8 text-center text-sm text-ink/65">{empty}</p>;
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {badges.map((b) => (
        <li key={b.id} className="rounded-xl border border-gold-light/50 bg-gradient-to-b from-amber-50 to-white p-3 text-center">
          <p className="text-3xl" aria-hidden="true">
            {badgeEmoji(b.badge)}
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">{b.badge}</p>
          {showStudent && <p className="truncate text-xs text-ink/70">{b.children?.name || "Student"}</p>}
          <p className="text-xs text-ink/65">{fmtDate(b.awarded_on)}</p>
        </li>
      ))}
    </ul>
  );
}

/** Compact form for staff to award a badge. */
export function AwardBadgeForm({ students, onAwarded }: { students: StudentOption[]; onAwarded: () => void }) {
  const [childId, setChildId] = useState("");
  const [badge, setBadge] = useState(BADGE_TYPES[0].name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unique: StudentOption[] = [];
  for (const s of students) if (!unique.some((u) => u.childId === s.childId)) unique.push(s);

  const award = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!childId) return setError("Choose a pupil.");
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("behaviour_badges").insert({ child_id: childId, badge });
    setBusy(false);
    if (err) return setError("Couldn't award that badge.");
    setChildId("");
    onAwarded();
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-4">
      <h3 className="text-base font-semibold text-ink">Award a badge</h3>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <select value={childId} onChange={(e) => setChildId(e.target.value)} aria-label="Student" className="min-w-0 flex-1 rounded-lg border border-gold-light px-3 py-2 text-sm">
          <option value="">Choose a pupil…</option>
          {unique.map((s) => (
            <option key={s.childId} value={s.childId}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={badge} onChange={(e) => setBadge(e.target.value)} aria-label="Badge" className="rounded-lg border border-gold-light px-3 py-2 text-sm">
          {BADGE_TYPES.map((b) => (
            <option key={b.name} value={b.name}>
              {b.emoji} {b.name}
            </option>
          ))}
        </select>
        <button type="button" disabled={busy} onClick={award} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
          {busy ? "Awarding…" : "Award"}
        </button>
      </div>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
    </div>
  );
}
