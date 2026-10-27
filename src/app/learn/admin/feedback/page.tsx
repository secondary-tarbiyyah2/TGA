"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { Tabs, tabPanelProps } from "@/components/learn/Tabs";
import { Icon, type IconName } from "@/components/learn/Icon";
import { ActivityList } from "@/components/learn/feedback/ActivityList";
import { getSupabaseClient } from "@/lib/supabase/client";
import { learnRoleLabel, type LearnRole } from "@/lib/learn/session";
import {
  KIND_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  attachmentUrl,
  formatBytes,
  ticketRef,
  type FeedbackKind,
  type FeedbackPriority,
  type FeedbackStatus,
  type FeedbackTicket,
} from "@/lib/learn/feedback";

type View = "new" | "in_progress" | "planned" | "closed" | "all";
const KIND_ICON: Record<FeedbackKind, IconName> = { problem: "bug", idea: "lightbulb", question: "circleHelp" };
const PRIORITY_LABEL: Record<FeedbackPriority, string> = { low: "Low", normal: "Normal", high: "High" };

const inView = (t: FeedbackTicket, v: View) => (v === "all" ? true : v === "closed" ? t.status === "done" || t.status === "wont_fix" : t.status === v);
const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 14 ? `${d} day${d === 1 ? "" : "s"} ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
};
const rolesText = (roles: string[]) => roles.map((r) => learnRoleLabel(r as LearnRole) || r).join(", ") || "No role";
const problemCount = (t: FeedbackTicket) => (t.activity || []).filter((e) => e.type === "error" || e.type === "request").length;

function FeedbackAdmin() {
  const [tickets, setTickets] = useState<FeedbackTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("new");
  const [kind, setKind] = useState<FeedbackKind | "">("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error: err } = await supabase
      .from("feedback_tickets")
      .select("*, profiles:submitted_by(full_name)")
      .order("created_at", { ascending: false })
      .limit(500);
    setError(err ? "Feedback couldn't be loaded. Refresh to try again." : null);
    setTickets((data as unknown as FeedbackTicket[]) || []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<View, number> = { new: 0, in_progress: 0, planned: 0, closed: 0, all: 0 };
    for (const t of tickets || []) for (const v of Object.keys(c) as View[]) if (inView(t, v)) c[v]++;
    return c;
  }, [tickets]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (tickets || []).filter(
      (t) =>
        inView(t, view) &&
        (!kind || t.kind === kind) &&
        (!needle || [t.title, t.details, t.profiles?.full_name, ticketRef(t.number), t.page_path].some((v) => v?.toLowerCase().includes(needle))),
    );
  }, [tickets, view, kind, q]);

  const current = tickets?.find((t) => t.id === openId) || null;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "Feedback and requests" }]}
        title="Feedback and requests"
        subtitle="Problems, ideas and questions sent from the portal by staff, parents and pupils. Each comes with what the person was doing just before."
      />
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <Tabs
        items={[
          { key: "new", label: "New", count: counts.new, countAlert: true },
          { key: "in_progress", label: "Being looked at", count: counts.in_progress },
          { key: "planned", label: "Planned", count: counts.planned },
          { key: "closed", label: "Closed", count: counts.closed },
          { key: "all", label: "All", count: counts.all },
        ]}
        value={view}
        onChange={setView}
        label="Feedback by status"
        idBase="feedback"
        className="mb-4"
      />

      <div {...tabPanelProps("feedback", view)}>
        <div className="mb-3 flex flex-wrap gap-2">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, name, page or FB-0001" aria-label="Search feedback" className="min-w-0 flex-1 rounded-lg border border-gold-light px-3 py-2 text-sm sm:max-w-sm" />
          <select value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind | "")} aria-label="Type" className="rounded-lg border border-gold-light px-3 py-2 text-sm">
            <option value="">All types</option>
            {(Object.keys(KIND_LABEL) as FeedbackKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>

        {tickets === null ? (
          <div className="h-40 animate-pulse rounded-2xl bg-white" />
        ) : error ? null : shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/70">
            {q.trim() || kind ? "No feedback matches your search." : view === "new" ? "Nothing new. You're all caught up." : "Nothing here yet."}
            {(q.trim() || kind) && (
              <button type="button" onClick={() => { setQ(""); setKind(""); }} className="ml-2 font-semibold text-teal-700 underline">
                Clear search
              </button>
            )}
          </p>
        ) : (
          <ul className="divide-y divide-gold-light overflow-hidden rounded-2xl border border-gold-light bg-white">
            {shown.map((t) => {
              const problems = problemCount(t);
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => setOpenId(t.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-cream">
                    <span aria-hidden="true" className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.kind === "problem" ? "bg-red-50 text-red-700" : t.kind === "idea" ? "bg-gold-100 text-gold-900" : "bg-teal-100 text-teal-700"}`}>
                      <Icon name={KIND_ICON[t.kind]} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-ink">{t.title}</span>
                        {t.priority === "high" && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">High priority</span>}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink/65">
                        {ticketRef(t.number)} · {KIND_LABEL[t.kind]} · {t.profiles?.full_name || "Unknown"} ({rolesText(t.submitter_roles)}) · {ago(t.created_at)}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1.5 text-xs">
                        {t.page_path && <span className="max-w-[16rem] truncate rounded bg-cream px-1.5 py-0.5 text-ink/75">{t.page_path}</span>}
                        {t.attachments.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded bg-cream px-1.5 py-0.5 text-ink/75">
                            <Icon name="paperclip" className="h-3 w-3" />
                            {t.attachments.length}
                          </span>
                        )}
                        {problems > 0 && (
                          <span className="rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-800">
                            {problems} error{problems === 1 ? "" : "s"}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {tickets !== null && tickets.length >= 500 && <p className="mt-2 text-xs text-ink/65">Showing the newest 500 only.</p>}
      </div>

      {current &&
        createPortal(
          <TicketDrawer
            ticket={current}
            onClose={() => setOpenId(null)}
            onSaved={(t) => setTickets((list) => (list || []).map((x) => (x.id === t.id ? { ...x, ...t } : x)))}
          />,
          document.body,
        )}
    </>
  );
}

