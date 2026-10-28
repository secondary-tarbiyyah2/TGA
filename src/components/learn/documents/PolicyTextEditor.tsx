"use client";

import { useMemo, useState } from "react";
import { marked } from "marked";
import { getSupabaseClient } from "@/lib/supabase/client";
import { triggerPublish } from "@/lib/learn/publishSiteContent";
import { POLICY_META_FIELDS, type PolicyMeta } from "@/lib/policyMeta";
import { ui } from "@/components/learn/ui";

const inputCls = `mt-1 ${ui.input}`;

/**
 * "Edit text" for one policy: the header table and the sections, written
 * in plain markdown (## 1. Heading, paragraphs, - bullets, 1. numbered
 * steps, | pipe | tables |, **bold**). Saving writes policy_links.body_md /
 * meta (migration 0174) and triggers the site rebuild that regenerates the
 * PDF and the readable page. Saving text also detaches any uploaded file so
 * the generated version is what the website serves.
 */
export function PolicyTextEditor({
  row,
  onClose,
  onSaved,
}: {
  row: { id: string; number: string; title: string; slug: string | null; meta: PolicyMeta | null; body_md: string | null; file_path: string | null };
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const supabase = getSupabaseClient();
  const [meta, setMeta] = useState<PolicyMeta>(row.meta || {});
  const [body, setBody] = useState(row.body_md || "");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const preview = useMemo(() => (tab === "preview" ? (marked.parse(body, { gfm: true }) as string).replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, "</table></div>") : ""), [tab, body]);
  const sections = useMemo(() => body.split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3)), [body]);

  async function save() {
    if (!supabase) return;
    if (!row.slug) {
      setMessage({ text: "Save the policy's details first so it has an address, then edit its text.", error: true });
      return;
    }
    if (!body.trim()) {
      setMessage({ text: "The policy text is empty.", error: true });
      return;
    }
    setBusy(true);
    setMessage(null);
    const cleanMeta: PolicyMeta = {};
    for (const f of POLICY_META_FIELDS) {
      const v = (meta[f.key] || "").trim();
      if (v) cleanMeta[f.key] = v;
    }
    const { error } = await supabase
      .from("policy_links")
      .update({
        body_md: body.trim(),
        meta: cleanMeta,
        // Text is now the source: the generated PDF replaces any uploaded file.
        file_path: null,
        file_name: null,
        file_kind: "pdf",
        file_url: `/policies/${row.slug}.pdf`,
        extracted_text: null,
      })
      .eq("id", row.id);
    if (error) {
      setMessage({ text: `Could not save: ${error.message}`, error: true });
      setBusy(false);
      return;
    }
    const note = await triggerPublish();
    setMessage({ text: `${note} Everyone who must sign this policy will be asked to sign the new version.` });
    setBusy(false);
    await onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{row.number}. {row.title}</p>
          <p className="text-xs text-ink/65">
            Edit the wording here. The PDF and the web page are generated from this text when you save, so there is no file to upload.
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-gold-light/60 px-4 py-1.5 text-xs text-ink/70 hover:bg-cream">Close</button>
      </div>

      <details className="rounded-2xl border border-gold-light/50 bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">Header table (policy name, owner, dates, basis)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-ink sm:col-span-2">Subtitle (one line under the title)
            <input value={meta.subtitle || ""} onChange={(e) => setMeta({ ...meta, subtitle: e.target.value })} className={inputCls} />
          </label>
          {POLICY_META_FIELDS.map((f) => (
            <label key={f.key} className={`text-sm text-ink ${["basis", "readAlongside", "availability", "appliesTo"].includes(f.key) ? "sm:col-span-2" : ""}`}>
              {f.label}
              <input value={meta[f.key] || ""} onChange={(e) => setMeta({ ...meta, [f.key]: e.target.value })} className={inputCls} />
            </label>
          ))}
        </div>
      </details>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setTab("write")} className={`rounded-full px-3 py-1 text-xs font-semibold ${tab === "write" ? "bg-gold-700 text-white" : "border border-gold-light text-ink/70 hover:bg-cream"}`}>Write</button>
          <button type="button" onClick={() => setTab("preview")} className={`rounded-full px-3 py-1 text-xs font-semibold ${tab === "preview" ? "bg-gold-700 text-white" : "border border-gold-light text-ink/70 hover:bg-cream"}`}>Preview</button>
          <span className="text-xs text-ink/65">{sections.length} section{sections.length === 1 ? "" : "s"}</span>
        </div>
        {tab === "write" ? (
          <>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={28}
              spellCheck
              className={`${ui.input} min-h-[60vh] w-full font-mono text-[13px] leading-relaxed`}
              aria-label="Policy text"
            />
            <p className="mt-2 text-xs text-ink/65">
              Formatting: start each section with <code>## 1. Heading</code>, bullets with <code>- </code>, numbered steps with <code>1. </code>, bold with <code>**text**</code>, and tables with <code>| column | column |</code> rows. The contents box and page numbers are added automatically.
            </p>
          </>
        ) : (
          <div className="policy-body rounded-2xl border border-gold-light/50 bg-white p-5" dangerouslySetInnerHTML={{ __html: preview }} />
        )}
      </div>

      {message && (
        <p role={message.error ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${message.error ? "bg-red-50 text-red-800" : "bg-green-50 text-green-900"}`}>
          {message.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={busy} className="rounded-full bg-gold-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-gold-900 disabled:opacity-60">
          {busy ? "Saving…" : "Save and publish"}
        </button>
        <button type="button" onClick={onClose} className="rounded-full border border-gold-light/60 px-4 py-1.5 text-xs text-ink/70 hover:bg-cream">Cancel</button>
      </div>
    </div>
  );
}
