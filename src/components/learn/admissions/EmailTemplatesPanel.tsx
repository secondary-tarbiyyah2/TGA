"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TEMPLATE_COLUMNS } from "@/components/learn/admissions/admissionsData";
import {
  DEFAULT_TEMPLATES,
  NEVER_AUTO,
  SAMPLE_APP,
  SAMPLE_EXTRA,
  SAMPLE_FEES,
  SAMPLE_STAGE,
  SAMPLE_TOKEN_VALUES_NOTE,
  TEMPLATE_KEYS,
  TEMPLATE_LABELS,
  TOKEN_DOCS,
  buildTemplateContext,
  renderTemplate,
  type TemplateKey,
  type TemplateRow,
} from "@/components/learn/admissions/messageTemplates";
import { Group, fieldCls, ghostBtn, primaryBtn } from "@/components/learn/admissions/ui";

const WHEN: Record<TemplateKey, string> = {
  received: "When an application first moves out of New.",
  assessment_invite: "When an assessment date and time is saved (Process > Assessment).",
  interview_invite: "When an interview date and time is saved (Process > Interview).",
  offer: "When an application is moved to Offered (unless the offer was already emailed).",
  payment_received: "When staff verify a proof of payment.",
  payment_rejected: "When staff reject a proof of payment.",
  waitlist: "Never sent on its own: pick it in the Messages tab.",
  decline: "Never sent automatically, whatever the switch says. Always sent by hand, with a confirmation.",
  request_documents: "Never sent on its own: pick it in the Messages tab.",
};

const SAMPLE_SETTINGS = {
  payment_instructions: "Account name: Tarbiyyah Global Academy\nSort code: 00-00-00\nAccount number: 00000000",
  assessment_join_url: null,
  interview_join_url: null,
  assessment_duration_text: null,
  admissions_email: null,
  contact_phone: null,
};

type Row = { subject: string; body: string; auto_send: boolean };

