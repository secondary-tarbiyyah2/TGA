"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { AnnouncementRow } from "./types";

export type AudienceClass = { id: string; name: string };

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Post or edit a notice. `existing` set = edit mode. */
export function ComposeModal({
  existing,
  classes,
  canPostSchool,
  onClose,
  onSaved,
}: {
  existing: AnnouncementRow | null;
  classes: AudienceClass[];
  canPostSchool: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = getSupabaseClient();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [audience, setAudience] = useState<string>(existing ? (existing.scope === "school" ? "school" : existing.class_id ?? "") : canPostSchool ? "school" : classes[0]?.id ?? "");
  const [pinned, setPinned] = useState(existing?.pinned ?? false);
  const [expires, setExpires] = useState(toDateInput(existing?.expires_at ?? null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = title.trim().length > 0 && body.trim().length > 0 && audience !== "";

  const save = async () => {
    if (!supabase || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Please sign in again.");
        return;
      }
      const isSchool = audience === "school";
      const fields = {
        scope: isSchool ? "school" : "class",
        class_id: isSchool ? null : audience,
        title: title.trim(),
        body: body.trim(),
        pinned,
        expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
      };
      const res = existing
        ? await supabase
            .from("announcements")
            .update({ ...fields, edited_at: new Date().toISOString() })
            .eq("id", existing.id)
        : await supabase.from("announcements").insert({ ...fields, author_id: user.id });
      if (res.error) {
        setError(res.error.message);
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const label = existing ? "Edit notice" : "Post notice";

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gold-light px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">{label}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-xl leading-none text-ink/55 hover:bg-cream">
            ×
          </button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <label className="block text-sm">
            <span className="font-medium text-ink">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="e.g. Eid holiday dates" className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Message</span>
            <textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Audience</span>
            <select value={audience} onChange={(e) => setAudience(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light bg-white px-3 py-2 text-sm">
              {canPostSchool && <option value="school">Whole school</option>}
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              {!canPostSchool && classes.length === 0 && <option value="">No classes available</option>}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>
                <span className="font-medium text-ink">Pin to top</span>
                <span className="block text-xs text-ink/65">Stays above newer notices.</span>
              </span>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">Expires on (optional)</span>
              <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2 text-sm" />
            </label>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gold-light px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gold-light px-4 py-2 text-sm font-medium text-ink/70 hover:bg-cream">
            Cancel
          </button>
          <button type="button" disabled={!valid || busy} onClick={save} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
            {busy ? "Saving…" : existing ? "Save changes" : "Post notice"}
          </button>
        </div>
      </div>
    </div>
  );
}
