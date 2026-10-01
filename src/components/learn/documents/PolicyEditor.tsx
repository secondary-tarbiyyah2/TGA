"use client";

import { absoluteFileUrl } from "@/lib/learn/fileLinks";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/learn/Card";
import { getPolicyLinks } from "@/lib/content";
import { triggerPublish } from "@/lib/learn/publishSiteContent";
import { getSupabaseClient } from "@/lib/supabase/client";

type Row = {
  id: string;
  number: string;
  title: string;
  category: "required" | "published";
  parent_question_category: string | null;
  file_url: string;
  summary: string | null;
  last_reviewed: string | null;
  next_review: string | null;
  order_index: number;
  deleted_at: string | null;
};

const BLANK: Omit<Row, "id" | "deleted_at"> = {
  number: "", title: "", category: "required", parent_question_category: null, file_url: "", summary: null, last_reviewed: null, next_review: null, order_index: 0,
};
const GROUPS = ["safety", "admissions-fees", "complaints", "data", "curriculum"];
const inputCls = "mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm";

/**
 * Website policy editor ("Policy documents" in Website content).
 *
 * Reads policy_links directly (the same table getPolicyLinks() reads for the
 * public site). The old generic editor showed "Nothing here yet" because
 * that table was never seeded, so the website fell back to the bundled
 * seed.ts list while the editor saw zero rows; migration 0047 seeds it, and
 * the Import button below covers any database where it still is empty.
 * "Remove" is a soft delete (deleted_at): the public read policy hides it
 * and it can be restored here.
 */
