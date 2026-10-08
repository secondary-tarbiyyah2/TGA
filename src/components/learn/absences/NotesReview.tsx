"use client";

import { useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { STATUS_LABEL, formatDay, formatRange, type AbsenceNote, type NoteStatus } from "./data";

type Filter = NoteStatus | "all";
const CHIP: Record<NoteStatus, string> = {
  undecided: "bg-amber-50 text-amber-900",
  authorised: "bg-green-50 text-green-800",
  unauthorised: "bg-red-50 text-red-800",
};

function NoteRow({ note, onDone }: { note: AbsenceNote; onDone: () => void }) {
  const [text, setText] = useState(note.decision_note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (status: NoteStatus) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from("absence_notes")
      .update({ status, decision_note: text.trim() || null })
      .eq("id", note.id);
    setBusy(false);
    if (err) return setError("Couldn't save that decision. Please try again.");
    onDone();
  };

  return (
    <li className="rounded-xl border border-gold-light/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {note.childName} <span className="font-normal text-ink/65">· {formatRange(note.from_date, note.to_date)}</span>
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink/80">{note.reason}</p>
          <p className="mt-1 text-xs text-ink/65">Sent {formatDay(note.created_at.slice(0, 10))}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${CHIP[note.status]}`}>{STATUS_LABEL[note.status]}</span>
      </div>
      <label className="mt-3 block text-xs font-medium text-ink/60">
        Note to the family (optional)
        <input value={text} onChange={(e) => setText(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2 text-sm text-ink" />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={busy || note.status === "authorised"} onClick={() => decide("authorised")} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50">
          Authorise
        </button>
        <button type="button" disabled={busy || note.status === "unauthorised"} onClick={() => decide("unauthorised")} className="rounded-lg border border-gold-light bg-white px-3 py-2 text-sm font-semibold text-ink/80 hover:bg-cream disabled:opacity-50">
          Don&apos;t authorise
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-800">{error}</p>}
    </li>
  );
}

export function NotesReview({ notes, onChanged }: { notes: AbsenceNote[] | null; onChanged: () => void }) {
  const [filter, setFilter] = useState<Filter>("undecided");

  const counts = useMemo(() => {
    const c: Record<NoteStatus, number> = { undecided: 0, authorised: 0, unauthorised: 0 };
    (notes || []).forEach((n) => (c[n.status] += 1));
    return c;
  }, [notes]);
  const shown = useMemo(() => (notes || []).filter((n) => filter === "all" || n.status === filter), [notes, filter]);

  return (
    <section className="rounded-2xl border border-gold-light bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-light/60 px-4 py-3">
        <h2 className="text-base font-semibold text-ink">Reasons parents have sent</h2>
        <label className="text-xs font-medium text-ink/60">
          <span className="sr-only">Filter by status</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="rounded-lg border border-gold-light bg-white px-3 py-2 text-sm text-ink">
            <option value="undecided">Undecided ({counts.undecided})</option>
            <option value="authorised">Authorised ({counts.authorised})</option>
            <option value="unauthorised">Not authorised ({counts.unauthorised})</option>
            <option value="all">All ({(notes || []).length})</option>
          </select>
        </label>
      </div>
      <div className="px-4 py-4">
        {notes === null ? (
          <p className="text-sm text-ink/60">Loading…</p>
        ) : shown.length === 0 ? (
          <div className="py-4 text-center">
            <p className="font-medium text-ink">{filter === "undecided" ? "Nothing waiting for a decision" : "No notes here"}</p>
            <p className="mt-1 text-sm text-ink/60">When a parent sends a reason for an absence it will appear here.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {shown.map((n) => (
              <NoteRow key={n.id} note={n} onDone={onChanged} />
            ))}
          </ul>
        )}
      </div>
      <p className="border-t border-gold-light/40 px-4 py-3 text-xs text-ink/55">Every decision is written to the audit log with who made it.</p>
    </section>
  );
}
