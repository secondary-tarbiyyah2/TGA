"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { EmptyState, Notice, ui } from "@/components/learn/ui";
import { ReportDocument } from "./ReportDocument";
import { asNarrative } from "./summary";
import { fmtDate } from "./data";

type Item = {
  id: string;
  child_id: string;
  status: string;
  overall_comment: string | null;
  narrative: unknown;
  submitted_at: string | null;
  updated_at: string;
  children: { name: string } | null;
  terms: { name: string } | null;
  submitter: { full_name: string } | null;
};

/** The Headteacher's queue: every submitted report, to approve and issue or send back with a note. */
export function ApprovalQueue({ me, onChanged }: { me: { id: string; name: string } | null; onChanged: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [returning, setReturning] = useState<{ id: string; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ tone: "good" | "bad" | "warn"; text: string } | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("term_reports")
      .select("id, child_id, status, overall_comment, narrative, submitted_at, updated_at, children(name), terms(name), submitter:profiles!term_reports_submitted_by_fkey(full_name)")
      .in("status", ["pending_approval", "approved"])
      .order("submitted_at", { ascending: true, nullsFirst: false })
      .limit(500);
    if (error) setMsg({ tone: "bad", text: `Couldn't load the queue: ${error.message}` });
    setItems((data as unknown as Item[]) || []);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items || []).filter((x) => !needle || (x.children?.name || "").toLowerCase().includes(needle));
  }, [items, q]);

  const issue = async (ids: string[]) => {
    const supabase = getSupabaseClient();
    if (!supabase || !me || ids.length === 0) return;
    if (ids.length > 1 && !window.confirm(`Approve and issue ${ids.length} reports to families now?`)) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("term_reports").update({ status: "released" }).in("id", ids);
    setBusy(false);
    if (error) return setMsg({ tone: "bad", text: `Issuing failed: ${error.message}` });
    setMsg({ tone: "good", text: `Issued ${ids.length} report${ids.length === 1 ? "" : "s"} to families.` });
    setSelected([]);
    setOpen(null);
    await load();
    onChanged();
  };

  const sendBack = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !returning) return;
    if (!returning.reason.trim()) return setMsg({ tone: "warn", text: "Say what needs changing, so the teacher knows." });
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("term_reports").update({ status: "draft", returned_reason: returning.reason.trim() }).eq("id", returning.id);
    setBusy(false);
    if (error) return setMsg({ tone: "bad", text: `Sending back failed: ${error.message}` });
    setMsg({ tone: "good", text: "Sent back to the teacher with your note." });
    setReturning(null);
    setSelected((s) => s.filter((x) => x !== returning.id));
    await load();
    onChanged();
  };

  if (items === null) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;

  return (
    <div className="space-y-4">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {items.length === 0 ? (
        <EmptyState title="Nothing is waiting for approval" icon="clipboardCheck" tile="tile-green">
          When a teacher submits a report it appears here for you to read, approve and issue, or send back with a note.
        </EmptyState>
      ) : (
        <section className="rounded-2xl border border-gold-light bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-light px-4 py-3">
            <label className="flex items-center gap-2 text-sm text-ink/75">
              <input
                type="checkbox"
                checked={selected.length > 0 && selected.length === shown.length}
                onChange={(e) => setSelected(e.target.checked ? shown.map((x) => x.id) : [])}
                aria-label="Select all shown"
              />
              {shown.length} waiting
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pupils" aria-label="Search pupils" className={`${ui.input} !w-44 !py-1.5`} />
              <button type="button" disabled={busy || selected.length === 0} onClick={() => issue(selected)} className={`${ui.btnPrimary} ${ui.sm}`}>
                Approve and issue selected ({selected.length})
              </button>
            </div>
          </div>
          <ul className="divide-y divide-gold-light/50">
            {shown.map((x) => {
              const name = x.children?.name || "Pupil";
              const isOpen = open === x.id;
              return (
                <li key={x.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <input type="checkbox" className="mt-1" aria-label={`Select ${name}`} checked={selected.includes(x.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, x.id] : s.filter((y) => y !== x.id)))} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">
                        {name} <span className="font-normal text-ink/65">· {x.terms?.name || "All time"}</span>
                      </p>
                      <p className="text-xs text-ink/65">
                        Submitted {fmtDate(x.submitted_at || x.updated_at)}
                        {x.submitter?.full_name ? ` by ${x.submitter.full_name}` : ""}
                      </p>
                      {!isOpen && x.overall_comment && <p className="mt-1 line-clamp-2 text-sm text-ink/75">{x.overall_comment}</p>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => setOpen(isOpen ? null : x.id)} aria-expanded={isOpen} className={`${ui.btnSecondary} ${ui.sm}`}>
                        {isOpen ? "Hide" : "Read"}
                      </button>
                      <button type="button" disabled={busy} onClick={() => setReturning(returning?.id === x.id ? null : { id: x.id, reason: "" })} className={`${ui.btnSecondary} ${ui.sm}`}>
                        Send back
                      </button>
                      <button type="button" disabled={busy} onClick={() => issue([x.id])} className={`${ui.btnPrimary} ${ui.sm}`}>
                        Approve and issue
                      </button>
                    </div>
                  </div>
                  {returning?.id === x.id && (
                    <div className="mt-2 sm:pl-7">
                      <label htmlFor={`ret-${x.id}`} className="block text-xs font-medium text-ink">
                        What needs changing? The teacher sees this.
                      </label>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <input id={`ret-${x.id}`} value={returning.reason} onChange={(e) => setReturning({ id: x.id, reason: e.target.value })} className={`min-w-0 flex-1 ${ui.input}`} placeholder="e.g. Please add a target for next term." />
                        <button type="button" disabled={busy} onClick={sendBack} className={ui.btnPrimary}>
                          Send back
                        </button>
                      </div>
                    </div>
                  )}
                  {isOpen && (
                    <div className="mt-3 sm:pl-7">
                      <ReportDocument childName={name} termLabel={x.terms?.name || "All time"} status={x.status} narrative={asNarrative(x.narrative)} comment={x.overall_comment} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
