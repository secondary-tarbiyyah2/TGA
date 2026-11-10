"use client";

import { Loading } from "@/components/learn/kit";
import { Icon } from "@/components/learn/Icon";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { MAIN_SITE_ORIGIN } from "@/lib/learn/origin";
import { Card } from "@/components/learn/Card";
import { triggerPublish } from "@/lib/learn/publishSiteContent";
import { btn, ui } from "@/components/learn/ui";

type WeeklyRow = { subject: string; lessons: number | string };
type Row = {
  slug: string;
  range: string;
  title: string;
  intro: string | null;
  subjects: string[];
  weekly: WeeklyRow[];
  lesson_length: string | null;
  total_lessons: string | null;
  note: string | null;
  gcse_note: string | null;
  order_index: number;
  visible: boolean;
};

const inputCls = `mt-1 ${ui.input}`;

/**
 * Key-stage pages editor ("Curriculum page" tab in Website content).
 *
 * Each row is one /curriculum/<slug> page: the subject list, the "Live
 * lessons each week" table, the intro paragraph and the notes under the
 * table. Before migration 0105 all of this was fixed in
 * src/content/curriculum.ts, so the Lessons-a-week figures could only be
 * changed by editing code. The public site is a static export, so Save
 * triggers a rebuild (live in a few minutes), like the other page editors.
 */