/** Editable email texts (admissions_email_templates), with automatic-sending switches and a live preview against a sample application. */
export function EmailTemplatesPanel() {
  const [rows, setRows] = useState<Record<TemplateKey, Row>>(() => Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, { ...DEFAULT_TEMPLATES[k] }])) as Record<TemplateKey, Row>);
  const [saved, setSaved] = useState<Record<TemplateKey, Row>>(rows);
  const [selected, setSelected] = useState<TemplateKey>("offer");
  const [loaded, setLoaded] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void supabase
      .from("admissions_email_templates")
      .select(TEMPLATE_COLUMNS)
      .then(({ data, error }) => {
        if (error) {
          setTableMissing(true);
          return setLoaded(true);
        }
        const next = { ...rows };
        for (const r of (data as TemplateRow[]) || []) if ((TEMPLATE_KEYS as string[]).includes(r.key)) next[r.key as TemplateKey] = { subject: r.subject, body: r.body, auto_send: r.auto_send };
        setRows(next);
        setSaved(next);
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, []);

  const cur = rows[selected];
  const dirty = JSON.stringify(cur) !== JSON.stringify(saved[selected]);
  const anyDirty = JSON.stringify(rows) !== JSON.stringify(saved);

  const preview = useMemo(() => {
    const ctx = buildTemplateContext(SAMPLE_APP, SAMPLE_SETTINGS, SAMPLE_STAGE, { fees: SAMPLE_FEES, extra: SAMPLE_EXTRA });
    return renderTemplate(cur, ctx);
  }, [cur]);

  const set = (patch: Partial<Row>) => setRows((r) => ({ ...r, [selected]: { ...r[selected], ...patch } }));

  async function save() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (preview.unresolved.length) return setMsg({ ok: false, text: `Unknown values: ${preview.unresolved.map((t) => `{{${t}}}`).join(", ")}. Check the spelling against the list below.` });
    setSaving(true);
    setMsg(null);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("admissions_email_templates")
      .upsert({ key: selected, subject: cur.subject.trim(), body: cur.body.trim(), auto_send: NEVER_AUTO.includes(selected) ? false : cur.auto_send, updated_at: new Date().toISOString(), updated_by: u.user?.id ?? null }, { onConflict: "key" });
    setSaving(false);
    if (error) return setMsg({ ok: false, text: "Couldn't save. Migration 0065 may not be applied yet, or your account can't edit templates." });
    setSaved((s) => ({ ...s, [selected]: cur }));
    setMsg({ ok: true, text: "Saved. New emails use this text." });
  }

  return (
    <Group
      title="Email templates"
      help={
        <>
          <p>These are the starting texts for every admissions email. Values in double curly brackets are filled in automatically from the application, the saved dates, the fees and the settings above, so no gaps are left for staff to fill in. Staff can still edit the wording of any email before sending it by hand.</p>
          <p className="mt-1">{SAMPLE_TOKEN_VALUES_NOTE}</p>
        </>
      }
    >
      {tableMissing && <p role="alert" className="mb-3 text-xs text-amber-800">The templates table isn&apos;t there yet (migration 0065), so the built-in texts are shown and edits can&apos;t be saved until it is applied.</p>}
      <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
        <ul aria-label="Templates" className="space-y-1">
          {TEMPLATE_KEYS.map((k) => (
            <li key={k}>
              <button
                type="button"
                onClick={() => { setSelected(k); setMsg(null); }}
                aria-current={selected === k}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm ${selected === k ? "bg-teal-700 font-semibold text-white" : "border border-gold-light/60 text-ink/80 hover:bg-cream"}`}
              >
                <span>{TEMPLATE_LABELS[k]}{JSON.stringify(rows[k]) !== JSON.stringify(saved[k]) ? " *" : ""}</span>
                <span className={`text-[10px] font-semibold uppercase ${selected === k ? "text-white/80" : rows[k].auto_send && !NEVER_AUTO.includes(k) ? "text-teal-700" : "text-ink/40"}`}>
                  {NEVER_AUTO.includes(k) ? "manual" : rows[k].auto_send ? "auto" : "manual"}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={NEVER_AUTO.includes(selected) ? false : cur.auto_send} disabled={NEVER_AUTO.includes(selected) || !loaded} onChange={(e) => set({ auto_send: e.target.checked })} />
            <span>
              Send automatically
              <span className="block text-xs font-normal text-ink/60">{WHEN[selected]}</span>
            </span>
          </label>
          <label className="block text-sm font-medium text-ink">
            Subject
            <input value={cur.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={300} disabled={!loaded} className={fieldCls} />
          </label>
          <label className="block text-sm font-medium text-ink">
            Message
            <textarea value={cur.body} onChange={(e) => set({ body: e.target.value })} rows={18} maxLength={20000} disabled={!loaded} className={`${fieldCls} font-mono text-xs leading-relaxed`} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={saving || !dirty || !loaded || tableMissing} className={primaryBtn}>{saving ? "Saving…" : "Save template"}</button>
            <button type="button" onClick={() => set({ subject: DEFAULT_TEMPLATES[selected].subject, body: DEFAULT_TEMPLATES[selected].body })} className={ghostBtn}>Reset text to default</button>
            {anyDirty && !dirty && <span className="text-xs text-ink/55">Other templates have unsaved changes (marked *).</span>}
            {msg && <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-teal-700" : "text-red-700"}`}>{msg.text}</span>}
          </div>

          <div className="rounded-lg border border-gold-light/50 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Live preview (made-up application: Yusuf Rahman, Year 4)</p>
            {preview.unresolved.length > 0 && <p role="alert" className="mt-1 text-xs text-red-700">Unknown values: {preview.unresolved.map((t) => `{{${t}}}`).join(", ")}</p>}
            <p className="mt-2 text-sm font-semibold text-ink">{preview.subject}</p>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink/80">{preview.body}</pre>
          </div>

          <details className="rounded-lg border border-gold-light/50 bg-white p-3 text-xs text-ink/75">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Values you can use</summary>
            <ul className="mt-2 space-y-1">
              {TOKEN_DOCS.map((t) => (
                <li key={t.token}>
                  <code className="rounded bg-cream px-1">{`{{${t.token}}}`}</code> {t.description}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </Group>
  );
}
