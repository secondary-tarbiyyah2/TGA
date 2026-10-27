"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { LoadProblem, SaveBar } from "./SaveBar";
import { Card } from "@/components/learn/Card";
import { triggerPublish } from "@/lib/learn/publishSiteContent";
import { aboutDefaults as D, withDefault, toStored, listWithDefault, listToStored } from "@/content/defaults";
import { DefaultTextField, DefaultBadge, ResetLink } from "./DefaultField";

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

const TEXT_KEYS = ["hero_heading", "hero_body", "mission_body", "safeguarding_body", "recipe_intro", "family_heading", "family_body"] as const;

function fill(r: Row): Row {
  const out = { ...r } as Row;
  for (const k of TEXT_KEYS) out[k] = withDefault(r[k], D[k]);
  out.recipe_items = listWithDefault(r.recipe_items, D.recipe_items);
  return out;
}

function toPayload(row: Row): Row {
  const out = { ...row } as Row;
  for (const k of TEXT_KEYS) out[k] = toStored(row[k], D[k]);
  out.recipe_items = listToStored(row.recipe_items, D.recipe_items);
  return out;
}

export function AboutContentEditor() {
  const supabase = getSupabaseClient();
  const [row, setRow] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("about_content").select("*").eq("id", true).maybeSingle().then(({ data }) => {
      const r = (data as Row) || null;
      if (!r) return setLoadFailed(true);
      const filled = fill(r);
      setRow(filled);
      setSavedJson(JSON.stringify(filled));
    });
  }, [supabase]);

  async function save() {
    if (!supabase || !row) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.from("about_content").update(toPayload(row)).eq("id", true);
    if (error) {
      setSaving(false);
      setMessage(`Could not save: ${error.message}`);
      return;
    }
    setSavedJson(JSON.stringify(row));
    const publishMessage = await triggerPublish();
    setSaving(false);
    setMessage(publishMessage);
  }

  if (loadFailed) return <LoadProblem what="About page content" />;
  if (!row) return <p className="text-sm text-ink/65">Loading…</p>;
  const dirty = JSON.stringify(row) !== savedJson;
  const items = row.recipe_items || [];
  const setItems = (recipe_items: RecipeItem[]) => setRow({ ...row, recipe_items });

  return (
    <Card title="About page content" description="Showing the current website text. Edit it and Save to change the site.">
      <div className="grid gap-4 sm:grid-cols-2">
        <DefaultTextField label="Hero heading" value={row.hero_heading} def={D.hero_heading} onChange={(v) => setRow({ ...row, hero_heading: v })} />
        <div />
        <DefaultTextField label="Hero body" value={row.hero_body} def={D.hero_body} multiline rows={3} onChange={(v) => setRow({ ...row, hero_body: v })} />
        <DefaultTextField label="Mission body" value={row.mission_body} def={D.mission_body} multiline rows={3} onChange={(v) => setRow({ ...row, mission_body: v })} />
        <DefaultTextField label="Safeguarding body" value={row.safeguarding_body} def={D.safeguarding_body} multiline rows={3} onChange={(v) => setRow({ ...row, safeguarding_body: v })} />
        <DefaultTextField label="RECIPE intro" value={row.recipe_intro} def={D.recipe_intro} multiline rows={2} onChange={(v) => setRow({ ...row, recipe_intro: v })} />

        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-ink">
            RECIPE values
            <DefaultBadge isDefault={JSON.stringify(items) === JSON.stringify(D.recipe_items)} />
            <ResetLink show={JSON.stringify(items) !== JSON.stringify(D.recipe_items)} onReset={() => setItems(D.recipe_items)} />
          </p>
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

        <DefaultTextField label="Tarbiyyah family heading" value={row.family_heading} def={D.family_heading} onChange={(v) => setRow({ ...row, family_heading: v })} />
        <div />
        <DefaultTextField label="Tarbiyyah family body" value={row.family_body} def={D.family_body} multiline rows={3} onChange={(v) => setRow({ ...row, family_body: v })} />
      </div>
      <SaveBar onSave={save} saving={saving} dirty={dirty} message={message} error={!!message?.startsWith("Could not")} />
    </Card>
  );
}