function TicketDrawer({ ticket, onClose, onSaved }: { ticket: FeedbackTicket; onClose: () => void; onSaved: (t: Partial<FeedbackTicket> & { id: string }) => void }) {
  const [status, setStatus] = useState<FeedbackStatus>(ticket.status);
  const [priority, setPriority] = useState<FeedbackPriority>(ticket.priority);
  const [response, setResponse] = useState(ticket.response || "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = status !== ticket.status || priority !== ticket.priority || response.trim() !== (ticket.response || "");
  // Don't throw away a half-written reply by pressing Escape or clicking outside.
  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("Close without saving your changes?")) return;
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && requestClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [requestClose]);

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setNote(null);
    const patch = { status, priority, response: response.trim() || null };
    const { data, error } = await supabase.from("feedback_tickets").update(patch).eq("id", ticket.id).select("id, status, priority, response, responded_at, resolved_at, updated_at").single();
    setBusy(false);
    if (error || !data) {
      setNote({ ok: false, text: "Couldn't save. Try again." });
      return;
    }
    onSaved(data as Partial<FeedbackTicket> & { id: string });
    setNote({ ok: true, text: response.trim() && response.trim() !== (ticket.response || "") ? "Saved. They'll see your reply in Your feedback." : "Saved." });
  };

  const open = async (path: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const url = await attachmentUrl(supabase, path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const env = ticket.environment || {};

  return (
    <div className="portal fixed inset-0 z-[100] flex justify-end" data-activity-ignore>
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-ink/40" onClick={requestClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby="fb-drawer-title" className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-gold-light px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs text-ink/65">
              {ticketRef(ticket.number)} · {KIND_LABEL[ticket.kind]} · {new Date(ticket.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })}
            </p>
            <h2 id="fb-drawer-title" className="mt-0.5 text-lg font-semibold text-ink">
              {ticket.title}
            </h2>
            <p className="text-sm text-ink/70">
              From {ticket.profiles?.full_name || "Unknown"} ({rolesText(ticket.submitter_roles)})
            </p>
          </div>
          <button type="button" onClick={requestClose} aria-label="Close" className="portal-icon-btn -mr-2 shrink-0" autoFocus>
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4 text-sm">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/65">What they wrote</h3>
            <p className="mt-1 whitespace-pre-wrap text-ink">{ticket.details}</p>
          </section>

          <section className="space-y-3 rounded-xl border border-gold-light p-4">
            <h3 className="text-sm font-semibold text-ink">Triage</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-ink/70">
                Status
                <select value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)} className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2 text-sm text-ink">
                  {(Object.keys(STATUS_LABEL) as FeedbackStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-ink/70">
                Priority
                <select value={priority} onChange={(e) => setPriority(e.target.value as FeedbackPriority)} className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2 text-sm text-ink">
                  {(Object.keys(PRIORITY_LABEL) as FeedbackPriority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs font-medium text-ink/70">
              Reply to {ticket.profiles?.full_name?.split(" ")[0] || "them"}
              <textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={4} maxLength={5000} placeholder="Thanks for letting us know. We've fixed this and it'll be live tomorrow." className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2 text-sm text-ink" />
              <span className="mt-1 block font-normal text-ink/65">They see this on their Your feedback page.</span>
            </label>
          </section>

          {ticket.attachments.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/65">Attachments</h3>
              <ul className="mt-2 space-y-1.5">
                {ticket.attachments.map((a) => (
                  <li key={a.path}>
                    <button type="button" onClick={() => open(a.path)} className="flex w-full items-center gap-2 rounded-lg bg-cream px-3 py-2 text-left hover:bg-gold-100">
                      <Icon name={a.mime.startsWith("image/") ? "image" : "file"} className="h-4 w-4 shrink-0 text-ink/65" />
                      <span className="min-w-0 flex-1 truncate text-ink">{a.name}</span>
                      <span className="shrink-0 text-xs text-ink/65">{formatBytes(a.size)}</span>
                      <Icon name="download" className="h-4 w-4 shrink-0 text-teal-700" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <details open={problemCount(ticket) > 0}>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-ink/65">
              Context and recent activity{problemCount(ticket) > 0 ? ` (${problemCount(ticket)} error${problemCount(ticket) === 1 ? "" : "s"})` : ""}
            </summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-ink/65">Page</dt>
              <dd className="break-all text-ink">{ticket.page_path || "Not recorded"}</dd>
              {env.userAgent !== undefined && (
                <>
                  <dt className="text-ink/65">Browser</dt>
                  <dd className="break-words text-ink">{String(env.userAgent)}</dd>
                  <dt className="text-ink/65">Window</dt>
                  <dd className="text-ink">
                    {String(env.viewport)} (screen {String(env.screen)}) · {String(env.language)} · {String(env.timeZone)}
                    {env.online === false ? " · offline" : ""}
                  </dd>
                </>
              )}
            </dl>
            <h4 className="mt-3 text-xs font-semibold text-ink">Recent activity before sending</h4>
            <div className="mt-1.5">
              <ActivityList events={ticket.activity} empty={ticket.resolved_at ? "Cleared under the retention policy, or nothing was recorded." : "Nothing was recorded."} />
            </div>
          </details>

        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gold-light px-5 py-3">
          {note && (
            <p role="status" className={`mr-auto text-sm ${note.ok ? "text-green-800" : "text-red-700"}`}>
              {note.text}
            </p>
          )}
          <button type="button" onClick={requestClose} className="rounded-lg border border-gold-light px-4 py-2 text-sm font-medium text-ink hover:bg-cream">
            Close
          </button>
          <button type="button" onClick={save} disabled={busy || !dirty} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </aside>
    </div>
  );
}

export default function AdminFeedbackPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <FeedbackAdmin />
      </LearnGate>
    </section>
  );
}