export function KeyStagePagesEditor() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("key_stage_pages").select("*").order("order_index");
    if (error) setMessage({ text: `Could not load the key-stage pages. Please try again.`, error: true });
    setRows(((data as Row[]) || []).map((r) => ({ ...r, subjects: Array.isArray(r.subjects) ? r.subjects : [], weekly: Array.isArray(r.weekly) ? r.weekly : [] })));
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const update = (slug: string, patch: Partial<Row>) => setRows((rs) => (rs || []).map((r) => (r.slug === slug ? { ...r, ...patch } : r)));

  async function save(r: Row) {
    if (!supabase) return;
    if (!r.range.trim() || !r.title.trim()) return setMessage({ text: "Year range and key stage title are required.", error: true });
    const weekly = r.weekly.filter((w) => w.subject.trim()).map((w) => ({ subject: w.subject.trim(), lessons: w.lessons === "" ? "" : Number.isFinite(Number(w.lessons)) ? Number(w.lessons) : String(w.lessons).trim() }));
    const subjects = r.subjects.map((s) => s.trim()).filter(Boolean);
    setBusy(true);
    setMessage(null);
    const { error } = await supabase
      .from("key_stage_pages")
      .update({
        range: r.range.trim(), title: r.title.trim(), intro: r.intro?.trim() || null, subjects, weekly,
        lesson_length: r.lesson_length?.trim() || null, total_lessons: r.total_lessons?.trim() || null,
        note: r.note?.trim() || null, gcse_note: r.gcse_note?.trim() || null, order_index: r.order_index, visible: r.visible,
        updated_at: new Date().toISOString(),
      })
      .eq("slug", r.slug);
    if (error) {
      setBusy(false);
      return setMessage({ text: `Could not save. Please try again.`, error: true });
    }
    const publishMessage = await triggerPublish();
    await load();
    setBusy(false);
    setMessage({ text: publishMessage });
  }

  const lessonsTotal = (r: Row) => r.weekly.reduce((n, w) => n + (Number.isFinite(Number(w.lessons)) ? Number(w.lessons) : 0), 0);

  if (rows === null) return <Loading label="Loading…" bare />;

  return (
    <Card title="Key-stage pages" description="What each /curriculum page shows: the subject list, the 'Live lessons each week' table, the intro and the notes. These figures should match the Curriculum Policy (12) and the Flexible Learning Policy (21). Saving triggers a site rebuild, live in a few minutes.">
      <ul className="divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
        {rows.map((r) => (
          <li key={r.slug} className="p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-ink">
                  {r.range} <span className="text-ink/65">· {r.title}</span>
                  {!r.visible && <span className="ml-2 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink/70">Hidden from website</span>}
                </p>
                <p className="text-xs text-ink/65">
                  {r.subjects.length} subjects · {lessonsTotal(r)} live lessons a week listed · <a href={`${MAIN_SITE_ORIGIN}/curriculum/${r.slug}/`} target="_blank" rel="noreferrer" className="text-teal-700 hover:underline">view page</a>
                </p>
              </div>
              <button type="button" onClick={() => setOpen(open === r.slug ? null : r.slug)} aria-expanded={open === r.slug} className="rounded-full border border-gold-500 px-3 py-1 text-xs text-gold-700 hover:bg-cream">
                {open === r.slug ? "Close" : "Edit"}
              </button>
            </div>

            {open === r.slug && (
              <div className="mt-3 space-y-3 rounded-2xl border border-gold-light/50 bg-cream/40 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-ink">Year range (page heading)
                    <input value={r.range} onChange={(e) => update(r.slug, { range: e.target.value })} className={inputCls} />
                  </label>
                  <label className="text-sm text-ink">Key stage title (kicker)
                    <input value={r.title} onChange={(e) => update(r.slug, { title: e.target.value })} className={inputCls} />
                  </label>
                  <label className="text-sm text-ink sm:col-span-2">Intro paragraph
                    <textarea value={r.intro || ""} onChange={(e) => update(r.slug, { intro: e.target.value })} rows={3} className={inputCls} />
                  </label>
                  <label className="text-sm text-ink sm:col-span-2">Subjects, one per line
                    <textarea value={r.subjects.join("\n")} onChange={(e) => update(r.slug, { subjects: e.target.value.split("\n") })} rows={Math.max(6, r.subjects.length + 1)} className={`${inputCls} font-mono text-xs`} />
                  </label>
                </div>

                <fieldset className="rounded-xl border border-gold-light/60 bg-white p-3">
                  <legend className="px-1 text-sm font-medium text-ink">Live lessons each week</legend>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-ink/65">
                        <th scope="col" className="py-1 pr-2 font-semibold">Subject</th>
                        <th scope="col" className="w-28 py-1 pr-2 font-semibold">Lessons a week</th>
                        <th scope="col" className="w-20 py-1"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.weekly.map((w, i) => (
                        <tr key={i}>
                          <td className="py-1 pr-2">
                            <input aria-label={`Subject ${i + 1}`} value={w.subject} onChange={(e) => update(r.slug, { weekly: r.weekly.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)) })} className={ui.input} />
                          </td>
                          <td className="py-1 pr-2">
                            <input aria-label={`Lessons a week for subject ${i + 1}`} inputMode="numeric" value={String(w.lessons)} onChange={(e) => update(r.slug, { weekly: r.weekly.map((x, j) => (j === i ? { ...x, lessons: e.target.value } : x)) })} className={ui.input} />
                          </td>
                          <td className="py-1 text-right">
                            <button type="button" aria-label={`Move ${w.subject || "row"} up`} disabled={i === 0} onClick={() => { const wk = [...r.weekly]; [wk[i - 1], wk[i]] = [wk[i], wk[i - 1]]; update(r.slug, { weekly: wk }); }} className="px-1 text-xs text-ink/70 disabled:opacity-30">↑</button>
                            <button type="button" aria-label={`Remove ${w.subject || "row"}`} onClick={() => update(r.slug, { weekly: r.weekly.filter((_, j) => j !== i) })} className="px-1 text-xs text-red-700"><Icon name="x" size="sm" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <button type="button" onClick={() => update(r.slug, { weekly: [...r.weekly, { subject: "", lessons: "" }] })} className={btn("secondary", "sm")}>Add a subject row</button>
                    <p className="text-xs text-ink/65">Rows add up to {lessonsTotal(r)} lessons a week.</p>
                  </div>
                </fieldset>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-ink">Lesson length (shown under the table)
                    <input value={r.lesson_length || ""} onChange={(e) => update(r.slug, { lesson_length: e.target.value })} placeholder="e.g. 50 minutes" className={inputCls} />
                  </label>
                  <label className="text-sm text-ink">Total line
                    <input value={r.total_lessons || ""} onChange={(e) => update(r.slug, { total_lessons: e.target.value })} placeholder="e.g. 23 live lessons a week" className={inputCls} />
                  </label>
                  <label className="text-sm text-ink sm:col-span-2">Note under the table
                    <textarea value={r.note || ""} onChange={(e) => update(r.slug, { note: e.target.value })} rows={2} className={inputCls} />
                  </label>
                  <label className="text-sm text-ink sm:col-span-2">GCSE / exams note (shown in gold under the intro; leave blank to hide)
                    <textarea value={r.gcse_note || ""} onChange={(e) => update(r.slug, { gcse_note: e.target.value })} rows={2} className={inputCls} />
                  </label>
                  <label className="text-sm text-ink">Display order
                    <input type="text" inputMode="numeric" value={r.order_index} onChange={(e) => update(r.slug, { order_index: Number(e.target.value) || 0 })} className={inputCls} />
                  </label>
                  <label className="flex items-center gap-2 pt-6 text-sm text-ink">
                    <input type="checkbox" checked={r.visible} onChange={(e) => update(r.slug, { visible: e.target.checked })} />
                    Shown on the website
                  </label>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => save(r)} disabled={busy} className={btn("primary", "sm")}>{busy ? "Working…" : "Save & publish"}</button>
                  <button type="button" onClick={() => { setOpen(null); load(); }} className={btn("secondary", "sm")}>Cancel</button>
                </div>
              </div>
            )}
          </li>
        ))}
        {rows.length === 0 && <li className="p-3 text-sm text-ink/65">No key-stage pages in the database yet (migration 0105 seeds them).</li>}
      </ul>
      {message && <p className={`mt-2 text-sm ${message.error ? "text-red-700" : "text-ink/70"}`}>{message.text}</p>}
    </Card>
  );
}
