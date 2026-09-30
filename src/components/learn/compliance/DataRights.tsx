"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnPermission } from "@/lib/learn/session";

type Request = {
  id: string;
  request_type: string;
  requester_name: string;
  requester_email: string;
  subject_description: string | null;
  status: string;
  received_at: string;
  statutory_deadline: string;
  extended_deadline: string | null;
};

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

/**
 * Head Teacher/Admin can log and action requests; anyone holding
 * can_export_data can see the queue too (they run the export mechanics)
 * but cannot change status — enforced by RLS (0015), this component just
 * hides the action controls for them as a convenience.
 */
export function DataRights() {
  const supabase = getSupabaseClient();
  const canAction = useLearnPermission("can_export_data"); // not authoritative — RLS is; used only to decide whether to show the action form
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [form, setForm] = useState({ request_type: "subject_access", requester_name: "", requester_email: "", subject_description: "" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("data_rights_requests")
      .select("id, request_type, requester_name, requester_email, subject_description, status, received_at, statutory_deadline, extended_deadline")
      .order("received_at", { ascending: false });
    setRequests((data as Request[]) || []);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !form.requester_name.trim() || !form.requester_email.trim() || !form.subject_description.trim()) return;
    setBusy(true);
    await supabase.from("data_rights_requests").insert(form);
    setForm({ request_type: "subject_access", requester_name: "", requester_email: "", subject_description: "" });
    setBusy(false);
    await load();
  };

  const setStatus = async (id: string, status: string) => {
    if (!supabase) return;
    await supabase.from("data_rights_requests").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", id);
    await load();
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Data rights requests</h2>
      <p className="mt-1 text-xs text-ink/50">Subject access, rectification, erasure, export and objection requests, with the UK GDPR one-calendar-month statutory deadline computed automatically.</p>

      <ul className="mt-3 space-y-2">
        {requests === null && <p className="text-sm text-ink/60">Loading…</p>}
        {(requests || []).map((r) => {
          const deadline = r.extended_deadline || r.statutory_deadline;
          const days = daysUntil(deadline);
          return (
            <li key={r.id} className="rounded-lg border border-gold-light/40 p-3 text-sm">
              <p className="font-semibold">{r.request_type.replace("_", " ")} — {r.requester_name} ({r.requester_email})</p>
              <p className="mt-0.5 text-ink/70">Subject: {r.subject_description}</p>
              <p className={`mt-1 text-xs ${days < 7 ? "font-semibold text-red-700" : "text-ink/50"}`}>
                Status: {r.status} · deadline {new Date(deadline).toLocaleDateString("en-GB")} ({days < 0 ? "overdue" : `${days} day(s) left`})
              </p>
              {canAction && r.status !== "completed" && r.status !== "rejected" && (
                <div className="mt-2 flex gap-2">
                  {r.status === "received" && (
                    <button type="button" onClick={() => setStatus(r.id, "in_progress")} className="rounded-lg border border-gold-light px-3 py-1.5 text-xs hover:bg-cream bg-white text-ink/80 font-medium transition-colors">
                      Mark in progress
                    </button>
                  )}
                  <button type="button" onClick={() => setStatus(r.id, "completed")} className="rounded-lg bg-gold-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gold-900 transition-colors">
                    Mark completed
                  </button>
                  <button type="button" onClick={() => setStatus(r.id, "rejected")} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 font-medium transition-colors">
                    Reject
                  </button>
                </div>
              )}
            </li>
          );
        })}
        {requests?.length === 0 && <p className="text-sm text-ink/60">No data rights requests logged.</p>}
      </ul>

      <form onSubmit={submit} className="mt-4 space-y-2 border-t border-gold-light/30 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">Log a new request</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <select value={form.request_type} onChange={(e) => setForm({ ...form, request_type: e.target.value })} aria-label="Request type" className="rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm">
            <option value="subject_access">Subject access</option>
            <option value="rectification">Rectification</option>
            <option value="erasure">Erasure</option>
            <option value="export">Export</option>
            <option value="objection">Objection</option>
          </select>
          <input value={form.requester_name} onChange={(e) => setForm({ ...form, requester_name: e.target.value })} placeholder="Requester name" className="rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm" />
          <input value={form.requester_email} onChange={(e) => setForm({ ...form, requester_email: e.target.value })} placeholder="Requester email" type="email" className="rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm" />
          <input value={form.subject_description} onChange={(e) => setForm({ ...form, subject_description: e.target.value })} placeholder="Whose data (e.g. name/relationship)" className="rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm" />
        </div>
        <button type="submit" disabled={busy} className="rounded-lg bg-gold-700 px-4 py-1.5 text-sm font-semibold disabled:opacity-60 text-white hover:bg-gold-900 transition-colors">
          Log request
        </button>
      </form>
    </div>
  );
}
