"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type Entry = { id: string; week_of: string; note: string; recorded_at: string };

function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // shift Sunday back to the previous Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * A form tutor's weekly character/akhlaq note for one child, separate
 * from academic assessment and Qur'an progress (see QuranProgressForm),
 * matching the marketing pitch's "Weekly Tarbiyah Note... separate from
 * academic reports" (differentiator d6 / pastoral-care page). RLS
 * (weekly_tarbiyah_notes, 0023) is the real gate on who can write one, 
 * any teacher of the child's class, this form just can't submit
 * anything that policy would reject.
 */
export function WeeklyTarbiyahNoteForm({ childId, classId }: { childId: string; classId: string }) {
  const supabase = getSupabaseClient();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [weekOf, setWeekOf] = useState(() => mondayOf(new Date()));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    if (!supabase || !childId) return;
    const { data } = await supabase
      .from("weekly_tarbiyah_notes")
      .select("id, week_of, note, recorded_at")
      .eq("child_id", childId)
      .eq("class_id", classId)
      .order("week_of", { ascending: false });
    setEntries((data as Entry[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, childId, classId]);

  async function submit() {
    if (!supabase || !note.trim()) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase
      .from("weekly_tarbiyah_notes")
      .upsert({ child_id: childId, class_id: classId, week_of: weekOf, note: note.trim() }, { onConflict: "child_id,class_id,week_of" });
    setBusy(false);
    if (error) {
      setMessage("Couldn't save that note.");
      return;
    }
    setNote("");
    setMessage("Saved.");
    await load();
  }

  return (
    <div className="mt-6 border-t border-gold-light/30 pt-4">
      <h3 className="text-sm font-medium text-ink">Weekly Tarbiyah Note</h3>
      <p className="mt-1 text-xs text-ink/65">A short personal note on this child&apos;s character and akhlaq this week, separate from grades.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink/70">
          Week of
          <input type="date" value={weekOf} onChange={(e) => setWeekOf(e.target.value)} className="mt-1 block rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm" />
        </label>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="e.g. Showed real patience helping a classmate with wudu this week…"
        className="mt-2 w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
      />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" disabled={busy || !note.trim()} onClick={submit} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold disabled:opacity-50 text-white hover:bg-gold-900 transition-colors">
          {busy ? "Saving…" : "Save note"}
        </button>
        {message && <span className="text-xs text-ink/65">{message}</span>}
      </div>

      {entries && entries.length > 0 && (
        <ul className="mt-4 space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="rounded-lg border border-gold-light/40 p-2 text-sm">
              <p className="text-xs font-medium text-ink/65">Week of {new Date(e.week_of).toLocaleDateString("en-GB")}</p>
              <p className="mt-1 text-ink/80">{e.note}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
