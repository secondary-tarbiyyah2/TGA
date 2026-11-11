"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnPermission, useLearnSession } from "@/lib/learn/session";
import { useNow } from "@/lib/learn/useNow";
import { btn, ui } from "@/components/learn/ui";
import { Select } from "@/components/learn/Select";

type SubjectType = "pupil" | "parent";
type Candidate = { id: string; label: string; detail: string };
type RequestOption = { id: string; requester_name: string; received_at: string };
type ExportFile = { name: string; label: string; url: string };
type ExportResult = { export_id: string; expires_at: string; counts: Record<string, number>; files: ExportFile[] };
type LogRow = { id: string; subject_type: SubjectType; subject_label: string; include_child_records: boolean; include_safeguarding: boolean; created_at: string; expires_at: string; files_deleted_at: string | null };

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const clean = (s: string) => s.replace(/[,()%*\\]/g, " ").trim();

async function errorMessage(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx instanceof Response) {
    try {
      const body = (await ctx.json()) as { error?: string; detail?: string };
      if (body.error === "forbidden") return "Only the Headteacher or Admin can run a subject-access export.";
      if (body.error === "not_found") return "That person could not be found.";
      return body.detail || body.error || "The export failed.";
    } catch {
      /* fall through */
    }
  }
  return error instanceof Error ? error.message : "The export failed.";
}

/**
 * One-click subject-access export. The Edge Function (JWT verified,
 * Headteacher/Admin only) assembles the person's data, leaves out third-party
 * data, stores a JSON file and an HTML summary in a private bucket and returns
 * 24-hour links. This screen only chooses the person and shows the result.
 */
