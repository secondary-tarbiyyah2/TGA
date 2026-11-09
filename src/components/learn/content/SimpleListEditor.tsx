"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Card } from "@/components/learn/Card";
import { triggerPublish } from "@/lib/learn/publishSiteContent";
import { btn, ui } from "@/components/learn/ui";
import { Select } from "@/components/learn/Select";

import { askConfirm } from "@/components/learn/kit";
export type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "number" | "boolean" | "select" | "date";
  options?: string[];
  /** Display text for an option whose stored value should not be shown as-is. */
  optionLabels?: Record<string, string>;
  required?: boolean;
};

type Row = Record<string, unknown> & { id?: string };

/** Shared add/edit/delete list editor for the simpler website-content
 * tables (FAQs, testimonials, team profiles, differentiators, policies,
 * term dates, curriculum documents) · these all share the same shape
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
  searchable = false,
}: {
  table: string;
  title: string;
  description?: string;
  fields: FieldDef[];
  orderKey?: string;
  defaultOrderAscending?: boolean;
  rowLabel: (row: Row) => string;
  /** Show a filter box above the list (for long lists such as FAQs). */
  searchable?: boolean;
}) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Row>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [query, setQuery] = useState("");

  const load = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from(table).select("*").order(orderKey, { ascending: defaultOrderAscending });
    if (error) setMessage({ text: `Could not load this list. Please try again.`, error: true });
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
    // Required fields were marked but never checked, so blank rows could be saved.
    const missing = fields.filter((f) => f.required && f.type !== "boolean" && (draft[f.key] === null || draft[f.key] === undefined || String(draft[f.key]).trim() === "")).map((f) => f.label);
    if (missing.length) return setMessage({ text: `Fill in: ${missing.join(", ")}.`, error: true });
    setBusy(true);
    setMessage(null);
    const payload = { ...draft };
    delete payload.id;
    delete payload.created_at;
    const { error } = editingId === "new" ? await supabase.from(table).insert(payload) : await supabase.from(table).update(payload).eq("id", editingId);
    if (error) {
      setBusy(false);
      setMessage({ text: `Could not save. Please try again.`, error: true });
      return;
    }
    setEditingId(null);
    await load();
    setMessage({ text: await triggerPublish() });
    setBusy(false);
  }

  async function remove(row: Row) {
    if (!supabase || !(await askConfirm(`Delete "${rowLabel(row)}"? This can't be undone.`))) return;
    setBusy(true);
    const { error } = await supabase.from(table).delete().eq("id", row.id as string);
    if (error) {
      setBusy(false);
      return setMessage({ text: `Could not delete. Please try again.`, error: true });
    }
    await load();
    setMessage({ text: await triggerPublish() });
    setBusy(false);
  }

  const q = query.trim().toLowerCase();
  const shown = (rows || []).filter((r) => !q || fields.some((f) => String(r[f.key] ?? "").toLowerCase().includes(q)));

  return (
    <Card title={title} description={description}>
      {/* Add sits above the list, so a new entry opens where you clicked rather than below a long list. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {editingId !== "new" && (
          <button type="button" onClick={startNew} className={btn("primary")}>
            + Add new
          </button>
        )}
        {searchable && rows && rows.length > 5 && (
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter this list" aria-label={`Filter ${title}`} className={`${ui.input} min-w-[180px] flex-1 sm:max-w-xs`} />
        )}
        {rows && <span className="text-xs text-ink/65">{q ? `${shown.length} of ${rows.length}` : `${rows.length} entr${rows.length === 1 ? "y" : "ies"}`}</span>}
      </div>
      {message && <p role={message.error ? "alert" : "status"} className={`mb-3 text-sm ${message.error ? "text-red-700" : "text-ink/70"}`}>{message.text}</p>}
      {editingId === "new" && (
        <div className="mb-3 rounded-2xl border border-gold-light/50 bg-cream/40 p-3">
          <RowForm fields={fields} draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditingId(null)} busy={busy} />
        </div>
      )}
      {rows === null ? (
        <p className="text-sm text-ink/65">Loading…</p>
      ) : (
        <ul className="divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
          {shown.map((r) => (
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
                    <button type="button" onClick={() => remove(r)} disabled={busy} className="rounded-full border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50">
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {rows.length === 0 && <li className="p-3 text-sm text-ink/65">Nothing here yet. Use Add new to create the first entry.</li>}
          {rows.length > 0 && shown.length === 0 && <li className="p-3 text-sm text-ink/65">Nothing matches &ldquo;{query}&rdquo;.</li>}
        </ul>
      )}
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
            {f.required && f.type !== "boolean" && <span className="text-red-700" aria-hidden="true"> *</span>}
            {f.type === "textarea" ? (
              <textarea value={(draft[f.key] as string) || ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} rows={3} className={`${ui.textarea} mt-1`} />
            ) : f.type === "boolean" ? (
              <input type="checkbox" checked={Boolean(draft[f.key])} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.checked })} className="mt-2 block" />
            ) : f.type === "select" ? (
              <Select value={(draft[f.key] as string) || ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value || null })} className={`${ui.select} mt-1`}>
                <option value="">–</option>
                {(f.options || []).map((o) => (
                  <option key={o} value={o}>{f.optionLabels?.[o] ?? o}</option>
                ))}
              </Select>
            ) : (
              <input
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                value={(draft[f.key] as string | number) ?? ""}
                onChange={(e) => setDraft({ ...draft, [f.key]: f.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value || null })}
                required={f.required}
                className={`${ui.input} mt-1`}
              />
            )}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onSave} disabled={busy} className={btn("primary", "sm")}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className={btn("secondary", "sm")}>
          Cancel
        </button>
      </div>
    </div>
  );
}
