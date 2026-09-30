"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Card } from "@/components/learn/Card";

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

function TitleBodyListEditor({ label, items, onChange }: { label: string; items: TitleBody[]; onChange: (items: TitleBody[]) => void }) {
  return (
    <div className="sm:col-span-2">
      <p className="text-sm font-medium text-ink">{label}</p>
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

export function HomepageContentEditor() {
  const supabase = getSupabaseClient();
  const [row, setRow] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("homepage_content").select("*").eq("id", true).maybeSingle().then(({ data }) => setRow((data as Row) || null));
  }, [supabase]);

  async function save() {
    if (!supabase || !row) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.from("homepage_content").update(row).eq("id", true);
    setSaving(false);
    setMessage(error ? `Could not save: ${error.message}` : "Saved. Changes go live on the next rebuild.");
  }

  if (!row) return <p className="text-sm text-ink/60">Loading…</p>;

  return (
    <Card title="Homepage content" description="Leave a field blank to keep the site's existing default copy.">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-ink">
          Hero kicker
          <input value={row.hero_kicker || ""} onChange={(e) => setRow({ ...row, hero_kicker: e.target.value })} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-ink">
          Hero heading
          <input value={row.hero_heading || ""} onChange={(e) => setRow({ ...row, hero_heading: e.target.value })} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-ink sm:col-span-2">
          Hero body
          <textarea value={row.hero_body || ""} onChange={(e) => setRow({ ...row, hero_body: e.target.value })} rows={3} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>
        <TitleBodyListEditor label="Three pillars" items={row.pillars || []} onChange={(pillars) => setRow({ ...row, pillars })} />
        <label className="text-sm text-ink">
          &ldquo;How it works&rdquo; heading
          <input value={row.how_it_works_heading || ""} onChange={(e) => setRow({ ...row, how_it_works_heading: e.target.value })} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>
        <div />
        <TitleBodyListEditor label="How it works — steps" items={row.how_it_works_steps || []} onChange={(how_it_works_steps) => setRow({ ...row, how_it_works_steps })} />
        <label className="text-sm text-ink">
          Stages heading
          <input value={row.stages_heading || ""} onChange={(e) => setRow({ ...row, stages_heading: e.target.value })} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-ink">
          Stages body
          <input value={row.stages_body || ""} onChange={(e) => setRow({ ...row, stages_body: e.target.value })} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-ink">
          Fee teaser heading
          <input value={row.fee_teaser_heading || ""} onChange={(e) => setRow({ ...row, fee_teaser_heading: e.target.value })} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-ink">
          Fee teaser body
          <input value={row.fee_teaser_body || ""} onChange={(e) => setRow({ ...row, fee_teaser_body: e.target.value })} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-ink">
          &ldquo;Safe &amp; known&rdquo; heading
          <input value={row.safe_heading || ""} onChange={(e) => setRow({ ...row, safe_heading: e.target.value })} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-ink">
          &ldquo;Safe &amp; known&rdquo; body
          <input value={row.safe_body || ""} onChange={(e) => setRow({ ...row, safe_body: e.target.value })} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </label>
      </div>
      <button type="button" onClick={save} disabled={saving} className="mt-6 rounded-full bg-gold-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-60">
        {saving ? "Saving…" : "Save"}
      </button>
      {message && <p className="mt-2 text-sm text-ink/70">{message}</p>}
    </Card>
  );
}
