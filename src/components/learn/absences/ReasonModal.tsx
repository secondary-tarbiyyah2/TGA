"use client";

import { useState } from "react";
import { REASONS, saveReason } from "./data";

export const modalFieldCls = "mt-1 w-full rounded-lg border border-gold-light bg-white px-3 py-2 text-sm text-ink focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-ink/55 hover:bg-cream" aria-label="Close">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Record the reason for a child's absence on one day. */
export function ReasonModal({ childId, childName, date, dateLabel, initialCode, onClose, onSaved }: { childId: string; childName: string; date: string; dateLabel: string; initialCode?: string; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(initialCode && initialCode !== "unknown" ? initialCode : "illness");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await saveReason(childId, date, code, note);
    setBusy(false);
    if (err) return setError("Couldn't save that reason. Please try again.");
    onSaved();
    onClose();
  };

  return (
    <Modal title={`Reason for ${childName}'s absence`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-ink/60">{dateLabel}</p>
        <label className="block text-sm font-medium text-ink">
          Reason
          <select value={code} onChange={(e) => setCode(e.target.value)} className={modalFieldCls}>
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Note (optional, staff only)
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={modalFieldCls} />
        </label>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <button type="submit" disabled={busy} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
          {busy ? "Saving…" : "Save reason"}
        </button>
      </form>
    </Modal>
  );
}
