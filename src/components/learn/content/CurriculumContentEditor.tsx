"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { LoadProblem, SaveBar } from "./SaveBar";
import { Card } from "@/components/learn/Card";
import { triggerPublish } from "@/lib/learn/publishSiteContent";
import { curriculumDefaults as D, withDefault, toStored } from "@/content/defaults";
import { DefaultTextField } from "./DefaultField";

type Row = { hero_heading: string | null; hero_body: string | null };

export function CurriculumContentEditor() {
  const supabase = getSupabaseClient();
  const [row, setRow] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("curriculum_content").select("*").eq("id", true).maybeSingle().then(({ data }) => {
      const r = (data as Row) || null;
      if (!r) return setLoadFailed(true);
      const filled = { hero_heading: withDefault(r.hero_heading, D.hero_heading), hero_body: withDefault(r.hero_body, D.hero_body) };
      setRow(filled);
      setSavedJson(JSON.stringify(filled));
    });
  }, [supabase]);

  async function save() {
    if (!supabase || !row) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.from("curriculum_content").update({ hero_heading: toStored(row.hero_heading, D.hero_heading), hero_body: toStored(row.hero_body, D.hero_body) }).eq("id", true);
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

  if (loadFailed) return <LoadProblem what="curriculum page content" />;
  if (!row) return <p className="text-sm text-ink/65">Loading…</p>;
  const dirty = JSON.stringify(row) !== savedJson;

  return (
    <Card title="Curriculum page content" description="Showing the current website text. Edit it and Save to change the site.">
      <div className="space-y-4">
        <DefaultTextField label="Hero heading" value={row.hero_heading} def={D.hero_heading} onChange={(v) => setRow({ ...row, hero_heading: v })} />
        <DefaultTextField label="Hero body" value={row.hero_body} def={D.hero_body} multiline onChange={(v) => setRow({ ...row, hero_body: v })} />
      </div>
      <SaveBar onSave={save} saving={saving} dirty={dirty} message={message} error={!!message?.startsWith("Could not")} />
    </Card>
  );
}
