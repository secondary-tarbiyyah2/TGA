"use client";

import { Loading } from "@/components/learn/kit";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { LoadProblem, SaveBar } from "./SaveBar";
import { Card } from "@/components/learn/Card";
import { triggerPublish } from "@/lib/learn/publishSiteContent";
import { aboutDefaults as D, withDefault, toStored } from "@/content/defaults";
import { COMPASS } from "@/content/compass";
import { DefaultTextField } from "./DefaultField";
import { ui } from "@/components/learn/ui";

type Row = {
  hero_heading: string | null;
  hero_body: string | null;
  mission_body: string | null;
  safeguarding_body: string | null;
  recipe_intro: string | null;
  /** No longer edited here: the values come from src/content/compass.ts (policy 23). Always saved empty. */
  recipe_items: [];
  family_heading: string | null;
  family_body: string | null;
};

const TEXT_KEYS = ["hero_heading", "hero_body", "mission_body", "safeguarding_body", "recipe_intro", "family_heading", "family_body"] as const;

function fill(r: Row): Row {
  const out = { ...r } as Row;
  for (const k of TEXT_KEYS) out[k] = withDefault(r[k], D[k]);
  out.recipe_items = [];
  return out;
}

function toPayload(row: Row): Row {
  const out = { ...row } as Row;
  for (const k of TEXT_KEYS) out[k] = toStored(row[k], D[k]);
  out.recipe_items = [];
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
      setMessage(`Could not save. Please try again.`);
      return;
    }
    setSavedJson(JSON.stringify(row));
    const publishMessage = await triggerPublish();
    setSaving(false);
    setMessage(publishMessage);
  }

  if (loadFailed) return <LoadProblem what="About page content" />;
  if (!row) return <Loading label="Loading…" bare />;
  const dirty = JSON.stringify(row) !== savedJson;

  return (
    <Card title="About page content" description="Showing the current website text. Edit it and Save to change the site.">
      <div className="grid gap-4 sm:grid-cols-2">
        <DefaultTextField label="Hero heading" value={row.hero_heading} def={D.hero_heading} onChange={(v) => setRow({ ...row, hero_heading: v })} />
        <div />
        <DefaultTextField label="Hero body" value={row.hero_body} def={D.hero_body} multiline rows={3} onChange={(v) => setRow({ ...row, hero_body: v })} />
        <DefaultTextField label="Mission body" value={row.mission_body} def={D.mission_body} multiline rows={3} onChange={(v) => setRow({ ...row, mission_body: v })} />
        <DefaultTextField label="Safeguarding body" value={row.safeguarding_body} def={D.safeguarding_body} multiline rows={3} onChange={(v) => setRow({ ...row, safeguarding_body: v })} />
        <DefaultTextField label="Tarbiyyah Compass intro" value={row.recipe_intro} def={D.recipe_intro} multiline rows={2} onChange={(v) => setRow({ ...row, recipe_intro: v })} />

        <div className="sm:col-span-2 rounded-lg border border-gold-light/50 p-3">
          <p className="text-sm font-medium text-ink">Tarbiyyah Compass values</p>
          <p className="mt-1 text-xs text-ink/70">
            Set by policy 23 (Tarbiyyah Compass Character Framework) so the website, reports and policies always agree. To change them, update the policy.
          </p>
          <ul className="mt-2 grid gap-1 text-sm text-ink/80 sm:grid-cols-5">
            {COMPASS.map((v) => (
              <li key={v.letter}>
                <span className="font-semibold text-ink">{v.letter}:</span> {v.word} ({v.gloss})
              </li>
            ))}
          </ul>
        </div>

        <DefaultTextField label="Tarbiyyah family heading" value={row.family_heading} def={D.family_heading} onChange={(v) => setRow({ ...row, family_heading: v })} />
        <div />
        <DefaultTextField label="Tarbiyyah family body" value={row.family_body} def={D.family_body} multiline rows={3} onChange={(v) => setRow({ ...row, family_body: v })} />
      </div>
      <SaveBar onSave={save} saving={saving} dirty={dirty} message={message} error={!!message?.startsWith("Could not")} />
    </Card>
  );
}