export function PolicyEditor() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Omit<Row, "id" | "deleted_at">>(BLANK);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("policy_links").select("*").order("order_index");
    if (error) setMessage({ text: `Could not load policies: ${error.message}`, error: true });
    setRows((data as Row[]) || []);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const live = (rows || []).filter((r) => !r.deleted_at);
  const removed = (rows || []).filter((r) => r.deleted_at);

  const publish = async (prefix: string) => setMessage({ text: `${prefix} ${await triggerPublish()}` });

  const startEdit = (r: Row) => {
    setEditingId(r.id);
    setDraft({
      number: r.number, title: r.title, category: r.category, parent_question_category: r.parent_question_category, file_url: r.file_url,
      summary: r.summary, last_reviewed: r.last_reviewed, next_review: r.next_review, order_index: r.order_index,
    });
    setMessage(null);
  };
  const startNew = () => {
    setEditingId("new");
    setDraft({ ...BLANK, order_index: (live[live.length - 1]?.order_index ?? 0) + 1 });
    setMessage(null);
  };

  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function upload(file: File) {
    if (!supabase) return;
    if (file.type !== "application/pdf") return setMessage({ text: "Please choose a PDF file.", error: true });
    if (file.size > 20 * 1024 * 1024) return setMessage({ text: "That PDF is over 20 MB.", error: true });
    setBusy(true);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").toLowerCase();
    const path = `${Date.now()}-${safe}`;
    const { error } = await supabase.storage.from("policy-documents").upload(path, file, { contentType: "application/pdf", upsert: false });
    if (error) {
      setBusy(false);
      return setMessage({ text: `Upload failed: ${error.message}. Only a Headteacher or Admin can upload.`, error: true });
    }
    set("file_url", supabase.storage.from("policy-documents").getPublicUrl(path).data.publicUrl);
    setBusy(false);
    setMessage({ text: "Uploaded. Press Save to attach it to this policy." });
  }

  // Keep the signature record in step with the policy: new title / file URL
  // is a new version people must sign again; a removed policy stops asking.
  async function syncSignable(id: string, fields: { title?: string; file_url?: string; requires_signature?: boolean }) {
    if (!supabase) return;
    await supabase.from("signable_documents").update(fields).eq("sanity_document_id", `policy:${id}`).eq("source", "policy");
  }

  async function save() {
    if (!supabase) return;
    if (!draft.number.trim() || !draft.title.trim()) return setMessage({ text: "Policy number and title are required.", error: true });
    if (!draft.file_url.trim()) return setMessage({ text: "Add a file URL or upload a PDF.", error: true });
    if (!/^(https:\/\/|\/)/i.test(draft.file_url.trim())) return setMessage({ text: "The file URL must start with https:// or /", error: true });
    setBusy(true);
    const payload = {
      ...draft,
      number: draft.number.trim(),
      title: draft.title.trim(),
      file_url: draft.file_url.trim(),
      summary: draft.summary?.trim() || null,
      last_reviewed: draft.last_reviewed || null,
      next_review: draft.next_review || null,
      updated_at: new Date().toISOString(),
    };
    const isNew = editingId === "new";
    const { error } = isNew ? await supabase.from("policy_links").insert(payload) : await supabase.from("policy_links").update(payload).eq("id", editingId);
    if (error) {
      setBusy(false);
      return setMessage({ text: `Could not save: ${error.message}`, error: true });
    }
    if (!isNew && editingId) await syncSignable(editingId, { title: `${payload.number}. ${payload.title}`, file_url: payload.file_url });
    setEditingId(null);
    await load();
    await publish("Saved.");
    setBusy(false);
  }

  async function remove(r: Row) {
    if (!supabase) return;
    if (!confirm(`Remove "${r.title}" from the website? It stops being listed publicly and nobody is asked to sign it. You can restore it later.`)) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("policy_links").update({ deleted_at: new Date().toISOString(), deleted_by: u.user?.id ?? null }).eq("id", r.id);
    if (error) {
      setBusy(false);
      return setMessage({ text: `Could not remove: ${error.message}`, error: true });
    }
    await syncSignable(r.id, { requires_signature: false });
    await load();
    await publish("Removed.");
    setBusy(false);
  }

  async function restore(r: Row) {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.from("policy_links").update({ deleted_at: null, deleted_by: null }).eq("id", r.id);
    if (error) setMessage({ text: `Could not restore: ${error.message}`, error: true });
    else {
      await load();
      await publish("Restored.");
    }
    setBusy(false);
  }

  async function importCurrent() {
    if (!supabase) return;
    setBusy(true);
    const current = await getPolicyLinks();
    const { error } = await supabase.from("policy_links").insert(
      current.map((p, i) => ({
        number: p.number, title: p.title, category: p.category, parent_question_category: p.parentQuestionCategory ?? null, file_url: p.fileUrl,
        summary: p.summary ?? null, last_reviewed: p.lastReviewed ?? null, next_review: p.nextReview ?? null, order_index: p.order ?? i + 1,
      })),
    );
    if (error) setMessage({ text: `Could not import: ${error.message}`, error: true });
    else {
      await load();
      setMessage({ text: `Imported ${current.length} policies.` });
    }
    setBusy(false);
  }

  const form = (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-ink">Policy number
          <input value={draft.number} onChange={(e) => set("number", e.target.value)} className={inputCls} />
        </label>
        <label className="text-sm text-ink">Title
          <input value={draft.title} onChange={(e) => set("title", e.target.value)} className={inputCls} />
        </label>
        <label className="text-sm text-ink sm:col-span-2">One-line summary
          <input value={draft.summary || ""} onChange={(e) => set("summary", e.target.value)} className={inputCls} />
        </label>
        <div className="text-sm text-ink sm:col-span-2">
          <label>File URL
            <input value={draft.file_url} onChange={(e) => set("file_url", e.target.value)} placeholder="https://… or /policies/…pdf" className={inputCls} />
          </label>
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-medium text-ink/80 hover:bg-cream">
            Or upload a PDF
            <input type="file" accept="application/pdf" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          <p className="mt-1 text-xs text-ink/50">Replacing the file makes everyone who must sign this policy sign the new version.</p>
        </div>
        <label className="text-sm text-ink">Category
          <select value={draft.category} onChange={(e) => set("category", e.target.value as Row["category"])} className={inputCls}>
            <option value="required">Required (DfE)</option>
            <option value="published">Published</option>
          </select>
        </label>
        <label className="text-sm text-ink">Parent question group
          <select value={draft.parent_question_category || ""} onChange={(e) => set("parent_question_category", e.target.value || null)} className={inputCls}>
            <option value="">None</option>
            {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label className="text-sm text-ink">Last reviewed
          <input type="date" value={draft.last_reviewed || ""} onChange={(e) => set("last_reviewed", e.target.value || null)} className={inputCls} />
        </label>
        <label className="text-sm text-ink">Review due
          <input type="date" value={draft.next_review || ""} onChange={(e) => set("next_review", e.target.value || null)} className={inputCls} />
        </label>
        <label className="text-sm text-ink">Display order
          <input type="number" value={draft.order_index} onChange={(e) => set("order_index", Number(e.target.value))} className={inputCls} />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={busy} className="rounded-full bg-gold-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-gold-900 disabled:opacity-60">{busy ? "Working…" : "Save"}</button>
        <button type="button" onClick={() => setEditingId(null)} className="rounded-full border border-gold-light/60 px-4 py-1.5 text-xs text-ink/70 hover:bg-cream">Cancel</button>
      </div>
    </div>
  );

  return (
    <Card title="Policy documents" description="The policies listed on the website's Policies page. Changes go live on the next site rebuild (triggered automatically on save). To choose which policies need a signature, use Documents & signatures.">
      {rows === null ? (
        <p className="text-sm text-ink/60">Loading…</p>
      ) : (
        <ul className="divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
          {live.map((r) => (
            <li key={r.id} className="p-3">
              {editingId === r.id ? (
                form
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-ink">{r.number} &mdash; {r.title}</p>
                    <p className="text-xs text-ink/50">
                      {r.category === "required" ? "Required" : "Published"}
                      {r.next_review ? ` · review due ${new Date(r.next_review).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}` : ""}
                      {" · "}
                      <a href={absoluteFileUrl(r.file_url)} target="_blank" rel="noreferrer" className="text-teal-700 hover:underline">file</a>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => startEdit(r)} className="rounded-full border border-gold-500 px-3 py-1 text-xs text-gold-700 hover:bg-cream">Edit</button>
                    <button type="button" onClick={() => remove(r)} disabled={busy} className="rounded-full border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50">Remove</button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {live.length === 0 && (
            <li className="p-3 text-sm text-ink/60">
              No policies in the database yet.{" "}
              <button type="button" onClick={importCurrent} disabled={busy} className="font-medium text-teal-700 underline disabled:opacity-50">Import the current website policies</button>
            </li>
          )}
        </ul>
      )}

      {editingId === "new" ? (
        <div className="mt-3 rounded-2xl border border-gold-light/50 bg-cream/40 p-3">{form}</div>
      ) : (
        <button type="button" onClick={startNew} className="mt-3 rounded-full bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900">Add new</button>
      )}

      {removed.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setShowRemoved((v) => !v)} className="text-xs font-medium text-ink/60 underline">
            {showRemoved ? "Hide" : "Show"} removed ({removed.length})
          </button>
          {showRemoved && (
            <ul className="mt-2 divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
              {removed.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm text-ink/60">
                  <span>{r.number} &mdash; {r.title}</span>
                  <button type="button" onClick={() => restore(r)} disabled={busy} className="rounded-full border border-gold-light px-3 py-1 text-xs text-ink/75 hover:bg-cream disabled:opacity-50">Restore</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {message && <p className={`mt-2 text-sm ${message.error ? "text-red-700" : "text-ink/70"}`}>{message.text}</p>}
    </Card>
  );
}
