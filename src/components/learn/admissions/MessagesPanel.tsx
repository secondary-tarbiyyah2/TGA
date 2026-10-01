"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import type { ApplicationRow } from "@/components/admissions/applicationShared";
import { SELECTABLE_TEMPLATES, TEMPLATE_LABELS, buildTemplate, type TemplateContext, type TemplateId } from "@/components/learn/admissions/messageTemplates";

type MessageRow = {
  id: string;
  template: string;
  subject: string;
  body: string;
  sent_by: string | null;
  sent_at: string;
  email_sent: boolean;
  email_error: string | null;
};

const fieldCls = "mt-1 block w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2 text-sm";

export function MessagesPanel({ app, ctx, staffNames }: { app: ApplicationRow; ctx: TemplateContext; staffNames: Record<string, string> }) {
  const [history, setHistory] = useState<MessageRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [composing, setComposing] = useState(false);
  const [template, setTemplate] = useState<TemplateId>("assessment_invite");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return setLoadError(true);
    const { data, error } = await supabase
      .from("admissions_messages")
      .select("id, template, subject, body, sent_by, sent_at, email_sent, email_error")
      .eq("application_id", app.id)
      .order("sent_at", { ascending: false });
    if (error) return setLoadError(true);
    setLoadError(false);
    setHistory((data as MessageRow[]) || []);
  }, [app.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load]);

  function pick(t: TemplateId) {
    const built = buildTemplate(t, app, ctx);
    setTemplate(t);
    setSubject(built.subject);
    setBody(built.body);
    setComposing(true);
    setResult(null);
  }

  async function send() {
    if (/\[[^\]]+\]/.test(body) && !window.confirm("The message still contains [square bracket] gaps. Send anyway?")) return;
    if (!window.confirm(`Send this email to ${app.parent_email}?`)) return;
    setSending(true);
    setResult(null);
    const r = await callEdgeFunction("admissions-correspond", { applicationId: app.id, template, subject, body });
    setSending(false);
    if (!r.ok) {
      setResult({ ok: false, text: `Not sent. ${edgeErrorMessage(r)}` });
      return;
    }
    if (r.emailSent) {
      setResult({ ok: true, text: `Sent to ${app.parent_email}.` });
      setComposing(false);
    } else {
      setResult({ ok: false, text: `The email could not be delivered (${String(r.emailError || "unknown error")}). It is recorded as "not delivered" in the history. Check the address, or contact the family another way.` });
    }
    await load();
  }

  return (
    <div className="space-y-5">
      <section aria-label="Send update">
        <h3 className="text-sm font-semibold text-ink">Send update to {app.parent_name}</h3>
        <p className="text-xs text-ink/60">Goes to {app.parent_email}. Pick a template, edit it, then send. Replace anything in [square brackets].</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SELECTABLE_TEMPLATES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => pick(t)}
              aria-pressed={composing && template === t}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${composing && template === t ? "bg-teal-700 text-white" : "border border-gold-light/60 text-ink/70 hover:bg-cream"}`}
            >
              {TEMPLATE_LABELS[t]}
            </button>
          ))}
        </div>

        {composing && (
          <div className="mt-3 space-y-3 rounded-xl border border-gold-light/50 bg-cream/40 p-4">
            <label className="block text-sm font-medium text-ink">
              Subject
              <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} className={fieldCls} />
            </label>
            <label className="block text-sm font-medium text-ink">
              Message
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} maxLength={20000} className={`${fieldCls} font-mono text-xs leading-relaxed`} />
            </label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={send} disabled={sending || !subject.trim() || !body.trim()} className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">
                {sending ? "Sending…" : "Send email"}
              </button>
              <button type="button" onClick={() => setComposing(false)} disabled={sending} className="text-sm text-ink/70 underline">Cancel</button>
            </div>
          </div>
        )}
        {result && (
          <p role={result.ok ? "status" : "alert"} className={`mt-2 text-sm ${result.ok ? "text-teal-700" : "text-red-700"}`}>{result.text}</p>
        )}
      </section>

      <section aria-label="Message history">
        <h3 className="text-sm font-semibold text-ink">History</h3>
        {loadError && <p role="alert" className="mt-2 text-sm text-red-700">Couldn&apos;t load the history. <button type="button" onClick={() => void load()} className="underline">Try again</button></p>}
        {!loadError && history === null && <p role="status" className="mt-2 text-sm text-ink/60">Loading…</p>}
        {history && history.length === 0 && <p className="mt-2 text-sm text-ink/60">Nothing sent yet.</p>}
        {history && history.length > 0 && (
          <ol className="mt-3 space-y-3 border-l-2 border-gold-light/70 pl-4">
            {history.map((m) => (
              <li key={m.id} className="relative">
                <span aria-hidden="true" className={`absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ${m.email_sent ? "bg-teal-500" : "bg-red-600"}`} />
                <button type="button" onClick={() => setOpenId(openId === m.id ? null : m.id)} aria-expanded={openId === m.id} className="block w-full text-left">
                  <span className="block text-sm font-medium text-ink">{m.subject}</span>
                  <span className="block text-xs text-ink/60">
                    {TEMPLATE_LABELS[m.template as TemplateId] || m.template} · {new Date(m.sent_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })}
                    {m.sent_by && staffNames[m.sent_by] ? ` · ${staffNames[m.sent_by]}` : ""}
                    {" · "}
                    <span className={m.email_sent ? "text-teal-700" : "font-semibold text-red-700"}>{m.email_sent ? "Delivered to provider" : "Not delivered"}</span>
                  </span>
                </button>
                {!m.email_sent && m.email_error && <p className="mt-1 text-xs text-red-700">{m.email_error}</p>}
                {openId === m.id && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-cream/60 p-3 font-sans text-xs text-ink/80">{m.body}</pre>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
