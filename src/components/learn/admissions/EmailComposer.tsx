"use client";

import { useState } from "react";
import type { ApplicationRow } from "@/components/admissions/applicationShared";
import { sendAdmissionsEmail, type SendOutcome } from "@/components/learn/admissions/admissionsData";
import { findUnresolvedTokens } from "@/components/learn/admissions/messageTemplates";
import { TokenEditor } from "@/components/learn/admissions/TokenEditor";

export { sendAdmissionsEmail };
export type { SendOutcome };

const fieldCls = "mt-1 block w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2 text-sm";

/** Editable email (subject + body) with a confirm-and-send button. Used for assessment, interview, offer, payment and the Messages tab. */
export function EmailComposer({
  app,
  template,
  initial,
  sendLabel = "Send email",
  note,
  rows = 16,
  onSent,
  onAttempt,
  onCancel,
}: {
  app: ApplicationRow;
  template: string;
  initial: { subject: string; body: string };
  sendLabel?: string;
  note?: string;
  rows?: number;
  onSent: (outcome: SendOutcome) => void;
  /** Called after every send attempt, delivered or not (the attempt is logged either way). */
  onAttempt?: () => void;
  onCancel: () => void;
}) {
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendOutcome | null>(null);

  const unresolved = findUnresolvedTokens(`${subject}\n${body}`);

  async function send() {
    if (unresolved.length > 0) {
      setResult({ ok: false, emailSent: false, text: `Fix these before sending (they are not known values): ${unresolved.map((t) => `{{${t}}}`).join(", ")}.` });
      return;
    }
    if (template === "decline" && !window.confirm(`This tells ${app.parent_name} that ${app.child_first_name}'s application is declined. Decline emails are never sent automatically. Send it now?`)) return;
    if (!window.confirm(`Send this email to ${app.parent_email}?`)) return;
    setSending(true);
    setResult(null);
    const out = await sendAdmissionsEmail(app.id, template, subject, body);
    setSending(false);
    onAttempt?.();
    if (out.emailSent) return onSent(out);
    setResult(out);
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-gold-light/50 bg-white p-4">
      <p className="text-xs text-ink/60">
        To {app.parent_email}. Sent from the admissions mailbox; replies come back to the same mailbox. Everything is already filled in from the application: edit the wording if you like, then send. {note}
      </p>
      <label className="block text-sm font-medium text-ink">
        Subject
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} className={fieldCls} />
      </label>
      <div className="text-sm font-medium text-ink">
        <span>Message</span>
        <TokenEditor value={body} onChange={setBody} known={null} rows={rows} maxLength={20000} ariaLabel="Message" />
      </div>
      {unresolved.length > 0 && <p role="alert" className="text-xs text-red-700">Unfilled values to fix (highlighted in red): {unresolved.map((t) => `{{${t}}}`).join(", ")}</p>}
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