export function SubjectAccessExport() {
  const supabase = getSupabaseClient();
  const { roles } = useLearnSession();
  const isSafeguardingLead = useLearnPermission("safeguarding_lead");
  const canSeeSafeguarding = isSafeguardingLead || roles.some((r) => r.role === "head_teacher");

  const now = useNow();
  const [type, setType] = useState<SubjectType>("pupil");
  const [term, setTerm] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [includeChildren, setIncludeChildren] = useState(false);
  const [includeSafeguarding, setIncludeSafeguarding] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [requests, setRequests] = useState<RequestOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [log, setLog] = useState<LogRow[] | null>(null);

  const loadSide = useCallback(async () => {
    if (!supabase) return;
    const [reqs, logs] = await Promise.all([
      supabase.from("data_rights_requests").select("id, requester_name, received_at").in("request_type", ["subject_access", "export"]).neq("status", "completed").order("received_at", { ascending: false }).limit(50),
      supabase.from("data_export_log").select("id, subject_type, subject_label, include_child_records, include_safeguarding, created_at, expires_at, files_deleted_at").order("created_at", { ascending: false }).limit(20),
    ]);
    setRequests((reqs.data as RequestOption[] | null) || []);
    setLog((logs.data as LogRow[] | null) || []);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    loadSide();
  }, [loadSide]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const t = clean(term);
    if (t.length < 2) return;
    setError(null);
    setChosen(null);
    setResult(null);
    if (type === "pupil") {
      const { data } = await supabase.from("children").select("id, name, dob").ilike("name", `%${t}%`).order("name").limit(10);
      setCandidates(((data as { id: string; name: string; dob: string }[] | null) || []).map((c) => ({ id: c.id, label: c.name, detail: c.dob ? `born ${new Date(`${c.dob}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : "" })));
    } else {
      const { data } = await supabase.from("profiles").select("id, full_name, email").eq("role", "parent").or(`full_name.ilike.%${t}%,email.ilike.%${t}%`).order("full_name").limit(10);
      setCandidates(((data as { id: string; full_name: string; email: string }[] | null) || []).map((c) => ({ id: c.id, label: c.full_name, detail: c.email })));
    }
  }

  async function generate() {
    if (!supabase || !chosen) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const { data, error: err } = await supabase.functions.invoke("subject-access-export", {
      body: {
        subject_type: type,
        subject_id: chosen.id,
        include_child_records: type === "parent" && includeChildren,
        include_safeguarding: includeSafeguarding,
        request_id: requestId || undefined,
      },
    });
    setBusy(false);
    if (err || !data?.ok) {
      setError(err ? await errorMessage(err) : String(data?.detail || data?.error || "The export failed."));
      return;
    }
    setResult(data as ExportResult);
    await loadSide();
  }

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Subject access export</h2>
      <p className="mt-1 text-xs text-ink/65">
        Gathers one person&apos;s data (profile, child record, contacts, attendance, behaviour, reports, messages, signatures, admissions record) into a readable summary and a data file, available for 24 hours. Staff names, other families and safeguarding concern content are left out unless you ask for it. The export is recorded in the audit log.
      </p>

      <div className="mt-4 flex gap-4 text-sm">
        {(["pupil", "parent"] as const).map((t) => (
          <label key={t} className="flex items-center gap-2">
            <input
              type="radio"
              name="sar-type"
              checked={type === t}
              onChange={() => {
                setType(t);
                setCandidates(null);
                setChosen(null);
                setResult(null);
              }}
            />
            {t === "pupil" ? "A pupil" : "A parent / carer"}
          </label>
        ))}
      </div>

      <form onSubmit={search} className="mt-3 flex gap-2">
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={type === "pupil" ? "Pupil name…" : "Parent name or email…"} className={`${ui.input} flex-1`} />
        <button type="submit" className={btn("secondary")}>
          Find
        </button>
      </form>

      {candidates && (
        <ul className="mt-2 divide-y divide-gold-light/40 rounded-lg border border-gold-light/50">
          {candidates.length === 0 && <li className="px-3 py-2 text-sm text-ink/65">No match.</li>}
          {candidates.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => { setChosen(c); setResult(null); }} className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-cream ${chosen?.id === c.id ? "bg-cream font-medium" : ""}`}>
                <span>{c.label}</span>
                <span className="text-xs text-ink/65">{c.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {chosen && (
        <div className="mt-4 space-y-3 rounded-xl border border-gold-light/50 bg-cream/40 p-4 text-sm">
          <p>
            Exporting <strong>{chosen.label}</strong> ({chosen.detail})
          </p>
          {type === "parent" && (
            <label className="flex items-start gap-2 text-xs text-ink/80">
              <input type="checkbox" checked={includeChildren} onChange={(e) => setIncludeChildren(e.target.checked)} className="mt-0.5" />
              Also include the school records of this parent&apos;s children (only when the parent is acting for them)
            </label>
          )}
          {canSeeSafeguarding && (
            <label className="flex items-start gap-2 text-xs text-ink/80">
              <input type="checkbox" checked={includeSafeguarding} onChange={(e) => setIncludeSafeguarding(e.target.checked)} className="mt-0.5" />
              Include safeguarding concern summaries about the pupil (Headteacher / Safeguarding Lead only; usually needs an exemption decision before release)
            </label>
          )}
          <label className="block text-xs text-ink/70">
            Link to a logged request (optional)
            <Select value={requestId} onChange={(e) => setRequestId(e.target.value)} className={`${ui.select} mt-1`}>
              <option value="">Not linked</option>
              {requests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.requester_name} · received {new Date(r.received_at).toLocaleDateString("en-GB")}
                </option>
              ))}
            </Select>
          </label>
          <button type="button" onClick={generate} disabled={busy} className={btn("primary")}>
            {busy ? "Preparing the export…" : "Generate export"}
          </button>
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

      {result && (
        <div role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm">
          <p className="font-medium text-green-900">Export ready. These links stop working at {fmt(result.expires_at)}.</p>
          <ul className="mt-2 space-y-1">
            {result.files.map((f) => (
              <li key={f.name}>
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="font-medium text-teal-700 underline">
                  {f.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink/70">Check the summary before sending it to the requester. Records found: {Object.entries(result.counts).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ")}.</p>
        </div>
      )}

      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink/65">Recent exports</p>
      <ul className="mt-2 space-y-1">
        {log === null && <li className="text-sm text-ink/65">Loading…</li>}
        {(log || []).map((l) => (
          <li key={l.id} className="text-sm text-ink/70">
            {fmt(l.created_at)} · {l.subject_type === "pupil" ? "Pupil" : "Parent"} {l.subject_label}
            {l.include_safeguarding ? " · with safeguarding" : ""}
            {l.include_child_records ? " · with child records" : ""} · {l.files_deleted_at || new Date(l.expires_at).getTime() < now ? "link expired" : `link live until ${fmt(l.expires_at)}`}
          </li>
        ))}
        {log?.length === 0 && <li className="text-sm text-ink/65">No exports yet.</li>}
      </ul>
    </div>
  );
}
