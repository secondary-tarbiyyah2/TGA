"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { getPolicyLinks } from "@/lib/content";
import { learnRoleLabel, useLearnPermission, type LearnRole } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";

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
};
type Progress = { document_id: string; required_count: number; signed_count: number };
type Outstanding = { user_id: string; full_name: string | null; email: string | null; title: string };

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
  const [roles, setRoles] = useState<string[]>(DEFAULT_ROLES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!title.trim()) return setError("Give the document a title.");
    if (!body.trim() && !fileUrl.trim()) return setError("Add the text of the document, or a link to it.");
    if (roles.length === 0) return setError("Choose who has to sign it.");
    if (fileUrl.trim() && !/^https:\/\//i.test(fileUrl.trim())) return setError("The link must start with https://");
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("signable_documents").insert({
      sanity_document_id: `portal:${crypto.randomUUID()}`,
      source: "portal",
      title: title.trim(),
      body: body.trim() || null,
      file_url: fileUrl.trim() || null,
      target_roles: roles,
      requires_signature: true,
      current_asset_id: "pending",
    });
    setBusy(false);
    if (err) return setError("Couldn't create it. Only a Headteacher or Admin can.");
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
          <label className="block text-sm">
            <span className="font-medium text-ink">Text</span>
            <span className="block text-xs text-ink/50">What people read before signing. Optional if you add a link instead.</span>
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
          <button type="button" disabled={busy} onClick={save} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
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
  const [editing, setEditing] = useState<string | null>(null); // policy id being configured
  const [editRoles, setEditRoles] = useState<string[]>(DEFAULT_ROLES);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [docFilter, setDocFilter] = useState("all");
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    getPolicyLinks().then((rows) =>
      setPolicies(
        rows.map((r) => ({ id: r._id, number: r.number, title: r.title, category: r.category, fileUrl: r.fileUrl, lastReviewed: r.lastReviewed, nextReview: r.nextReview })),
      ),
    );
    if (!supabase) return;
    const [d, p, o] = await Promise.all([
      supabase.from("signable_documents").select("id, sanity_document_id, title, requires_signature, target_roles, source, file_url, body"),
      supabase.from("document_signature_progress").select("document_id, required_count, signed_count"),
      supabase.from("outstanding_signatures").select("user_id, full_name, email, title"),
    ]);
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

  const savePolicy = async (p: PolicyRow, on: boolean) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setNote(null);
    if (on && editRoles.length === 0) return setNote("Choose who has to sign.");
    const existing = docForPolicy(p.id);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(p.id);
    const fields = { title: `${p.number ? `${p.number}. ` : ""}${p.title}`, file_url: p.fileUrl, target_roles: editRoles, requires_signature: on, source: "policy" as const };
    const { error } = existing
      ? await supabase.from("signable_documents").update(fields).eq("id", existing.id)
      : await supabase.from("signable_documents").insert({ ...fields, sanity_document_id: `policy:${p.id}`, policy_link_id: isUuid ? p.id : null, current_asset_id: "pending" });
    if (error) return setNote("Couldn't save. Only a Headteacher or Admin can change this.");
    setEditing(null);
    await load();
  };

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

  const outstandingShown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (outstanding || []).filter(
      (o) => (docFilter === "all" || o.title === docFilter) && (!needle || (o.full_name || "").toLowerCase().includes(needle) || (o.email || "").toLowerCase().includes(needle)),
    );
  }, [outstanding, q, docFilter]);

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
        {tabBtn("outstanding", "Outstanding", outstanding?.length)}
      </div>

      {note && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">{note}</p>}

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
                const prog = d ? progress[d.id] : undefined;
                return (
                  <li key={p.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cream text-sm font-semibold text-ink/70">{p.number}</span>
                      <div className="min-w-0 flex-1">
                        <a href={p.fileUrl} target="_blank" rel="noreferrer" className="block truncate text-sm font-semibold text-ink hover:text-teal-700 hover:underline">
                          {p.title}
                        </a>
                        <p className="text-xs text-ink/50">
                          {p.category === "required" ? "Required policy" : "Published"}
                          {p.nextReview ? ` · review due ${new Date(p.nextReview).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}` : ""}
                        </p>
                      </div>
                      {on && prog && <Bar signed={prog.signed_count} required={prog.required_count} />}
                      {on ? (
                        <span className="rounded-full bg-teal-100 px-2.5 py-1 text-xs font-semibold text-teal-900">Signed by: {d!.target_roles.map((r) => learnRoleLabel(r as LearnRole)).join(", ")}</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(editing === p.id ? null : p.id);
                          setEditRoles(d?.target_roles?.length ? d.target_roles : DEFAULT_ROLES);
                        }}
                        className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream"
                      >
                        {on ? "Change" : "Ask for signatures"}
                      </button>
                    </div>
                    {editing === p.id && (
                      <div className="mt-4 rounded-xl bg-cream/60 p-4">
                        <p className="mb-2 text-sm font-medium text-ink">Who has to sign this policy?</p>
                        <RolePicker value={editRoles} onChange={setEditRoles} />
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button type="button" onClick={() => savePolicy(p, true)} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900">
                            {on ? "Save" : "Ask them to sign"}
                          </button>
                          {on && (
                            <button type="button" onClick={() => savePolicy(p, false)} className="rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/75 hover:bg-cream">
                              Stop asking for signatures
                            </button>
                          )}
                        </div>
                      </div>
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
              <p className="mt-1 text-sm text-ink/60">Pick a website policy, or create your own document.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gold-light/70">
              {signing.map((d) => {
                const prog = progress[d.id];
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{d.title}</p>
                      <p className="text-xs text-ink/50">
                        {d.target_roles.map((r) => learnRoleLabel(r as LearnRole)).join(", ")} · {d.source === "portal" ? "Created here" : d.source === "policy" ? "Website policy" : "From Sanity"}
                      </p>
                    </div>
                    {prog && <Bar signed={prog.signed_count} required={prog.required_count} />}
                    {d.file_url && (
                      <a href={d.file_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-teal-700 hover:underline">
                        Open
                      </a>
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
          {outstanding === null ? (
            <div className="h-32 animate-pulse" />
          ) : outstandingShown.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink/60">{outstanding.length === 0 ? "Everyone is up to date. 🎉" : "No one matches."}</p>
          ) : (
            <ul className="divide-y divide-gold-light/70">
              {outstandingShown.map((o, i) => (
                <li key={`${o.user_id}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span>
                    <span className="font-medium text-ink">{o.full_name || o.email}</span>
                    {o.full_name && o.email && <span className="ml-2 text-ink/50">{o.email}</span>}
                  </span>
                  <span className="text-ink/65">{o.title}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-gold-light px-5 py-3 text-xs text-ink/50">A reminder email goes out automatically a week after a document becomes due.</p>
        </div>
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
