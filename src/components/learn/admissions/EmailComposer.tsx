"use client";

import { useState } from "react";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import type { ApplicationRow } from "@/components/admissions/applicationShared";
import type { TemplateId } from "@/components/learn/admissions/messageTemplates";

const fieldCls = "mt-1 block w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2 text-sm";

export type SendOutcome = { ok: boolean; emailSent: boolean; text: string };

/** One call to the admissions-correspond Edge Function, with a plain-English outcome. */
export async function sendAdmissionsEmail(applicationId: string, template: TemplateId, subject: string, body: string): Promise<SendOutcome> {
  const r = await callEdgeFunction("admissions-correspond", { applicationId, template, subject, body });
  if (!r.ok) return { ok: false, emailSent: false, text: `Not sent. ${edgeErrorMessage(r)}` };
  if (r.emailSent) return { ok: true, emailSent: true, text: "Email sent." };
  return { ok: true, emailSent: false, text: `The email could not be delivered (${String(r.emailError || "unknown error")}). It is recorded as "not delivered" in the Messages history.` };
}

/** Editable email (subject + body) with a confirm-and-send button. Used for assessment, interview, offer and payment emails. */
export function EmailComposer({
  app,
  template,
  initial,
  sendLabel = "Send email",
  note,
  onSent,
  onCancel,
}: {
  app: ApplicationRow;
  template: TemplateId;
  initial: { subject: string; body: string };
  sendLabel?: string;
  note?: string;
  onSent: (outcome: SendOutcome) => void;
  onCancel: () => void;
}) {
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendOutcome | null>(null);

  async function send() {
    if (/\[[^\]]+\]/.test(body) && !window.confirm("The message still contains [square bracket] gaps. Send anyway?")) return;
    if (!window.confirm(`Send this email to ${app.parent_email}?`)) return;
    setSending(true);
    setResult(null);
    const out = await sendAdmissionsEmail(app.id, template, subject, body);
    setSending(false);
    if (out.emailSent) return onSent(out);
    setResult(out);
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-gold-light/50 bg-white p-4">
      <p className="text-xs text-ink/60">
        To {app.parent_email}. Edit the wording, then send. {note}
      </p>
      <label className="block text-sm font-medium text-ink">
        Subject
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} className={fieldCls} />
      </label>
      <label className="block text-sm font-medium text-ink">
        Message
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16} maxLength={20000} className={`${fieldCls} font-mono text-xs leading-relaxed`} />
      </label>
      <div className="flex items-center gap-3">
        <button type="button" onClick={send} disabled={sending || !subject.trim() || !body.trim()} className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">
          {sending ? "Sending…" : sendLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={sending} className="text-sm text-ink/70 underline">Cancel</button>
      </div>
      {result && <p role="alert" className="text-sm text-red-700">{result.text}</p>}
    </div>
  );
}
