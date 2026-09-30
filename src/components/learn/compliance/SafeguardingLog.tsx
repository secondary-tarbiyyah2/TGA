"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type Concern = {
  id: string;
  subject_description: string | null;
  severity: string;
  status: string;
  summary: string;
  actions_taken: string | null;
  outcome: string | null;
  referral_details: string | null;
  created_at: string;
  safeguarding_categories?: { label: string } | null;
};
type ChronologyEntry = { id: string; entry: string; entered_at: string };
type Attachment = { id: string; filename: string; storage_path: string; uploaded_at: string };

function ConcernDetail({ concern, onChanged }: { concern: Concern; onChanged: () => void }) {
  const supabase = getSupabaseClient();
  const [chronology, setChronology] = useState<ChronologyEntry[] | null>(null);
  const [attachments, setAttachments] = useState<Attachment[] | null>(null);
  const [entry, setEntry] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState(concern.status);
  const [actionsTaken, setActionsTaken] = useState(concern.actions_taken || "");
  const [outcome, setOutcome] = useState(concern.outcome || "");
  const [referral, setReferral] = useState(concern.referral_details || "");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!supabase) return;
    const [chron, atts] = await Promise.all([
      supabase.from("safeguarding_chronology").select("id, entry, entered_at").eq("concern_id", concern.id).order("entered_at", { ascending: false }),
      supabase.from("safeguarding_attachments").select("id, filename, storage_path, uploaded_at").eq("concern_id", concern.id).order("uploaded_at", { ascending: false }),
    ]);
    setChronology((chron.data as ChronologyEntry[]) || []);
    setAttachments((atts.data as Attachment[]) || []);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading this concern's chronology/attachments on selection, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concern.id]);

  const addEntry = async () => {
    if (!supabase || !entry.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setBusy(true);
    await supabase.from("safeguarding_chronology").insert({ concern_id: concern.id, entry: entry.trim(), entered_by: user.id });
    setEntry("");
    setBusy(false);
    await load();
  };

  const uploadFile = async () => {
    if (!supabase || !file) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setBusy(true);
    const path = `${concern.id}/${Date.now()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("safeguarding-attachments").upload(path, file);
    if (!uploadErr) {
      await supabase.from("safeguarding_attachments").insert({ concern_id: concern.id, storage_path: path, filename: file.name, uploaded_by: user.id });
    }
    setFile(null);
    setBusy(false);
    await load();
  };

  const saveCase = async () => {
    if (!supabase) return;
    setBusy(true);
    await supabase
      .from("safeguarding_concerns")
      .update({ status, actions_taken: actionsTaken || null, outcome: outcome || null, referral_details: referral || null, closed_at: status === "closed" ? new Date().toISOString() : null })
      .eq("id", concern.id);
    setBusy(false);
    onChanged();
  };

  return (
    <div className="mt-4 rounded-xl border border-red-200 bg-red-50/50 p-4">
      <p className="text-sm font-semibold text-ink">{concern.subject_description}</p>
      <p className="mt-1 text-sm text-ink/70">{concern.summary}</p>
      <p className="mt-1 text-xs text-ink/50">
        {concern.safeguarding_categories?.label || "Uncategorised"} · severity: {concern.severity} · reported {new Date(concern.created_at).toLocaleString("en-GB")}
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-ink/70">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm">
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="closed">Closed</option>
          </select>
        </label>
      </div>
      <label className="mt-2 block text-xs text-ink/70">
        Actions taken
        <textarea value={actionsTaken} onChange={(e) => setActionsTaken(e.target.value)} rows={2} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm" />
      </label>
      <label className="mt-2 block text-xs text-ink/70">
        Outcome
        <textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={2} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm" />
      </label>
      <label className="mt-2 block text-xs text-ink/70">
        Referral details (e.g. external agency referred to, and when)
        <textarea value={referral} onChange={(e) => setReferral(e.target.value)} rows={2} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm" />
      </label>
      <button type="button" onClick={saveCase} disabled={busy} className="mt-2 rounded-full bg-gold-500 px-4 py-1.5 text-xs font-semibold text-ink-900 hover:brightness-95 disabled:opacity-60">
        Save case details
      </button>

      <div className="mt-4 border-t border-red-200 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">Chronology (append-only)</p>
        <ul className="mt-2 space-y-2">
          {chronology === null && <p className="text-sm text-ink/50">Loading…</p>}
          {(chronology || []).map((c) => (
            <li key={c.id} className="rounded-lg bg-white p-2 text-sm">
              <p>{c.entry}</p>
              <p className="mt-0.5 text-xs text-ink/50">{new Date(c.entered_at).toLocaleString("en-GB")}</p>
            </li>
          ))}
          {chronology?.length === 0 && <p className="text-sm text-ink/50">No chronology entries yet.</p>}
        </ul>
        <div className="mt-2 flex gap-2">
          <textarea value={entry} onChange={(e) => setEntry(e.target.value)} rows={2} placeholder="Add a dated entry…" className="flex-1 rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm" />
          <button type="button" onClick={addEntry} disabled={busy} className="self-start rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
            Add
          </button>
        </div>
      </div>

      <div className="mt-4 border-t border-red-200 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">Secure attachments</p>
        <ul className="mt-2 space-y-1">
          {attachments === null && <p className="text-sm text-ink/50">Loading…</p>}
          {(attachments || []).map((a) => (
            <li key={a.id} className="text-sm text-ink/70">
              {a.filename} — {new Date(a.uploaded_at).toLocaleDateString("en-GB")}
            </li>
          ))}
          {attachments?.length === 0 && <p className="text-sm text-ink/50">No attachments.</p>}
        </ul>
        <div className="mt-2 flex items-center gap-2">
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
          <button type="button" onClick={uploadFile} disabled={busy || !file} className="rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
            Upload
          </button>
        </div>
      </div>
    </div>
  );
}

export function SafeguardingLog() {
  const supabase = getSupabaseClient();
  const [concerns, setConcerns] = useState<Concern[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("safeguarding_concerns")
      .select("id, subject_description, severity, status, summary, actions_taken, outcome, referral_details, created_at, safeguarding_categories(label)")
      .order("created_at", { ascending: false });
    setConcerns((data as unknown as Concern[]) || []);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Safeguarding log</h2>
      <p className="mt-1 text-xs text-ink/50">
        Visible only to you as Safeguarding Lead / Head Teacher, with a freshly re-verified authenticator code. Even Admin cannot see
        this section.
      </p>
      <ul className="mt-3 space-y-2">
        {concerns === null && <p className="text-sm text-ink/60">Loading…</p>}
        {(concerns || []).map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setSelected(selected === c.id ? null : c.id)}
              className="w-full rounded-lg border border-gold-light/40 p-3 text-left text-sm hover:bg-cream"
            >
              <span className="font-semibold">{c.subject_description}</span> — {c.status} ({c.severity}) · {new Date(c.created_at).toLocaleDateString("en-GB")}
            </button>
            {selected === c.id && <ConcernDetail concern={c} onChanged={load} />}
          </li>
        ))}
        {concerns?.length === 0 && <p className="text-sm text-ink/60">No safeguarding concerns recorded.</p>}
      </ul>
    </div>
  );
}

