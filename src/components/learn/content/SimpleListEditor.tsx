"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Card } from "@/components/learn/Card";
import { triggerPublish } from "@/lib/learn/publishSiteContent";

export type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "number" | "boolean" | "select" | "date";
  options?: string[];
  required?: boolean;
};

type Row = Record<string, unknown> & { id?: string };

/** Shared add/edit/delete list editor for the simpler website-content
 * tables (FAQs, testimonials, team profiles, differentiators, policies,
 * term dates, curriculum documents) — these all share the same shape
 * (a flat row of text/number/boolean fields, ordered by order_index),
 * so one generic editor replaces eight near-identical bespoke ones. */
export function SimpleListEditor({
  table,
  title,
  description,
  fields,
  orderKey = "order_index",
  defaultOrderAscending = true,
  rowLabel,
}: {
  table: string;
  title: string;
  description?: string;
  fields: FieldDef[];
  orderKey?: string;
  defaultOrderAscending?: boolean;
  rowLabel: (row: Row) => string;
}) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Row>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase.from(table).select("*").order(orderKey, { ascending: defaultOrderAscending });
    setRows((data as Row[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  function startEdit(row: Row) {
    setEditingId(row.id as string);
    setDraft({ ...row });
    setMessage(null);
  }

  function startNew() {
    const blank: Row = {};
    for (const f of fields) blank[f.key] = f.type === "boolean" ? false : f.type === "number" ? null : "";
    setEditingId("new");
    setDraft(blank);
    setMessage(null);
  }

  async function save() {
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    const payload = { ...draft };
    delete payload.id;
    delete payload.created_at;
    const { error } = editingId === "new" ? await supabase.from(table).insert(payload) : await supabase.from(table).update(payload).eq("id", editingId);
    if (error) {
      setBusy(false);
      setMessage(`Could not save: ${error.message}`);
      return;
    }
    setEditingId(null);
    await load();
    setMessage(await triggerPublish());
    setBusy(false);
  }

  async function remove(id: string) {
    if (!supabase || !confirm("Delete this entry? This can't be undone.")) return;
    setBusy(true);
    await supabase.from(table).delete().eq("id", id);
    await load();
    setMessage(await triggerPublish());
    setBusy(false);
  }

  return (
    <Card title={title} description={description}>
      {rows === null ? (
        <p className="text-sm text-ink/60">Loading…</p>
      ) : (
        <ul className="divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
          {rows.map((r) => (
            <li key={r.id as string} className="p-3">
              {editingId === r.id ? (
                <RowForm fields={fields} draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditingId(null)} busy={busy} />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink">{rowLabel(r)}</span>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => startEdit(r)} className="rounded-full border border-gold-500 px-3 py-1 text-xs text-gold-700 hover:bg-cream">
                      Edit
                    </button>
                    <button type="button" onClick={() => remove(r.id as string)} className="rounded-full border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50">
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {rows.length === 0 && <li className="p-3 text-sm text-ink/60">Nothing here yet.</li>}
        </ul>
      )}

      {editingId === "new" ? (
        <div className="mt-3 rounded-2xl border border-gold-light/50 bg-cream/40 p-3">
          <RowForm fields={fields} draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditingId(null)} busy={busy} />
        </div>
      ) : (
        <button type="button" onClick={startNew} className="mt-3 rounded-full bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900">
          Add new
        </button>
      )}
      {message && <p className={`mt-2 text-sm ${message.startsWith("Could not save") ? "text-red-700" : "text-ink/70"}`}>{message}</p>}
    </Card>
  );
}

function RowForm({ fields, draft, setDraft, onSave, onCancel, busy }: { fields: FieldDef[]; draft: Row; setDraft: (r: Row) => void; onSave: () => void; onCancel: () => void; busy: boolean }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className={`text-sm text-ink ${f.type === "textarea" ? "sm:col-span-2" : ""}`}>
            {f.label}
            {f.type === "textarea" ? (
              <textarea value={(draft[f.key] as string) || ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} rows={3} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
            ) : f.type === "boolean" ? (
              <input type="checkbox" checked={Boolean(draft[f.key])} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.checked })} className="mt-2 block" />
            ) : f.type === "select" ? (
              <select value={(draft[f.key] as string) || ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value || null })} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm">
                <option value="">—</option>
                {(f.options || []).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                value={(draft[f.key] as string | number) ?? ""}
                onChange={(e) => setDraft({ ...draft, [f.key]: f.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value || null })}
                required={f.required}
                className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
              />
            )}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onSave} disabled={busy} className="rounded-full bg-gold-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-gold-900 disabled:opacity-60">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-full border border-gold-light/60 px-4 py-1.5 text-xs text-ink/70 hover:bg-cream">
          Cancel
        </button>
      </div>
    </div>
  );
}
