"use client";

import { useCallback, useEffect, useState } from "react";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { useLearnSession } from "@/lib/learn/session";
import { ui } from "@/components/learn/ui";

type CapState = "ok" | "missing_permission" | "not_configured" | "off" | "error" | "untested";
type Capability = { key: string; label: string; state: CapState; detail: string; optional?: boolean };
type MeetingCounts = { available: boolean; upcoming?: number; failed?: number; last_change?: string | null; last_error?: string | null };
type StatusResult = { ok: boolean; configured?: boolean; organiser?: string | null; sender?: string | null; capabilities?: Capability[]; meetings?: MeetingCounts; error?: string; detail?: string };
type SyncPart = { enabled: boolean; reason?: string; created?: number; updated?: number; recreated?: number; cancelled?: number; failed?: number; deferred?: number; done?: number; pupils?: number; errors?: string[] } | null;

const STATE: Record<CapState, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "bg-green-100 text-green-900" },
  missing_permission: { label: "Missing permission", cls: "bg-red-100 text-red-900" },
  not_configured: { label: "Not configured", cls: "bg-slate-100 text-slate-800" },
  off: { label: "Ready, switched off", cls: "bg-amber-100 text-amber-900" },
  error: { label: "Problem", cls: "bg-red-100 text-red-900" },
  untested: { label: "Not checked yet", cls: "bg-slate-100 text-slate-800" },
};

/**
 * School settings → "Microsoft 365 connection". Tests the app registration
 * the portal uses for email and Teams (teams-sync, action "status") and
 * reports each capability, and can start a Teams meeting sync. Headteacher
 * and Admin only (the Edge Function re-checks).
 */
export function Microsoft365Connection() {
  const { roles } = useLearnSession();
  const allowed = roles.some((r) => r.role === "head_teacher" || r.role === "admin");
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const test = useCallback(async () => {
    setTesting(true);
    const r = (await callEdgeFunction("teams-sync", { action: "status" })) as StatusResult;
    setStatus(r.ok ? r : { ok: false, error: edgeErrorMessage(r) });
    setTesting(false);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    callEdgeFunction("teams-sync", { action: "status" }).then((r) => {
      if (alive) setStatus(r.ok ? (r as StatusResult) : { ok: false, error: edgeErrorMessage(r) });
    });
    return () => {
      alive = false;
    };
  }, [allowed]);

  const sync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    const r = await callEdgeFunction("teams-sync", { action: "sync" });
    setSyncing(false);
    if (!r.ok) return setSyncMsg(`Sync failed: ${edgeErrorMessage(r)}`);
    const m = r.meetings as SyncPart;
    const a = r.attendance as SyncPart;
    const parts: string[] = [];
    if (m && !m.enabled) parts.push(m.reason || "Teams meetings are off.");
    else if (m) {
      parts.push(`Meetings: ${m.created || 0} created, ${m.updated || 0} updated, ${m.recreated || 0} re-created, ${m.cancelled || 0} cancelled${m.failed ? `, ${m.failed} failed` : ""}${m.deferred ? `, ${m.deferred} left for the next run` : ""}.`);
      if (m.reason) parts.push(m.reason);
      if (m.errors?.length) parts.push(m.errors[0]);
    }
    if (a?.enabled) parts.push(`Attendance: ${a.done || 0} lesson(s) read, ${a.pupils || 0} pupil match(es)${a.failed ? `, ${a.failed} failed` : ""}.${a.errors?.length ? ` ${a.errors[0]}` : ""}`);
    setSyncMsg(parts.join(" "));
    void test();
  };

  if (!allowed) return null;
  const meetings = status?.meetings;

  return (
    <section className="rounded-2xl border border-gold-light bg-white">
      <div className="border-b border-gold-light px-5 py-4">
        <h2 className="text-base font-semibold text-ink">Microsoft 365 connection</h2>
        <p className="mt-0.5 text-sm text-ink/65">
          School email from Outlook, a Teams meeting for each lesson, and Teams attendance hints on registers. The set-up guide is docs/microsoft-365-setup.md in the school&apos;s code repository.
        </p>
      </div>
      <div className="space-y-4 px-5 py-5">
        {!status && <div className="h-24 animate-pulse rounded-xl bg-cream" />}
        {status && !status.ok && <p className="text-sm text-red-800">Couldn&apos;t check the connection: {status.error}</p>}
        {status?.ok && (
          <>
            <ul className="divide-y divide-gold-light/70 rounded-xl border border-gold-light">
              {(status.capabilities || []).map((c) => (
                <li key={c.key} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">
                      {c.label}
                      {c.optional && <span className="ml-2 text-xs font-normal text-ink/65">optional</span>}
                    </p>
                    <p className="mt-0.5 break-words text-xs text-ink/70">{c.detail}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATE[c.state].cls}`}>{STATE[c.state].label}</span>
                </li>
              ))}
            </ul>
            {meetings?.available ? (
              <p className="text-sm text-ink/75">
                Upcoming lessons with a Teams meeting: <span className="font-semibold text-ink">{meetings.upcoming ?? 0}</span>
                {meetings.failed ? (
                  <>
                    {" "}
                    · <span className="font-semibold text-red-800">{meetings.failed} couldn&apos;t be created</span>
                    {meetings.last_error ? <span className="block text-xs text-red-800">{meetings.last_error}</span> : null}
                  </>
                ) : null}
                {meetings.last_change && <span className="block text-xs text-ink/65">Last change {new Date(meetings.last_change).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>}
              </p>
            ) : (
              <p className="text-xs text-ink/65">Lesson meeting records aren&apos;t available yet (database update 0145 not applied).</p>
            )}
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-gold-light px-5 py-3">
        <button type="button" className={ui.btnSecondary} onClick={() => void test()} disabled={testing}>
          {testing ? "Testing…" : "Test connection"}
        </button>
        <button type="button" className={ui.btnPrimary} onClick={() => void sync()} disabled={syncing || testing}>
          {syncing ? "Syncing…" : "Sync Teams meetings now"}
        </button>
        {syncMsg && (
          <p className="w-full text-sm text-ink/75" aria-live="polite">
            {syncMsg}
          </p>
        )}
      </div>
    </section>
  );
}
