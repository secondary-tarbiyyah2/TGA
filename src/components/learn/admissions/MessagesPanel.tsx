"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { EmailComposer } from "@/components/learn/admissions/EmailComposer";
import type { ApplicationRow } from "@/components/admissions/applicationShared";
import { SELECTABLE_TEMPLATES, TEMPLATE_LABELS, buildTemplate, type TemplateContext, type TemplateId, type TemplateKey } from "@/components/learn/admissions/messageTemplates";

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

export function MessagesPanel({ app, ctx, staffNames }: { app: ApplicationRow; ctx: TemplateContext; staffNames: Record<string, string> }) {
  const [history, setHistory] = useState<MessageRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [composing, setComposing] = useState<{ key: TemplateKey; subject: string; body: string; n: number } | null>(null);
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

  function pick(t: TemplateKey) {
    const built = buildTemplate(t, app, ctx);
    // n only needs to change each time, so the composer remounts with a fresh draft.
    setComposing((prev) => ({ key: t, subject: built.subject, body: built.body, n: (prev?.n ?? 0) + 1 }));
    setResult(null);
  }

  return (
    <div className="space-y-5">
      <section aria-label="Send update">
        <h3 className="text-sm font-semibold text-ink">Send update to {app.parent_name}</h3>
        <p className="text-xs text-ink/65">Goes to {app.parent_email}. Pick a template: it is filled in from the application, the fees and the dates saved for it. Edit the wording if you like, then send. The template texts themselves are edited in Admissions &gt; Email settings.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SELECTABLE_TEMPLATES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => pick(t)}
              aria-pressed={composing?.key === t}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${composing?.key === t ? "bg-teal-700 text-white" : "border border-gold-light/60 text-ink/70 hover:bg-cream"}`}
            >
              {TEMPLATE_LABELS[t]}
            </button>
          ))}
        </div>

        {composing && (
          <EmailComposer
            key={`${composing.key}-${composing.n}`}
            app={app}
            template={composing.key}
            initial={{ subject: composing.subject, body: composing.body }}
            note={composing.key === "offer" ? "The payment link line is replaced with the family's personal upload link when sent (a new link switches off the old one)." : undefined}
            onAttempt={() => void load()}
            onSent={(o) => {
              setResult({ ok: true, text: `${o.text} Sent to ${app.parent_email}.` });
              setComposing(null);
            }}
            onCancel={() => setComposing(null)}
          />
        )}
        {result && (
          <p role={result.ok ? "status" : "alert"} className={`mt-2 text-sm ${result.ok ? "text-teal-700" : "text-red-700"}`}>{result.text}</p>
        )}
      </section>

      <section aria-label="Message history">
        <h3 className="text-sm font-semibold text-ink">History</h3>
        {loadError && <p role="alert" className="mt-2 text-sm text-red-700">Couldn&apos;t load the history. <button type="button" onClick={() => void load()} className="underline">Try again</button></p>}
        {!loadError && history === null && <p role="status" className="mt-2 text-sm text-ink/65">Loading…</p>}
        {history && history.length === 0 && <p className="mt-2 text-sm text-ink/65">Nothing sent yet.</p>}
        {history && history.length > 0 && (
          <ol className="mt-3 space-y-3 border-l-2 border-gold-light/70 pl-4">
            {history.map((m) => (
              <li key={m.id} className="relative">
                <span aria-hidden="true" className={`absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ${m.email_sent ? "bg-teal-500" : "bg-red-600"}`} />
                <button type="button" onClick={() => setOpenId(openId === m.id ? null : m.id)} aria-expanded={openId === m.id} className="block w-full text-left">
                  <span className="block text-sm font-medium text-ink">{m.subject}</span>
                  <span className="block text-xs text-ink/65">
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
