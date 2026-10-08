"use client";

import { useCallback, useEffect, useState } from "react";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";

// Headteacher/Admin tools for the Friday weekly digest (weekly-digest Edge
// Function): see who gets it, preview any family's digest, or send a TEST copy
// to your own address. Previews and tests are never sent to the family and
// never count towards the weekly send.

type FamilyRow = {
  parent_user_id: string;
  parent_name: string;
  parent_email: string;
  children: string[];
  opted_out: boolean;
  this_week: "sending" | "sent" | "failed" | null;
};

const STATUS_TEXT: Record<string, string> = { sent: "Sent this week", sending: "Sending", failed: "Failed (will retry)" };

export function DigestAdmin() {
  const [families, setFamilies] = useState<FamilyRow[] | null>(null);
  const [weekStart, setWeekStart] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; subject: string; html: string } | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const res = await callEdgeFunction("weekly-digest", { action: "families" });
    if (!res.ok) {
      setError(edgeErrorMessage(res));
      setFamilies([]);
      return;
    }
    setError(null);
    setFamilies((res.families as FamilyRow[] | undefined) || []);
    setWeekStart(typeof res.week_start === "string" ? res.week_start : "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const act = async (f: FamilyRow, action: "preview" | "test") => {
    setBusy(`${action}:${f.parent_user_id}`);
    setNotice(null);
    setError(null);
    const res = await callEdgeFunction("weekly-digest", { action, parent_user_id: f.parent_user_id });
    setBusy(null);
    if (!res.ok) {
      setError(edgeErrorMessage(res));
      return;
    }
    if (action === "preview") {
      setPreview({ name: f.parent_name || f.parent_email, subject: String(res.subject || ""), html: String(res.html || "") });
    } else {
      setNotice(`Test digest for ${f.parent_name || f.parent_email} sent to ${String(res.sent_to || "you")}.`);
    }
  };

  const q = search.trim().toLowerCase();
  const shown = (families || []).filter((f) => !q || f.parent_name.toLowerCase().includes(q) || f.parent_email.toLowerCase().includes(q) || f.children.some((c) => c.toLowerCase().includes(q)));
  const optedOut = (families || []).filter((f) => f.opted_out).length;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gold-light/50 bg-white p-4 text-sm text-ink/80">
        <p>
          Every <strong>Friday at about 3pm</strong> each parent gets one email covering each of their children&apos;s week: attendance, homework, merits, teacher comments and next week&apos;s lessons. It sends once per family per week, and parents can switch it off from their family dashboard.
        </p>
        {families && (
          <p className="mt-2 text-xs text-ink/60">
            {families.length} families{optedOut > 0 ? `, ${optedOut} opted out` : ""}.{weekStart ? ` Showing the week beginning ${new Date(`${weekStart}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.` : ""}
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          {notice}
        </p>
      )}

      <section className="rounded-2xl border border-gold-light/50 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">Preview or test a family&apos;s digest</h2>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search parent or child" className="rounded-lg border border-gold-light px-3 py-1.5 text-sm" />
        </div>
        {families === null ? (
          <p className="mt-3 text-sm text-ink/60">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="mt-3 text-sm text-ink/60">No families to show.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gold-light/50">
            {shown.slice(0, 100).map((f) => (
              <li key={f.parent_user_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{f.parent_name || f.parent_email}</span>
                  <span className="block text-xs text-ink/60">
                    {f.children.join(", ")}
                    {f.opted_out ? " · opted out" : ""}
                    {f.this_week ? ` · ${STATUS_TEXT[f.this_week] || f.this_week}` : ""}
                  </span>
                </span>
                <span className="flex gap-1.5">
                  <button type="button" disabled={busy !== null} onClick={() => act(f, "preview")} className="rounded-md border border-gold-light bg-white px-2.5 py-1 text-xs font-semibold text-ink/80 hover:bg-cream disabled:opacity-50">
                    {busy === `preview:${f.parent_user_id}` ? "Loading…" : "Preview"}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => act(f, "test")} className="rounded-md bg-gold-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
                    {busy === `test:${f.parent_user_id}` ? "Sending…" : "Send test to me"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {shown.length > 100 && <p className="mt-2 text-xs text-ink/65">Showing the first 100. Use search to narrow down.</p>}
      </section>

      {preview && (
        <section className="rounded-2xl border border-gold-light/50 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink">Preview: {preview.name}</h2>
              <p className="truncate text-xs text-ink/60">Subject: {preview.subject}</p>
            </div>
            <button type="button" onClick={() => setPreview(null)} className="text-sm text-ink/60 underline">
              Close
            </button>
          </div>
          <iframe title="Digest preview" sandbox="" srcDoc={preview.html} className="mt-3 h-[640px] w-full rounded-lg border border-gold-light bg-white" />
        </section>
      )}
    </div>
  );
}
