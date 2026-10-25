"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { Notice, ui } from "@/components/learn/ui";
import { digestHref, type DigestFamily } from "./digestData";

/**
 * One family's digest exactly as the email client shows it, with the subject
 * and recipient above it. Used in the Families side panel and as its own page.
 * Previews and tests are never sent to the family and never logged.
 */
export function DigestPreview({ parentId, family, compact = false }: { parentId: string; family: DigestFamily | null; compact?: boolean }) {
  const [data, setData] = useState<{ subject: string; html: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      if (!alive) return;
      setData(null);
      setError(null);
      setNotice(null);
      const res = await callEdgeFunction("weekly-digest", { action: "preview", parent_user_id: parentId });
      if (!alive) return;
      if (!res.ok) setError(edgeErrorMessage(res));
      else setData({ subject: String(res.subject || ""), html: String(res.html || "") });
    })();
    return () => {
      alive = false;
    };
  }, [parentId]);

  const sendTest = async () => {
    setBusy(true);
    setNotice(null);
    setError(null);
    const res = await callEdgeFunction("weekly-digest", { action: "test", parent_user_id: parentId });
    setBusy(false);
    if (!res.ok) setError(edgeErrorMessage(res));
    else setNotice(`Test copy sent to ${String(res.sent_to || "you")}. The family was not emailed.`);
  };

  const who = family ? family.parent_name || family.parent_email : "This family";
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gold-light bg-white p-3 text-sm">
        <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1">
          <dt className="text-ink/60">To</dt>
          <dd className="min-w-0 truncate text-ink">
            {who}
            {family?.parent_email && family.parent_name ? <span className="text-ink/60"> &lt;{family.parent_email}&gt;</span> : null}
          </dd>
          <dt className="text-ink/60">Subject</dt>
          <dd className="min-w-0 text-ink">{data ? data.subject.replace(/^\[TEST\]\s*/, "") : error ? "–" : "Loading…"}</dd>
          {family && family.children.length > 0 && (
            <>
              <dt className="text-ink/60">Covers</dt>
              <dd className="min-w-0 text-ink/80">{family.children.join(", ")}</dd>
            </>
          )}
        </dl>
        {family?.opted_out && <p className="mt-2 text-xs text-amber-900">This family has switched the digest off, so the Friday email doesn&apos;t go to them.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy || !data} onClick={sendTest} className={`${ui.btnPrimary} ${ui.sm}`}>
            {busy ? "Sending…" : "Send a test to me"}
          </button>
          {compact && (
            <Link href={digestHref({ view: "preview", parent: parentId })} className={`${ui.btnSecondary} ${ui.sm}`}>
              Open as a full page
            </Link>
          )}
        </div>
      </div>
      {notice && <Notice tone="good">{notice}</Notice>}
      {error && <Notice tone="bad">{error}</Notice>}
      {data ? (
        <iframe title={`Digest preview for ${who}`} sandbox="" srcDoc={data.html} className={`w-full rounded-xl border border-gold-light bg-white ${compact ? "h-[60vh]" : "h-[80vh]"}`} />
      ) : !error ? (
        <div className={`animate-pulse rounded-xl bg-white ${compact ? "h-[60vh]" : "h-[70vh]"}`} />
      ) : null}
      <p className="text-xs text-ink/60">The preview carries a &ldquo;test&rdquo; banner. The real email is the same without it.</p>
    </div>
  );
}
