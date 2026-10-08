"use client";

import { absoluteFileUrl } from "@/lib/learn/fileLinks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { getPolicyLinks } from "@/lib/content";
import { learnRoleLabel, useLearnPermission, type LearnRole } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DOCX_MIME, UPLOAD_ACCEPT, extractDocxText, openSignableFile, storageObjectName, uploadKind, uploadProblem } from "@/lib/learn/documentUpload";
import { RecordSignatureModal, type SignTarget } from "@/components/learn/documents/RecordSignatureModal";
import { SignatureHistory } from "@/components/learn/documents/SignatureHistory";
import { AUDIENCE_LABEL, audienceText, audienceToRoles, requestSignatures, rolesToAudience, type Audience } from "@/components/learn/documents/audience";

type PolicyRow = { id: string; number: string; title: string; category: string; fileUrl: string; lastReviewed?: string; nextReview?: string };
type SignableDoc = {
  id: string;
  sanity_document_id: string;
  title: string;
  requires_signature: boolean;
  target_roles: string[];
  source: "sanity" | "policy" | "portal";
  file_url: string | null;
  body: string | null;
  file_path: string | null;
  original_path: string | null;
};
type Progress = { document_id: string; required_count: number; signed_count: number };
type Outstanding = { user_id: string; full_name: string | null; email: string | null; title: string; document_id: string };
type RequestRow = { document_id: string; user_id: string; requested_at: string; email_sent: boolean };

const AUDIENCES: Audience[] = ["staff", "parents", "students"];

function AudiencePicker({ value, onChange, disabled }: { value: Audience[]; onChange: (v: Audience[]) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Who must sign">
      {AUDIENCES.map((a) => {
        const on = value.includes(a);
        return (
          <button
            key={a}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== a) : [...value, a])}
            className={`rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-50 ${on ? "border-teal-700 bg-teal-700 text-white" : "border-gold-light bg-white text-ink/70 hover:bg-cream"}`}
          >
            {AUDIENCE_LABEL[a]}
          </button>
        );
      })}
    </div>
  );
}

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-teal-700" : "bg-ink/25"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

const SIGNER_ROLES: LearnRole[] = ["parent", "student", "teacher", "teaching_assistant_cover", "admissions", "admin", "head_teacher"];
const DEFAULT_ROLES: LearnRole[] = ["parent"];

function RolePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SIGNER_ROLES.map((r) => {
        const on = value.includes(r);
        return (
          <button
            key={r}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== r) : [...value, r])}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${on ? "border-teal-700 bg-teal-700 text-white" : "border-gold-light bg-white text-ink/70 hover:bg-cream"}`}
          >
            {learnRoleLabel(r)}
          </button>
        );
      })}
    </div>
  );
}

function Bar({ signed, required }: { signed: number; required: number }) {
  const pct = required === 0 ? 0 : Math.round((signed / required) * 100);
  return (
    <div className="min-w-[140px]">
      <div className="h-2 overflow-hidden rounded-full bg-cream">
        <div className="h-full rounded-full bg-teal-600" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink/55">
        {signed} of {required} signed
      </p>
    </div>
  );
}

function NewDocument({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [roles, setRoles] = useState<string[]>(DEFAULT_ROLES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kind = file ? uploadKind(file) : null;

  const choose = async (f: File | undefined) => {
    setError(null);
    if (!f) return;
    const problem = uploadProblem(f);
    if (problem) {
      setFile(null);
      return setError(problem);
    }
    setFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim());
    if (uploadKind(f) === "docx") {
      setReading(true);
      try {
        const text = await extractDocxText(f);
        if (text) setBody(text);
        else setError("We couldn't read any text from that Word file. Please save it as a PDF and upload that instead.");
      } catch {
        setError("We couldn't read that Word file. Please save it as a PDF and upload that instead.");
      }
      setReading(false);
    }
  };

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!title.trim()) return setError("Give the document a title.");
    if (!body.trim() && !fileUrl.trim() && !file) return setError("Upload a file, add the text of the document, or add a link to it.");
    if (file && fileUrl.trim()) return setError("Use either an uploaded file or a link, not both.");
    if (kind === "docx" && !body.trim()) return setError("We couldn't read any text from that Word file. Please save it as a PDF and upload that instead.");
    if (roles.length === 0) return setError("Choose who has to sign it.");
    if (fileUrl.trim() && !/^https:\/\//i.test(fileUrl.trim())) return setError("The link must start with https://");
    setBusy(true);
    setError(null);

    // The original always goes in the private bucket. A PDF is the file people
    // sign; for a Word file the original is kept and its text (above) is what
    // people read, and what the signed PDF is made from.
    let uploadedPath: string | null = null;
    if (file && kind) {
      uploadedPath = `${crypto.randomUUID()}/${storageObjectName(file, "doc")}`;
      const { error: upErr } = await supabase.storage.from("signable-documents").upload(uploadedPath, file, { contentType: kind === "pdf" ? "application/pdf" : DOCX_MIME, upsert: false });
      if (upErr) {
        setBusy(false);
        return setError("Couldn't upload the file. Only a Headteacher or Admin can.");
      }
    }
    const { error: err } = await supabase.from("signable_documents").insert({
      sanity_document_id: `portal:${crypto.randomUUID()}`,
      source: "portal",
      title: title.trim(),
      body: body.trim() || null,
      file_url: fileUrl.trim() || null,
      file_path: kind === "pdf" ? uploadedPath : null,
      file_name: kind === "pdf" && file ? file.name : null,
      original_path: kind === "docx" ? uploadedPath : null,
      original_name: kind === "docx" && file ? file.name : null,
      target_roles: roles,
      requires_signature: true,
      current_asset_id: "pending",
    });
    if (err) {
      if (uploadedPath) await supabase.storage.from("signable-documents").remove([uploadedPath]);
      setBusy(false);
      return setError("Couldn't create it. Only a Headteacher or Admin can.");
    }
    setBusy(false);
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="New document to sign">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gold-light px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">New document to sign</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-xl leading-none text-ink/55 hover:bg-cream">
            ×
          </button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <label className="block text-sm">
            <span className="font-medium text-ink">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Acceptable Use Agreement 2026/27" className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2 text-sm" />
          </label>
          <div className="block text-sm">
            <span className="font-medium text-ink">Upload a file</span>
            <span className="block text-xs text-ink/65">
              A PDF (people sign that exact file) or a Word (.docx) file. For Word, the text is read out below so people can read it before signing, and a PDF is made when they sign. Or type the text, or add a link, instead.
            </span>
            <input
              type="file"
              accept={UPLOAD_ACCEPT}
              aria-label="Upload a PDF or Word file"
              onChange={(e) => {
                void choose(e.target.files?.[0]);
                e.target.value = "";
              }}
              className="mt-1 block w-full text-sm text-ink/80 file:mr-3 file:rounded-lg file:border file:border-gold-light file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink/80 hover:file:bg-cream"
            />
            {file && (
              <p className="mt-1 text-xs text-ink/70">
                {reading ? "Reading the Word file…" : `Chosen: ${file.name} (${kind === "pdf" ? "PDF" : "Word"}).`}{" "}
                <button type="button" onClick={() => setFile(null)} className="font-medium text-red-700 underline">Remove</button>
              </p>
            )}
          </div>
          <label className="block text-sm">
            <span className="font-medium text-ink">Text</span>
            <span className="block text-xs text-ink/65">What people read before signing. Optional if you upload a PDF or add a link instead.</span>
            <textarea rows={7} value={body} onChange={(e) => setBody(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Link to a PDF or page (optional)</span>
            <input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://…" className="mt-1 w-full rounded-lg border border-gold-light px-3 py-2 text-sm" />
          </label>
          <div className="text-sm">
            <p className="mb-2 font-medium text-ink">Who has to sign</p>
            <RolePicker value={roles} onChange={setRoles} />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gold-light px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gold-light px-4 py-2 text-sm font-medium text-ink/75 hover:bg-cream">
            Cancel
          </button>
          <button type="button" disabled={busy || reading} onClick={save} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
            {busy ? "Creating…" : "Create and ask for signatures"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DocumentsContent() {
  const canExport = useLearnPermission("can_export_data");
  const [tab, setTab] = useState<"policies" | "signing" | "outstanding">("policies");
  const [policies, setPolicies] = useState<PolicyRow[] | null>(null);
  const [docs, setDocs] = useState<SignableDoc[] | null>(null);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [outstanding, setOutstanding] = useState<Outstanding[] | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [docFilter, setDocFilter] = useState("all");
  const [note, setNote] = useState<string | null>(null);
  const [record, setRecord] = useState<{ documentId: string; title: string; targets: SignTarget[] } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set()); // `${documentId}:${userId}`
  const [historyKey, setHistoryKey] = useState(0);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    getPolicyLinks().then((rows) =>
      setPolicies(
        rows.map((r) => ({ id: r._id, number: r.number, title: r.title, category: r.category, fileUrl: r.fileUrl, lastReviewed: r.lastReviewed, nextReview: r.nextReview })),
      ),
    );
    if (!supabase) return;
    const [d, p, o, rq] = await Promise.all([
      supabase.from("signable_documents").select("id, sanity_document_id, title, requires_signature, target_roles, source, file_url, body, file_path, original_path"),
      supabase.from("document_signature_progress").select("document_id, required_count, signed_count"),
      supabase.from("outstanding_signatures").select("user_id, full_name, email, title, document_id"),
      supabase.from("signature_requests").select("document_id, user_id, requested_at, email_sent").order("requested_at", { ascending: false }).limit(1000),
    ]);
    setRequests((rq.data as RequestRow[]) || []);
    setDocs((d.data as SignableDoc[]) || []);
    const map: Record<string, Progress> = {};
    for (const r of (p.data as Progress[]) || []) map[r.document_id] = r;
    setProgress(map);
    setOutstanding((o.data as Outstanding[]) || []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const docForPolicy = (id: string) => (docs || []).find((d) => d.sanity_document_id === `policy:${id}`);
  const signing = (docs || []).filter((d) => d.requires_signature);

  const savePolicy = async (p: PolicyRow, on: boolean, audiences: Audience[]) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setNote(null);
    const roles = audienceToRoles(audiences);
    if (on && roles.length === 0) return setNote("Choose who has to sign (Staff, Parents or Students).");
    setBusyId(p.id);
    const existing = docForPolicy(p.id);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(p.id);
    const fields = {
      title: `${p.number ? `${p.number}. ` : ""}${p.title}`,
      file_url: p.fileUrl,
      target_roles: roles.length ? roles : existing?.target_roles || audienceToRoles(["parents"]),
      requires_signature: on,
      source: "policy" as const,
    };
    const { error } = existing
      ? await supabase.from("signable_documents").update(fields).eq("id", existing.id)
      : await supabase.from("signable_documents").insert({ ...fields, sanity_document_id: `policy:${p.id}`, policy_link_id: isUuid ? p.id : null, current_asset_id: "pending" });
    setBusyId(null);
    if (error) return setNote("Couldn't save. Only a Headteacher or Admin can change this.");
    await load();
  };

  const remind = async (documentId: string, userIds?: string[]) => {
    setNote(null);
    setBusyId(documentId + (userIds?.join(",") || ""));
    const r = await requestSignatures(documentId, { userIds, kind: "reminder" });
    setBusyId(null);
    setNote(r.message);
    await load();
  };

  const lastAsked = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of requests) {
      const k = `${r.document_id}:${r.user_id}`;
      if (!m.has(k) && r.email_sent) m.set(k, r.requested_at);
    }
    return m;
  }, [requests]);

  const stopSigning = async (d: SignableDoc) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.from("signable_documents").update({ requires_signature: false }).eq("id", d.id);
    await load();
  };

  const exportCsv = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase.from("document_signatures").select("typed_full_name, signed_at, signable_documents(title)");
    const rows = (data as unknown as { typed_full_name: string; signed_at: string; signable_documents: { title: string } | null }[]) || [];
    const csv = ["document,signer_name,signed_at", ...rows.map((r) => `"${r.signable_documents?.title || ""}","${r.typed_full_name}","${r.signed_at}"`)].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "document-signatures.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // One entry per person, each document listed once (same person + same
  // policy never repeats), people with the most outstanding first.
  const outstandingShown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const people = new Map<string, { user_id: string; name: string; email: string | null; docs: Map<string, string> }>();
    for (const o of outstanding || []) {
      if (docFilter !== "all" && o.title !== docFilter) continue;
      if (needle && !(o.full_name || "").toLowerCase().includes(needle) && !(o.email || "").toLowerCase().includes(needle)) continue;
      const person = people.get(o.user_id) || { user_id: o.user_id, name: o.full_name || o.email || "Unknown", email: o.email, docs: new Map<string, string>() };
      if (!person.docs.has(o.title)) person.docs.set(o.title, o.document_id);
      people.set(o.user_id, person);
    }
    return [...people.values()].sort((a, b) => b.docs.size - a.docs.size || a.name.localeCompare(b.name));
  }, [outstanding, q, docFilter]);

  // Picked rows grouped by document, for bulk recording (one document at a time).
  const pickedByDoc = useMemo(() => {
    const m = new Map<string, { title: string; targets: SignTarget[] }>();
    for (const person of outstandingShown) {
      for (const [title, id] of person.docs) {
        if (!picked.has(`${id}:${person.user_id}`)) continue;
        const g = m.get(id) || { title, targets: [] };
        g.targets.push({ user_id: person.user_id, name: person.name });
        m.set(id, g);
      }
    }
    return m;
  }, [outstandingShown, picked]);

  const tabBtn = (id: typeof tab, label: string, count?: number) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      aria-pressed={tab === id}
      className={`rounded-lg px-3.5 py-2 text-sm font-medium ${tab === id ? "bg-teal-700 text-white" : "text-ink/70 hover:bg-cream"}`}
    >
      {label}
      {count !== undefined && <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${tab === id ? "bg-white/20" : "bg-cream"}`}>{count}</span>}
    </button>
  );

  return (
    <>
      <PageHeader
        title="Documents & signatures"
        subtitle="Every policy on the website, who has to sign what, and who still hasn't."
        actions={
          <>
            {canExport && (
              <button type="button" onClick={exportCsv} className="rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/80 hover:bg-cream">
                Export signatures (CSV)
              </button>
            )}
            <button type="button" onClick={() => setCreating(true)} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900">
              + New document to sign
            </button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-gold-light bg-white p-1">
        {tabBtn("policies", "Website policies", policies?.length)}
        {tabBtn("signing", "Needs a signature", signing.length)}
        {tabBtn("outstanding", "Outstanding", outstanding ? new Set(outstanding.map((o) => o.user_id)).size : undefined)}
      </div>

      {note && <p className={`mb-4 rounded-lg px-4 py-2 text-sm ${note.startsWith("Recorded") ? "bg-green-50 text-green-900" : "bg-red-50 text-red-800"}`}>{note}</p>}

      {tab === "policies" && (
        <div className="overflow-hidden rounded-2xl border border-gold-light bg-white">
          {policies === null ? (
            <div className="h-40 animate-pulse" />
          ) : policies.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink/60">No policies are published on the website yet.</p>
          ) : (
            <ul className="divide-y divide-gold-light/70">
              {policies.map((p) => {
                const d = docForPolicy(p.id);
                const on = !!d?.requires_signature;
                const audiences = rolesToAudience(d?.target_roles || []);
                const prog = d ? progress[d.id] : undefined;
                const busy = busyId === p.id;
                return (
                  <li key={p.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cream text-sm font-semibold text-ink/70">{p.number}</span>
                      <div className="min-w-0 flex-1 basis-56">
                        <a href={absoluteFileUrl(p.fileUrl)} target="_blank" rel="noreferrer" className="block truncate text-sm font-semibold text-ink hover:text-teal-700 hover:underline">
                          {p.title}
                        </a>
                        <p className="text-xs text-ink/65">
                          {p.category === "required" ? "Required policy" : "Published"}
                          {p.nextReview ? ` · review due ${new Date(p.nextReview).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}` : ""}
                        </p>
                      </div>
                      {on && prog && <Bar signed={prog.signed_count} required={prog.required_count} />}
                      <label className="flex items-center gap-2 text-sm font-medium text-ink/80">
                        <Switch
                          on={on}
                          disabled={busy}
                          label={`Requires signature: ${p.title}`}
                          onChange={(v) => savePolicy(p, v, audiences.length ? audiences : ["parents"])}
                        />
                        Requires signature
                      </label>
                    </div>
                    {on ? (
                      <div className="mt-3 flex flex-wrap items-center gap-3 pl-12">
                        <span className="text-xs text-ink/55">Who must sign:</span>
                        <AudiencePicker
                          value={audiences}
                          disabled={busy}
                          onChange={(v) => (v.length ? savePolicy(p, true, v) : setNote("At least one group must sign, or switch the signature off."))}
                        />
                      </div>
                    ) : (
                      <p className="mt-1 pl-12 text-xs text-ink/65">View only. Nobody is asked to sign this.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === "signing" && (
        <div className="overflow-hidden rounded-2xl border border-gold-light bg-white">
          {docs === null ? (
            <div className="h-40 animate-pulse" />
          ) : signing.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-base font-semibold text-ink">Nothing needs a signature yet</p>
              <p className="mt-1 text-sm text-ink/60">Switch on &ldquo;Requires signature&rdquo; for a website policy, or create your own document.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gold-light/70">
              {signing.map((d) => {
                const prog = progress[d.id];
                const waiting = prog ? prog.required_count - prog.signed_count : 0;
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="truncate text-sm font-semibold text-ink">{d.title}</p>
                      <p className="text-xs text-ink/65">
                        {audienceText(d.target_roles)} · {d.source === "portal" ? "Created here" : d.source === "policy" ? "Website policy" : "From Sanity"}
                      </p>
                    </div>
                    {prog && <Bar signed={prog.signed_count} required={prog.required_count} />}
                    {waiting > 0 && (
                      <button
                        type="button"
                        disabled={busyId === d.id}
                        onClick={() => remind(d.id)}
                        className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream disabled:opacity-50"
                      >
                        {busyId === d.id ? "Sending…" : `Email ${waiting} to sign`}
                      </button>
                    )}
                    {d.file_url && (
                      <a href={absoluteFileUrl(d.file_url)} target="_blank" rel="noreferrer" className="text-sm font-medium text-teal-700 hover:underline">
                        Open
                      </a>
                    )}
                    {!d.file_url && (d.file_path || d.original_path) && (
                      <button
                        type="button"
                        onClick={async () => {
                          const supabase = getSupabaseClient();
                          const path = d.file_path || d.original_path;
                          if (!supabase || !path) return;
                          if (!(await openSignableFile(supabase, path))) setNote("Couldn't open that file just now.");
                        }}
                        className="text-sm font-medium text-teal-700 hover:underline"
                      >
                        {d.file_path ? "Open" : "Open Word file"}
                      </button>
                    )}
                    {d.source !== "sanity" && (
                      <button type="button" onClick={() => stopSigning(d)} className="text-sm font-medium text-ink/55 hover:text-red-700">
                        Stop
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === "outstanding" && (
        <div className="rounded-2xl border border-gold-light bg-white">
          <div className="flex flex-wrap gap-3 border-b border-gold-light px-5 py-3">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email…" className="min-w-[200px] flex-1 rounded-lg border border-gold-light px-3 py-2 text-sm" />
            <select value={docFilter} onChange={(e) => setDocFilter(e.target.value)} className="rounded-lg border border-gold-light px-3 py-2 text-sm" aria-label="Document">
              <option value="all">All documents</option>
              {[...new Set((outstanding || []).map((o) => o.title))].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          {picked.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-gold-light bg-cream px-5 py-2 text-sm">
              <span className="text-ink/70">{picked.size} selected.</span>
              {[...pickedByDoc.entries()].map(([id, g]) => (
                <button key={id} type="button" onClick={() => setRecord({ documentId: id, title: g.title, targets: g.targets })} className="rounded-lg bg-gold-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gold-900">
                  Record {g.targets.length} by hand: {g.title}
                </button>
              ))}
              <button type="button" onClick={() => setPicked(new Set())} className="text-xs text-ink/60 underline">
                Clear
              </button>
              {pickedByDoc.size > 1 && <span className="text-xs text-ink/65">Each document is recorded separately.</span>}
            </div>
          )}
          {outstanding === null ? (
            <div className="h-32 animate-pulse" />
          ) : outstandingShown.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink/60">{outstanding.length === 0 ? "Everyone is up to date." : "No one matches."}</p>
          ) : (
            <ul className="divide-y divide-gold-light/70">
              {outstandingShown.map((person) => {
                const docList = [...person.docs.entries()];
                const key = `person-${person.user_id}`;
                return (
                  <li key={person.user_id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="font-medium text-ink">{person.name}</span>
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{docList.length} to sign</span>
                        {person.email && person.name !== person.email && <span className="ml-2 text-ink/65">{person.email}</span>}
                      </span>
                      <button
                        type="button"
                        disabled={busyId === key}
                        onClick={async () => {
                          setBusyId(key);
                          setNote(null);
                          let sent = 0;
                          for (const [, id] of docList) {
                            const r = await requestSignatures(id, { userIds: [person.user_id], kind: "reminder" });
                            sent += r.sent;
                          }
                          setBusyId(null);
                          setNote(sent > 0 ? `Reminder sent to ${person.name}.` : `No email sent to ${person.name} (they were reminded recently, or email isn't available).`);
                          await load();
                        }}
                        className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-medium text-ink/80 hover:bg-cream disabled:opacity-50"
                      >
                        {busyId === key ? "Sending…" : "Remind"}
                      </button>
                    </div>
                    <ul className="mt-1 space-y-0.5 text-ink/65">
                      {docList.map(([title, id]) => {
                        const asked = lastAsked.get(`${id}:${person.user_id}`);
                        return (
                          <li key={id} className="flex flex-wrap items-center gap-x-2">
                            <input
                              type="checkbox"
                              aria-label={`Select ${person.name} for ${title}`}
                              checked={picked.has(`${id}:${person.user_id}`)}
                              onChange={(e) =>
                                setPicked((prev) => {
                                  const n = new Set(prev);
                                  if (e.target.checked) n.add(`${id}:${person.user_id}`);
                                  else n.delete(`${id}:${person.user_id}`);
                                  return n;
                                })
                              }
                            />
                            <span>{title}</span>
                            {asked && <span className="text-xs text-ink/65">asked {new Date(asked).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
                            <button type="button" onClick={() => setRecord({ documentId: id, title, targets: [{ user_id: person.user_id, name: person.name }] })} className="text-xs font-medium text-teal-700 underline">
                              Record signature by hand
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t border-gold-light px-5 py-3 text-xs text-ink/65">A reminder email also goes out automatically a week after a document becomes due. If an email can&apos;t be delivered, people can still sign in the portal.</p>
        </div>
      )}

      {tab === "outstanding" && <SignatureHistory refreshKey={historyKey} />}

      {record && (
        <RecordSignatureModal
          documentId={record.documentId}
          documentTitle={record.title}
          targets={record.targets}
          onClose={() => setRecord(null)}
          onDone={(msg) => {
            setRecord(null);
            setPicked(new Set());
            setNote(msg);
            setHistoryKey((k) => k + 1);
            load();
          }}
        />
      )}

      {creating && (
        <NewDocument
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            setTab("signing");
            load();
          }}
        />
      )}
    </>
  );
}

export default function AdminDocumentsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <DocumentsContent />
      </LearnGate>
    </section>
  );
}
