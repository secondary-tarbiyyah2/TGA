"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { cleanMeetingUrl, EmptyState, ghostBtn, inputCls, Notice, primaryBtn } from "./shared";
import type { ClassRow } from "./shared";

function Row({ c, reload }: { c: ClassRow; reload: () => Promise<void> }) {
  const supabase = getSupabaseClient();
  const [value, setValue] = useState(c.meeting_url || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const dirty = value.trim() !== (c.meeting_url || "");

  const save = async () => {
    if (!supabase) return;
    const url = cleanMeetingUrl(value);
    if (url === "invalid") return setMsg({ tone: "error", text: "The link must be a full https:// link." });
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("classes").update({ meeting_url: url }).eq("id", c.id);
    setBusy(false);
    if (error) return setMsg({ tone: "error", text: error.message });
    setMsg({ tone: "ok", text: url ? "Saved." : "Link removed." });
    await reload();
  };

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-48 shrink-0 truncate text-sm font-medium text-ink">{c.name}</span>
        <input type="url" inputMode="url" aria-label={`Meeting link for ${c.name}`} className={`${inputCls} min-w-0 flex-1 basis-64`} placeholder="https://teams.microsoft.com/l/meetup-join/…" value={value} onChange={(e) => setValue(e.target.value)} />
        <button type="button" className={dirty ? primaryBtn : ghostBtn} disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save"}</button>
      </div>
      {msg && <div className="mt-2"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
    </li>
  );
}

/** One row per class: paste or clear its recurring lesson link. */
export function MeetingLinksSection({ classes, reload }: { classes: ClassRow[]; reload: () => Promise<void> }) {
  const [show, setShow] = useState<"all" | "missing">("all");
  const missing = classes.filter((c) => !c.meeting_url).length;
  const shown = show === "missing" ? classes.filter((c) => !c.meeting_url) : classes;
  return (
    <section className="rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink/65">Paste a recurring Teams, Zoom or Meet link per class. It is used to join that class&apos;s lessons.</p>
        <div className="flex gap-2" role="group" aria-label="Show classes">
          {([["all", `All ${classes.length}`], ["missing", `No link ${missing}`]] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={show === id} onClick={() => setShow(id)} className={`rounded-full border px-3 py-1 text-sm font-medium ${show === id ? "border-gold-500 bg-gold-500 text-ink" : "border-gold-light bg-white text-ink/70 hover:bg-cream"}`}>{label}</button>
          ))}
        </div>
      </div>
      <div className="mt-3">
        {classes.length === 0 ? (
          <EmptyState>No classes yet. Add classes first.</EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState>Every class has a meeting link.</EmptyState>
        ) : (
          <ul className="divide-y divide-gold-light/30">{shown.map((c) => <Row key={`${c.id}-${c.meeting_url || ""}`} c={c} reload={reload} />)}</ul>
        )}
      </div>
    </section>
  );
}
