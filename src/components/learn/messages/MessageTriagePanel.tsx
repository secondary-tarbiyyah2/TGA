"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AiDisclaimer, AiSpark } from "@/components/learn/AiBits";
import { StatusChip } from "@/components/learn/ui";
import { TRIAGE_CATEGORY_LABEL, aiAssist, aiErrorMessage, useAiStatus, type Triage } from "@/lib/learn/aiAssist";

/**
 * A compact AI panel above the reply box for an incoming parent message:
 * category, urgency, who should handle it, a one-line summary and a draft
 * reply the member of staff can put into the box, edit and send themselves.
 * Runs when the thread is opened (cached per message on the server, so a
 * second visit costs nothing). For a possible safeguarding concern it says
 * "Pass to the DSL now" with a link to Report a concern; it never forwards
 * anything itself.
 */
export function MessageTriagePanel({ threadId, latestIncomingId, onUseDraft, onTriaged }: { threadId: string; /** Re-runs when a new message arrives. */ latestIncomingId: string | null; onUseDraft: (text: string) => void; onTriaged?: () => void }) {
  const status = useAiStatus();
  const on = !!status?.configured && status.can.message_triage;
  const [triage, setTriage] = useState<Triage | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState<"open" | "draft" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!on || !latestIncomingId) return;
    let alive = true;
    (async () => {
      await Promise.resolve();
      if (!alive) return;
      setBusy("open");
      setError(null);
      const r = await aiAssist("triage_message", { thread_id: threadId });
      if (!alive) return;
      setBusy(null);
      if (!r.ok) return setError(aiErrorMessage(r));
      setTriage((r.triage as Triage | null) || null);
      setReply(typeof r.reply === "string" ? r.reply : null);
      if (r.triage && !(r.triage as Triage).cached) onTriaged?.();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per incoming message
  }, [on, threadId, latestIncomingId]);

  if (!on || !latestIncomingId || hidden) return null;
  if (busy === "open" && !triage) {
    return (
      <div className="flex items-center gap-2 border-t border-gold-light/30 px-3 py-2 text-xs text-ink/65">
        <AiSpark className="h-3.5 w-3.5 animate-pulse text-teal-700" /> Reading the latest message…
      </div>
    );
  }
  if (!triage) return error ? <p className="border-t border-gold-light/30 px-3 py-2 text-xs text-ink/65">AI helper: {error}</p> : null;

  const draft = async () => {
    setBusy("draft");
    setError(null);
    const r = await aiAssist("triage_message", { thread_id: threadId, draft: true });
    setBusy(null);
    if (!r.ok) return setError(aiErrorMessage(r));
    if (r.triage) setTriage(r.triage as Triage);
    setReply(typeof r.reply === "string" ? r.reply : null);
  };

  return (
    <div className="space-y-2 border-t border-gold-light/30 bg-teal-50/40 px-3 py-2.5" aria-label="AI helper">
      <div className="flex flex-wrap items-center gap-1.5">
        <AiSpark className="h-3.5 w-3.5 text-teal-700" />
        <StatusChip tone={triage.dsl ? "bad" : "info"}>{TRIAGE_CATEGORY_LABEL[triage.category] || triage.category}</StatusChip>
        {triage.urgency === "urgent" && <StatusChip tone="bad">Urgent</StatusChip>}
        <span className="text-xs text-ink/70">Suggested: {triage.handler}</span>
        <button type="button" onClick={() => setHidden(true)} className="ml-auto text-xs text-ink/55 hover:text-ink" aria-label="Hide AI helper">
          Hide
        </button>
      </div>
      <p className="text-sm text-ink/85">{triage.summary}</p>

      {triage.dsl && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p className="font-semibold">Pass to the DSL now.</p>
          <p className="mt-0.5 text-xs">This may be a safeguarding concern. Record it straight away and tell the Designated Safeguarding Lead. Do not promise to keep it confidential, and don&apos;t investigate yourself.</p>
          <Link href="/report-concern" className="mt-1.5 inline-flex min-h-9 items-center rounded-lg border border-red-300 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50">
            Report a concern
          </Link>
        </div>
      )}

      {reply ? (
        <div className="rounded-lg border border-gold-light bg-white p-2.5">
          <p className="whitespace-pre-wrap text-sm text-ink/85">{reply}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onUseDraft(reply)} className="rounded-lg bg-gold-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gold-900">
              Use draft
            </button>
            <button type="button" disabled={!!busy} onClick={draft} className="rounded-lg border border-gold-light px-3 py-1.5 text-xs font-medium text-ink hover:bg-cream disabled:opacity-50">
              {busy === "draft" ? "Writing…" : "Try again"}
            </button>
          </div>
          <AiDisclaimer className="mt-2" />
        </div>
      ) : (
        <button type="button" disabled={!!busy} onClick={draft} className="inline-flex items-center gap-1.5 rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-cream disabled:opacity-50">
          <AiSpark className="h-3.5 w-3.5 text-teal-700" />
          {busy === "draft" ? "Writing…" : "Draft a reply"}
        </button>
      )}
      {error && <p role="alert" className="text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
