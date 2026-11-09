"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { TokenEditor, VariablePicker, unknownTokensIn, type TokenEditorHandle } from "@/components/learn/admissions/TokenEditor";

import { askConfirm } from "@/components/learn/kit";
/** Templates a person always sends by hand. Everything else can be switched to send automatically. */
const MANUAL_ONLY: TemplateKey[] = ["waitlist", "decline", "request_documents"];
const AUTOMATED_KEYS = TEMPLATE_KEYS.filter((k) => !MANUAL_ONLY.includes(k));
const MANUAL_KEYS = TEMPLATE_KEYS.filter((k) => MANUAL_ONLY.includes(k));

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

  const ctx = useMemo(() => buildTemplateContext(SAMPLE_APP, SAMPLE_SETTINGS, SAMPLE_STAGE, { fees: SAMPLE_FEES, extra: SAMPLE_EXTRA }), []);
  const known = useMemo(() => new Set(Object.keys(ctx)), [ctx]);
  const preview = useMemo(() => renderTemplate(cur, ctx), [cur, ctx]);
  const unknown = useMemo(() => unknownTokensIn(`${cur.subject}\n${cur.body}`, known), [cur, known]);
  const isDefault = cur.subject === DEFAULT_TEMPLATES[selected].subject && cur.body === DEFAULT_TEMPLATES[selected].body;
  const manualOnly = MANUAL_ONLY.includes(selected);

  const set = (patch: Partial<Row>) => setRows((r) => ({ ...r, [selected]: { ...r[selected], ...patch } }));

  const bodyRef = useRef<TokenEditorHandle>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const lastField = useRef<"subject" | "body">("body");

  function insertVariable(token: string) {
    if (lastField.current === "subject" && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? cur.subject.length;
      const end = el.selectionEnd ?? start;
      const next = cur.subject.slice(0, start) + token + cur.subject.slice(end);
      if (next.length > 300) return;
      set({ subject: next });
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
    } else {
      bodyRef.current?.insert(token);
    }
  }

  async function sendTestToMe() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data: u } = await supabase.auth.getUser();
    const to = u.user?.email;
    if (!to) return setMsg({ ok: false, text: "Your account has no email address to send a test to." });
    const body = preview.body;
    const subject = `[TEST] ${preview.subject}`;
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (url.length > 1900) {
      try {
        await navigator.clipboard.writeText(body);
        window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent("Paste the copied message here.")}`;
        return setMsg({ ok: true, text: `Opened an email to ${to}. The message was too long to pre-fill, so it is on your clipboard: paste it in.` });
      } catch {
        return setMsg({ ok: false, text: "The message is too long to open in your email app and the clipboard is blocked. Use Copy preview instead." });
      }
    }
    window.location.href = url;
    setMsg({ ok: true, text: `Opened an email to ${to} in your email app, filled in with the sample data. Send it from there.` });
  }

  async function copyPreview() {
    try {
      await navigator.clipboard.writeText(`${preview.subject}\n\n${preview.body}`);
      setMsg({ ok: true, text: "Preview copied." });
    } catch {
      setMsg({ ok: false, text: "Couldn't copy. Select the preview text and copy it by hand." });
    }
  }


  async function save() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (preview.unresolved.length) return setMsg({ ok: false, text: `Unknown values: ${preview.unresolved.map((t) => `{{${t}}}`).join(", ")}. Check the spelling against the list below.` });
    setSaving(true);
    setMsg(null);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("admissions_email_templates")
      .upsert({ key: selected, subject: cur.subject.trim(), body: cur.body.trim(), auto_send: NEVER_AUTO.includes(selected) || manualOnly ? false : cur.auto_send, updated_at: new Date().toISOString(), updated_by: u.user?.id ?? null }, { onConflict: "key" });
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
        <nav aria-label="Templates" className="space-y-4">
          {([
            ["Automated", "Can send on their own when something happens", AUTOMATED_KEYS],
            ["Manual", "Always sent by hand from the Messages tab", MANUAL_KEYS],
          ] as const).map(([label, hint, keys]) => (
            <div key={label}>
              <div className="mb-1.5 flex items-center gap-2 px-1" title={hint}>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink/65">{label}</span>
                <span aria-hidden="true" className="h-px flex-1 bg-gold-light/60" />
              </div>
              <ul className="space-y-1">
                {keys.map((k) => {
                  const on = selected === k;
                  const isAuto = !MANUAL_ONLY.includes(k) && rows[k].auto_send;
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        onClick={() => { setSelected(k); setMsg(null); }}
                        aria-current={on}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm ${on ? "bg-teal-700 font-semibold text-white" : "border border-gold-light/60 font-medium text-ink hover:bg-cream"}`}
                      >
                        <span>{TEMPLATE_LABELS[k]}{JSON.stringify(rows[k]) !== JSON.stringify(saved[k]) ? " *" : ""}</span>
                        <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-normal ${on ? "bg-white/20 text-white/85" : "bg-ink/5 text-ink/65"}`}>
                          {MANUAL_ONLY.includes(k) ? "Manual" : isAuto ? "Auto" : "Auto off"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={NEVER_AUTO.includes(selected) || manualOnly ? false : cur.auto_send} disabled={NEVER_AUTO.includes(selected) || manualOnly || !loaded} onChange={(e) => set({ auto_send: e.target.checked })} />
            <span>
              Send automatically
              <span className="block text-xs font-normal text-ink/65">{WHEN[selected]}</span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <VariablePicker onPick={insertVariable} />
            <span className="text-xs text-ink/65">Values show as <span className="rounded bg-teal-100 px-1 text-teal-900">pills</span>. Insert goes where your cursor is (subject or message).</span>
          </div>
          {unknown.length > 0 && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
              Unknown values (shown in red): {unknown.map((t) => `{{${t}}}`).join(", ")}. Pick one from Insert variable or fix the spelling, otherwise this can&apos;t be saved.
            </p>
          )}
          <label className="block text-sm font-medium text-ink">
            Subject
            <input ref={subjectRef} value={cur.subject} onChange={(e) => set({ subject: e.target.value })} onFocus={() => { lastField.current = "subject"; }} maxLength={300} disabled={!loaded} className={fieldCls} />
          </label>
          <div className="text-sm font-medium text-ink">
            <span>Message</span>
            <TokenEditor ref={bodyRef} value={cur.body} onChange={(v) => set({ body: v })} known={known} rows={16} maxLength={20000} disabled={!loaded} ariaLabel="Message" onFocus={() => { lastField.current = "body"; }} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={saving || !dirty || !loaded || tableMissing} className={primaryBtn}>{saving ? "Saving…" : "Save template"}</button>
            <button
              type="button"
              disabled={isDefault}
              onClick={async () => { if (await askConfirm("Replace this template's subject and message with the built-in default? Nothing is saved until you press Save.")) set({ subject: DEFAULT_TEMPLATES[selected].subject, body: DEFAULT_TEMPLATES[selected].body }); }}
              className={ghostBtn}
            >
              Reset to default
            </button>
            <button type="button" onClick={sendTestToMe} className={ghostBtn}>Send test to me</button>
            {!isDefault && <span className="text-xs text-ink/65">Edited from the built-in text</span>}
            {anyDirty && !dirty && <span className="text-xs text-ink/65">Other templates have unsaved changes (marked *).</span>}
            {msg && <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-teal-700" : "text-red-700"}`}>{msg.text}</span>}
          </div>

          <div className="rounded-lg border border-gold-light/50 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">Live preview (made-up application: Yusuf Rahman, Year 4)</p>
              <button type="button" onClick={copyPreview} className="text-xs font-medium text-ink/70 underline">Copy preview</button>
            </div>
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
