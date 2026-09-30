"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Card } from "@/components/learn/Card";

type Row = { hero_heading: string | null; hero_body: string | null };

export function CurriculumContentEditor() {
  const supabase = getSupabaseClient();
  const [row, setRow] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("curriculum_content").select("*").eq("id", true).maybeSingle().then(({ data }) => setRow((data as Row) || null));
  }, [supabase]);

  async function save() {
    if (!supabase || !row) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.from("curriculum_content").update(row).eq("id", true);
    setSaving(false);
    setMessage(error ? `Could not save: ${error.message}` : "Saved. Changes go live on the next rebuild.");
  }

  if (!row) return <p className="text-sm text-ink/60">Loading…</p>;

  return (
    <Card title="Curriculum page content" description="Leave a field blank to keep the site's existing default copy.">
      <div className="space-y-4">
        <label className="block text-sm text-ink">
          Hero heading
          <input value={row.hero_heading || ""} onChange={(e) => setRow({ ...row, hero_heading: e.target.value })} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm text-ink">
          Hero body
          <textarea value={row.hero_body || ""} onChange={(e) => setRow({ ...row, hero_body: e.target.value })} rows={3} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>
      </div>
      <button type="button" onClick={save} disabled={saving} className="mt-6 rounded-full bg-gold-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-60">
        {saving ? "Saving…" : "Save"}
      </button>
      {message && <p className="mt-2 text-sm text-ink/70">{message}</p>}
    </Card>
  );
}
