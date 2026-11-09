"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnPermission } from "@/lib/learn/session";
import { btn, ui } from "@/components/learn/ui";

import { Select } from "@/components/ui/Dropdown";
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

const TYPE_LABEL: Record<string, string> = { subject_access: "Subject access", rectification: "Rectification", erasure: "Erasure", export: "Export", objection: "Objection" };
const STATUS_LABEL: Record<string, string> = { received: "Received", in_progress: "In progress", completed: "Completed", rejected: "Rejected" };

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

/**
 * Headteacher/Admin can log and action requests; anyone holding
 * can_export_data can see the queue too (they run the export mechanics)
 * but cannot change status, enforced by RLS (0015), this component just
 * hides the action controls for them as a convenience.
 */
export function DataRights() {
  const supabase = getSupabaseClient();
  const canAction = useLearnPermission("can_export_data"); // not authoritative, RLS is; used only to decide whether to show the action form
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [form, setForm] = useState({ request_type: "subject_access", requester_name: "", requester_email: "", subject_description: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

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
    setError(null);
    const { error: err } = await supabase.from("data_rights_requests").insert(form);
    setBusy(false);
    // Keep what was typed if it didn't save (it used to clear the form either way).
    if (err) return setError("Couldn't log the request. Only the Headteacher or an Admin can.");
    setForm({ request_type: "subject_access", requester_name: "", requester_email: "", subject_description: "" });
    await load();
  };

  const setStatus = async (r: Request, status: string) => {
    if (!supabase) return;
    if (status === "rejected" && !window.confirm(`Reject the ${TYPE_LABEL[r.request_type] || r.request_type} request from ${r.requester_name}? Record your reason with the requester in writing.`)) return;
    setError(null);
    const { error: err } = await supabase.from("data_rights_requests").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", r.id);
    if (err) setError("Couldn't update the request. Only the Headteacher or an Admin can.");
    await load();
  };
  const openRequests = (requests || []).filter((r) => r.status !== "completed" && r.status !== "rejected");
  const closedRequests = (requests || []).filter((r) => r.status === "completed" || r.status === "rejected");
  const listed = showClosed ? [...openRequests, ...closedRequests] : openRequests;

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Data rights requests</h2>
      <p className="mt-1 text-xs text-ink/65">Subject access, rectification, erasure, export and objection requests, with the UK GDPR one-calendar-month statutory deadline computed automatically.</p>

      <ul className="mt-3 space-y-2">
        {requests === null && <p className="text-sm text-ink/65">Loading…</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {listed.map((r) => {
          const deadline = r.extended_deadline || r.statutory_deadline;
          const days = daysUntil(deadline);
          return (
            <li key={r.id} className="rounded-lg border border-gold-light/40 p-3 text-sm">
              <p className="font-semibold">{TYPE_LABEL[r.request_type] || r.request_type} · {r.requester_name} ({r.requester_email})</p>
              <p className="mt-0.5 text-ink/70">Subject: {r.subject_description}</p>
              {(() => {
                const closed = r.status === "completed" || r.status === "rejected";
                return (
                  <p className={`mt-1 text-xs ${!closed && days < 7 ? "font-semibold text-red-700" : "text-ink/65"}`}>
                    Status: {STATUS_LABEL[r.status] || r.status} · deadline {new Date(deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" })}
                    {!closed && ` (${days < 0 ? "overdue" : `${days} day${days === 1 ? "" : "s"} left`})`}
                  </p>
                );
              })()}
              {canAction && r.status !== "completed" && r.status !== "rejected" && (
                <div className="mt-2 flex gap-2">
                  {r.status === "received" && (
                    <button type="button" onClick={() => setStatus(r, "in_progress")} className={btn("secondary", "sm")}>
                      Mark in progress
                    </button>
                  )}
                  <button type="button" onClick={() => setStatus(r, "completed")} className={btn("primary", "sm")}>
                    Mark completed
                  </button>
                  <button type="button" onClick={() => setStatus(r, "rejected")} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 font-medium transition-colors">
                    Reject
                  </button>
                </div>
              )}
            </li>
          );
        })}
        {requests?.length === 0 && <p className="text-sm text-ink/65">No data rights requests logged.</p>}
        {requests && requests.length > 0 && openRequests.length === 0 && !showClosed && <p className="text-sm text-ink/65">No open requests.</p>}
      </ul>
      {closedRequests.length > 0 && (
        <button type="button" onClick={() => setShowClosed((v) => !v)} className="mt-2 text-xs font-medium text-teal-700 underline">
          {showClosed ? "Hide finished requests" : `Show ${closedRequests.length} finished request${closedRequests.length === 1 ? "" : "s"}`}
        </button>
      )}

      <form onSubmit={submit} className="mt-4 space-y-2 border-t border-gold-light/30 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">Log a new request</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select allowEmpty value={form.request_type} onChange={(e) => setForm({ ...form, request_type: e.target.value })} aria-label="Request type" className={`${ui.select} !w-auto`}>
            <option value="subject_access">Subject access</option>
            <option value="rectification">Rectification</option>
            <option value="erasure">Erasure</option>
            <option value="export">Export</option>
            <option value="objection">Objection</option>
          </Select>
          <input value={form.requester_name} onChange={(e) => setForm({ ...form, requester_name: e.target.value })} placeholder="Requester name" className={`${ui.input} !w-auto`} />
          <input value={form.requester_email} onChange={(e) => setForm({ ...form, requester_email: e.target.value })} placeholder="Requester email" type="email" className={`${ui.input} !w-auto`} />
          <input value={form.subject_description} onChange={(e) => setForm({ ...form, subject_description: e.target.value })} placeholder="Whose data (e.g. name/relationship)" className={`${ui.input} !w-auto`} />
        </div>
        <button type="submit" disabled={busy} className={btn("primary")}>
          Log request
        </button>
      </form>
    </div>
  );
}
