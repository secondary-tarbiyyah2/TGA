"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { LoadProblem, SaveBar } from "./SaveBar";
import { Card } from "@/components/learn/Card";
import { triggerPublish } from "@/lib/learn/publishSiteContent";
import { homepageDefaults as D, withDefault, toStored, listWithDefault, listToStored } from "@/content/defaults";
import { DefaultTextField, DefaultBadge, ResetLink } from "./DefaultField";

type TitleBody = { title: string; body: string };
type Row = {
  hero_kicker: string | null;
  hero_heading: string | null;
  hero_body: string | null;
  pillars: TitleBody[];
  how_it_works_heading: string | null;
  how_it_works_steps: TitleBody[];
  stages_heading: string | null;
  stages_body: string | null;
  fee_teaser_heading: string | null;
  fee_teaser_body: string | null;
  safe_heading: string | null;
  safe_body: string | null;
};

function TitleBodyListEditor({ label, items, def, onChange }: { label: string; items: TitleBody[]; def: TitleBody[]; onChange: (items: TitleBody[]) => void }) {
  const isDefault = JSON.stringify(items) === JSON.stringify(def);
  return (
    <div className="sm:col-span-2">
      <p className="text-sm font-medium text-ink">
        {label}
        <DefaultBadge isDefault={isDefault} />
        <ResetLink show={!isDefault} onReset={() => onChange(def)} />
      </p>
      <div className="mt-2 space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 rounded-lg border border-gold-light/50 p-2">
            <div className="flex-1 space-y-1">
              <input
                value={item.title}
                onChange={(e) => onChange(items.map((it, j) => (j === i ? { ...it, title: e.target.value } : it)))}
                placeholder="Title"
                className="block w-full rounded-md border border-gold-light/60 px-2 py-1 text-sm"
              />
              <textarea
                value={item.body}
                onChange={(e) => onChange(items.map((it, j) => (j === i ? { ...it, body: e.target.value } : it)))}
                placeholder="Body"
                rows={2}
                className="block w-full rounded-md border border-gold-light/60 px-2 py-1 text-sm"
              />
            </div>
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="self-start text-xs text-red-700">
              Remove
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...items, { title: "", body: "" }])} className="mt-2 rounded-full border border-gold-500 px-3 py-1 text-xs text-gold-700 hover:bg-cream">
        Add item
      </button>
    </div>
  );
}

const TEXT_KEYS = [
  "hero_kicker", "hero_heading", "hero_body", "how_it_works_heading", "stages_heading", "stages_body",
  "fee_teaser_heading", "fee_teaser_body", "safe_heading", "safe_body",
] as const;

function fill(r: Row): Row {
  const out = { ...r } as Row;
  for (const k of TEXT_KEYS) out[k] = withDefault(r[k], D[k]);
  out.pillars = listWithDefault(r.pillars, D.pillars);
  out.how_it_works_steps = listWithDefault(r.how_it_works_steps, D.how_it_works_steps);
  return out;
}

function toPayload(row: Row): Row {
  const out = { ...row } as Row;
  for (const k of TEXT_KEYS) out[k] = toStored(row[k], D[k]);
  out.pillars = listToStored(row.pillars, D.pillars);
  out.how_it_works_steps = listToStored(row.how_it_works_steps, D.how_it_works_steps);
  return out;
}

export function HomepageContentEditor() {
  const supabase = getSupabaseClient();
  const [row, setRow] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("homepage_content").select("*").eq("id", true).maybeSingle().then(({ data }) => {
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
    const { error } = await supabase.from("homepage_content").update(toPayload(row)).eq("id", true);
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

  if (loadFailed) return <LoadProblem what="homepage content" />;
  if (!row) return <p className="text-sm text-ink/65">Loading…</p>;
  const dirty = JSON.stringify(row) !== savedJson;

  return (
    <Card title="Homepage content" description="Showing the current website text. Edit it and Save to change the site.">
      <div className="grid gap-4 sm:grid-cols-2">
        <DefaultTextField label="Hero kicker" value={row.hero_kicker} def={D.hero_kicker} onChange={(v) => setRow({ ...row, hero_kicker: v })} />
        <DefaultTextField label="Hero heading" value={row.hero_heading} def={D.hero_heading} onChange={(v) => setRow({ ...row, hero_heading: v })} />
        <DefaultTextField label="Hero body" value={row.hero_body} def={D.hero_body} multiline onChange={(v) => setRow({ ...row, hero_body: v })} />
        <TitleBodyListEditor label="Three pillars" items={row.pillars} def={D.pillars} onChange={(pillars) => setRow({ ...row, pillars })} />
        <DefaultTextField label="“How it works” heading" value={row.how_it_works_heading} def={D.how_it_works_heading} wide onChange={(v) => setRow({ ...row, how_it_works_heading: v })} />
        <TitleBodyListEditor label="How it works, steps" items={row.how_it_works_steps} def={D.how_it_works_steps} onChange={(how_it_works_steps) => setRow({ ...row, how_it_works_steps })} />
        <DefaultTextField label="Stages heading" value={row.stages_heading} def={D.stages_heading} onChange={(v) => setRow({ ...row, stages_heading: v })} />
        <DefaultTextField label="Stages body" value={row.stages_body} def={D.stages_body} multiline onChange={(v) => setRow({ ...row, stages_body: v })} />
        <DefaultTextField label="Fee teaser heading" value={row.fee_teaser_heading} def={D.fee_teaser_heading} onChange={(v) => setRow({ ...row, fee_teaser_heading: v })} />
        <DefaultTextField label="Fee teaser body" value={row.fee_teaser_body} def={D.fee_teaser_body} multiline onChange={(v) => setRow({ ...row, fee_teaser_body: v })} />
        <DefaultTextField label="“Safe & known” heading" value={row.safe_heading} def={D.safe_heading} onChange={(v) => setRow({ ...row, safe_heading: v })} />
        <DefaultTextField label="“Safe & known” body" value={row.safe_body} def={D.safe_body} multiline onChange={(v) => setRow({ ...row, safe_body: v })} />
      </div>
      <SaveBar onSave={save} saving={saving} dirty={dirty} message={message} error={!!message?.startsWith("Could not")} />
    </Card>
  );
}
