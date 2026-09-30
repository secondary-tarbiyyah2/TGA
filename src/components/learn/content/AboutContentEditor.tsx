"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Card } from "@/components/learn/Card";

type RecipeItem = { letter: string; word: string; body: string };
type Row = {
  hero_heading: string | null;
  hero_body: string | null;
  mission_body: string | null;
  safeguarding_body: string | null;
  recipe_intro: string | null;
  recipe_items: RecipeItem[];
  family_heading: string | null;
  family_body: string | null;
};

export function AboutContentEditor() {
  const supabase = getSupabaseClient();
  const [row, setRow] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("about_content").select("*").eq("id", true).maybeSingle().then(({ data }) => setRow((data as Row) || null));
  }, [supabase]);

  async function save() {
    if (!supabase || !row) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.from("about_content").update(row).eq("id", true);
    setSaving(false);
    setMessage(error ? `Could not save: ${error.message}` : "Saved. Changes go live on the next rebuild.");
  }

  if (!row) return <p className="text-sm text-ink/60">Loading…</p>;
  const items = row.recipe_items || [];
  const setItems = (recipe_items: RecipeItem[]) => setRow({ ...row, recipe_items });

  return (
    <Card title="About page content" description="Leave a field blank to keep the site's existing default copy.">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-ink">
          Hero heading
          <input value={row.hero_heading || ""} onChange={(e) => setRow({ ...row, hero_heading: e.target.value })} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>
        <div />
        <label className="text-sm text-ink sm:col-span-2">
          Hero body
          <textarea value={row.hero_body || ""} onChange={(e) => setRow({ ...row, hero_body: e.target.value })} rows={3} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-ink sm:col-span-2">
          Mission body
          <textarea value={row.mission_body || ""} onChange={(e) => setRow({ ...row, mission_body: e.target.value })} rows={3} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-ink sm:col-span-2">
          Safeguarding body
          <textarea value={row.safeguarding_body || ""} onChange={(e) => setRow({ ...row, safeguarding_body: e.target.value })} rows={3} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-ink sm:col-span-2">
          RECIPE intro
          <textarea value={row.recipe_intro || ""} onChange={(e) => setRow({ ...row, recipe_intro: e.target.value })} rows={2} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>

        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-ink">RECIPE values</p>
          <div className="mt-2 space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex gap-2 rounded-lg border border-gold-light/50 p-2">
                <input value={item.letter} onChange={(e) => setItems(items.map((it, j) => (j === i ? { ...it, letter: e.target.value } : it)))} placeholder="Letter" className="w-14 rounded-md border border-gold-light/60 px-2 py-1 text-sm" />
                <div className="flex-1 space-y-1">
                  <input value={item.word} onChange={(e) => setItems(items.map((it, j) => (j === i ? { ...it, word: e.target.value } : it)))} placeholder="Word" className="block w-full rounded-md border border-gold-light/60 px-2 py-1 text-sm" />
                  <textarea value={item.body} onChange={(e) => setItems(items.map((it, j) => (j === i ? { ...it, body: e.target.value } : it)))} placeholder="Description" rows={2} className="block w-full rounded-md border border-gold-light/60 px-2 py-1 text-sm" />
                </div>
                <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="self-start text-xs text-red-700">
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setItems([...items, { letter: "", word: "", body: "" }])} className="mt-2 rounded-full border border-gold-500 px-3 py-1 text-xs text-gold-700 hover:bg-cream">
            Add item
          </button>
        </div>

        <label className="text-sm text-ink">
          Tarbiyyah family heading
          <input value={row.family_heading || ""} onChange={(e) => setRow({ ...row, family_heading: e.target.value })} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>
        <div />
        <label className="text-sm text-ink sm:col-span-2">
          Tarbiyyah family body
          <textarea value={row.family_body || ""} onChange={(e) => setRow({ ...row, family_body: e.target.value })} rows={3} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>
      </div>
      <button type="button" onClick={save} disabled={saving} className="mt-6 rounded-full bg-gold-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-60">
        {saving ? "Saving…" : "Save"}
      </button>
      {message && <p className="mt-2 text-sm text-ink/70">{message}</p>}
    </Card>
  );
}
