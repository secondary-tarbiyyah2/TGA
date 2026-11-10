"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { ApplicationDrawer, type MoveOptions, type StaffOption } from "@/components/learn/admissions/ApplicationDrawer";
import { autoToast, fetchAdmissionsData, sendTemplateEmail } from "@/components/learn/admissions/admissionsData";
import { createAccountsFor, type AccountsResult } from "@/components/learn/admissions/accountsApi";
import type { IssuedCredentials } from "@/components/learn/people/studentAccounts";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnPermission, useLearnSession } from "@/lib/learn/session";
import { MAIN_SITE_ORIGIN } from "@/lib/learn/origin";
import {
  APPLICATION_COLUMNS,
  PIPELINE_STATUSES,
  SIDELINE_STATUSES,
  STATUS_LABELS,
  YEAR_GROUP_OPTIONS,
  acceptanceBlockers,
  ageFromDob,
  processPips,
  type ApplicationPatch,
  type ApplicationRow,
  type ApplicationStatus,
} from "@/components/admissions/applicationShared";
import { useNow } from "@/lib/learn/useNow";
import { ukToday } from "@/lib/learn/ukTime";
import { saveCsv } from "@/lib/learn/csv";
import { btn, ui } from "@/components/learn/ui";
import { Select } from "@/components/learn/Select";

import { askConfirm } from "@/components/learn/kit";
const FORM_URL = `${MAIN_SITE_ORIGIN}/admissions/apply`;

type Load = "loading" | "error" | "ready";

function fmtShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

const PIP_CLS = { none: "bg-ink/15", scheduled: "bg-gold-500", done: "bg-teal-500" } as const;
const PIP_WORD = { none: "not started", scheduled: "scheduled", done: "done" } as const;

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Stop spreadsheet apps treating a typed value as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function ApplicationCard({
  app,
  familySize,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  app: ApplicationRow;
  familySize: number;
  onOpen: (id: string) => void;
  onMove: (id: string, status: ApplicationStatus, opts?: MoveOptions) => Promise<boolean>;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onDragEnd: () => void;
}) {
  const idx = PIPELINE_STATUSES.indexOf(app.status);
  const prev = idx > 0 ? PIPELINE_STATUSES[idx - 1] : null;
  const next = idx >= 0 && idx < PIPELINE_STATUSES.length - 1 ? PIPELINE_STATUSES[idx + 1] : null;
  const name = `${app.child_first_name} ${app.child_last_name}`;
  const pips = processPips(app);
  const nowMs = useNow();
  const upcoming: { label: string; at: string }[] = [];
  if (app.assessment_at && new Date(app.assessment_at).getTime() > nowMs) upcoming.push({ label: "Assessment", at: app.assessment_at });
  if (app.interview_at && new Date(app.interview_at).getTime() > nowMs) upcoming.push({ label: "Conversation", at: app.interview_at });
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, app.id)}
      onDragEnd={onDragEnd}
      className="cursor-grab rounded-xl border border-gold-light/60 bg-white p-3 shadow-sm active:cursor-grabbing"
    >
      <button type="button" onClick={() => onOpen(app.id)} className="block w-full text-left">
        <span className="flex items-center gap-2">
          {app.status === "new" && <span className="h-2 w-2 shrink-0 rounded-full bg-teal-500" aria-label="New" role="img" />}
          <span className="text-sm font-semibold text-ink">{name}</span>
        </span>
        <span className="mt-0.5 block text-xs text-ink/70">
          {app.year_group_applying} · age {ageFromDob(app.child_dob) || "?"}
        </span>
        <span className="block text-xs text-ink/65">{app.parent_name}</span>
        {familySize > 1 && <span className="mt-0.5 inline-block rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-900">{(app.sibling_index ?? 1) > 1 ? "Sibling" : `Family of ${familySize}`}</span>}
        <span className="block text-xs text-ink/65">Received {fmtShort(app.created_at)}</span>
        <span className="mt-1.5 flex items-center gap-1" role="img" aria-label={pips.map((p) => `${p.label} ${PIP_WORD[p.state]}`).join(", ")}>
          {pips.map((p) => (
            <span key={p.label} title={`${p.label}: ${PIP_WORD[p.state]}`} className={`h-1.5 w-5 rounded-full ${PIP_CLS[p.state]}`} />
          ))}
        </span>
        {upcoming.map((u) => (
          <span key={u.label} className="block text-xs text-teal-700">{u.label}: {fmtWhen(u.at)}</span>
        ))}
      </button>
      {(prev || next) && (
        <div className="mt-2 flex justify-between gap-2">
          {prev ? (
            <button type="button" onClick={() => onMove(app.id, prev)} aria-label={`Move ${name} back to ${STATUS_LABELS[prev]}`} className={btn("secondary", "sm")}>
              ← {STATUS_LABELS[prev]}
            </button>
          ) : (
            <span />
          )}
          {next && (
            <button type="button" onClick={() => onMove(app.id, next)} aria-label={`Move ${name} on to ${STATUS_LABELS[next]}`} className={btn("secondary", "sm")}>
              {STATUS_LABELS[next]} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Column({
  status,
  apps,
  dragOver,
  setDragOver,
  onDropOn,
  cardProps,
  familySizes,
}: {
  status: ApplicationStatus;
  apps: ApplicationRow[];
  dragOver: ApplicationStatus | null;
  setDragOver: (s: ApplicationStatus | null) => void;
  onDropOn: (e: DragEvent<HTMLDivElement>, s: ApplicationStatus) => void;
  cardProps: Omit<Parameters<typeof ApplicationCard>[0], "app" | "familySize">;
  familySizes: Map<string, number>;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(status);
      }}
      onDragLeave={() => setDragOver(null)}
      onDrop={(e) => onDropOn(e, status)}
      className={`min-h-[8rem] rounded-2xl border p-3 transition-colors ${dragOver === status ? "border-teal-500 bg-teal-100" : "border-gold-light/50 bg-cream/50"}`}
    >
      <h3 className="mb-2 flex items-center justify-between text-sm font-semibold text-ink">
        {STATUS_LABELS[status]}
        <span className="rounded-full bg-white px-2 py-0.5 text-xs tabular-nums text-ink/70" aria-label={`${apps.length} applications`}>{apps.length}</span>
      </h3>
      <div className="space-y-2">
        {apps.length === 0 && <p className="py-4 text-center text-xs text-ink/65">Nothing here</p>}
        {apps.map((a) => (
          <ApplicationCard key={a.id} app={a} familySize={a.family_id ? familySizes.get(a.family_id) ?? 1 : 1} {...cardProps} />
        ))}
      </div>
    </div>
  );
}

export function ApplicationsTab() {
  const canExport = useLearnPermission("can_export_data");
  const { roles } = useLearnSession();
  const isHeadteacher = roles.some((r) => r.role === "head_teacher");
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [load, setLoad] = useState<Load>("loading");
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [accepting, setAccepting] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<ApplicationStatus | null>(null);
  const [showSideline, setShowSideline] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  // Temporary pupil passwords are shown once, here, and never stored in the browser.
  const [credentials, setCredentials] = useState<IssuedCredentials[]>([]);

  const fetchAll = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoad("error");
      return;
    }
    setLoad("loading");
    const { data, error } = await supabase.from("admissions_applications").select(APPLICATION_COLUMNS).order("created_at", { ascending: false });
    if (error) {
      setLoad("error");
      return;
    }
    setRows((data as unknown as ApplicationRow[]) || []);
    setLoad("ready");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void fetchAll();
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("site_settings")
      .select("accepting_applications")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as { accepting_applications: boolean | null } | null;
        setAccepting(row ? row.accepting_applications !== false : true);
      });
    supabase
      .from("staff_members")
      .select("profile_id, display_name")
      .order("display_name", { ascending: true })
      .then(({ data }) => setStaff((data as StaffOption[]) || []));
  }, [fetchAll]);

  async function toggleAccepting(next: boolean) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!next && !(await askConfirm("Close the application form? Families will see an \u201capplications are closed\u201d message until you open it again."))) return;
    setToggling(true);
    setActionError(null);
    const { error } = await supabase.from("site_settings").update({ accepting_applications: next }).eq("id", true);
    setToggling(false);
    if (error) {
      setActionError("Couldn't change this setting. Please try again.");
      return;
    }
    setAccepting(next);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(FORM_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError("Couldn't copy automatically. Select the link and copy it by hand.");
    }
  }

  const runAccounts = useCallback(
    async (app: ApplicationRow, opts?: { resend?: boolean; classIds?: string[]; createStudentLogin?: boolean }): Promise<AccountsResult> => {
      const r = await createAccountsFor(app, opts);
      if (r.ok) {
        const now = new Date().toISOString();
        setRows((list) =>
          list.map((x) =>
            x.id === app.id
              ? { ...x, parent_profile_id: r.parentProfileId ?? x.parent_profile_id, child_id: r.childId ?? x.child_id, student_profile_id: r.studentProfileId ?? x.student_profile_id, accounts_created_at: x.accounts_created_at ?? now }
              : x,
          ),
        );
        if (r.credentials) setCredentials((c) => [...c, r.credentials as IssuedCredentials]);
      }
      setNotice({ ok: r.ok && r.emailSent, text: r.notes.join(" ") || (r.ok ? "Accounts are ready." : "Accounts could not be created.") });
      return r;
    },
    [],
  );

  const moveTo = useCallback(
    async (id: string, status: ApplicationStatus, opts?: MoveOptions): Promise<boolean> => {
      const supabase = getSupabaseClient();
      const current = rows.find((r) => r.id === id);
      if (!supabase || !current) return false;
      if (current.status === status) return true;
      const previous = current.status;
      if (status === "declined" || status === "withdrawn") {
        const nm = `${current.child_first_name} ${current.child_last_name}`.trim();
        if (!(await askConfirm(`Mark ${nm}'s application as ${STATUS_LABELS[status].toLowerCase()}? The family is not notified automatically, and you can move it back later from the ${STATUS_LABELS[status]} column.`))) return false;
      }
      if (status === "accepted") {
        // Fees policy: the first fee payment is the condition of acceptance (no registration fee).
        const blockers = acceptanceBlockers(current);
        if (blockers.length > 0) {
          const list = blockers.join(" and ");
          if (!isHeadteacher) {
            window.alert(`Can't accept yet: the ${list} ${blockers.length > 1 ? "have" : "has"} not been marked as received. Mark ${blockers.length > 1 ? "them" : "it"} received in the Process tab, or ask the Headteacher to override.`);
            return false;
          }
          if (!(await askConfirm(`The ${list} ${blockers.length > 1 ? "are" : "is"} not marked as received. As Headteacher you can override. Move to Accepted anyway?`))) return false;
        }
        // Proofs of payment awaiting staff review (0061): they must be verified or rejected first.
        const { count: pendingProofs } = await supabase
          .from("admissions_payment_proofs")
          .select("id", { count: "exact", head: true })
          .eq("application_id", id)
          .eq("status", "pending");
        if ((pendingProofs ?? 0) > 0) {
          if (!isHeadteacher) {
            window.alert(`Can't accept yet: ${pendingProofs} proof${pendingProofs === 1 ? "" : "s"} of payment ${pendingProofs === 1 ? "is" : "are"} waiting to be verified. Review them in the Payments tab, or ask the Headteacher to override.`);
            return false;
          }
          if (!(await askConfirm(`${pendingProofs} proof${pendingProofs === 1 ? "" : "s"} of payment ${pendingProofs === 1 ? "is" : "are"} still unverified. As Headteacher you can override. Move to Accepted anyway?`))) return false;
        }
        if (!current.id_documents_received && !(await askConfirm("ID documents and proof of address are not marked as received yet. Move to Accepted anyway?"))) return false;
      }
      setActionError(null);
      setNotice(null);
      setRows((list) => list.map((r) => (r.id === id ? { ...r, status } : r)));
      const { error } = await supabase.from("admissions_applications").update({ status }).eq("id", id);
      if (error) {
        setRows((list) => list.map((r) => (r.id === id ? { ...r, status: previous } : r)));
        setActionError("Couldn't move that application. Please try again.");
        return false;
      }
      if (!opts?.skipAutoEmail) {
        // Automatic emails never block or undo the move: a failure is reported, nothing more.
        void (async () => {
          const sends: { key: "received" | "offer"; label: string }[] = [];
          if (previous === "new" && status !== "new" && status !== "declined" && status !== "withdrawn") sends.push({ key: "received", label: "Acknowledgement" });
          if (status === "offered" && previous !== "offered") sends.push({ key: "offer", label: "Offer" });
          if (sends.length === 0) return;
          try {
            const data = await fetchAdmissionsData(id);
            for (const send of sends) {
              if (send.key === "offer" && data.details?.offer_emailed_at) continue; // already offered by email
              const out = await sendTemplateEmail({ app: { ...current, status }, key: send.key, auto: true, data });
              const text = autoToast(send.label, current.parent_email, out);
              if (text) setNotice({ ok: out.emailSent, text });
              if (send.key === "offer" && out.emailSent && !current.offer_made_at) {
                const day = ukToday();
                const { error: e2 } = await supabase.from("admissions_applications").update({ offer_made_at: day }).eq("id", id);
                if (!e2) setRows((list) => list.map((r) => (r.id === id ? { ...r, offer_made_at: day } : r)));
              }
            }
          } catch {
            setNotice({ ok: false, text: "The automatic email could not be sent. The move itself went through." });
          }
        })();
      }
      // Accepting creates the parent and pupil accounts automatically (staff can tweak classes and re-run in the Process tab).
      if (status === "accepted" && previous !== "accepted" && !current.accounts_created_at && !opts?.skipAccounts) {
        void runAccounts({ ...current, status });
      }
      return true;
    },
    [rows, isHeadteacher, runAccounts]
  );

  const patch = useCallback(async (id: string, p: ApplicationPatch): Promise<boolean> => {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const { error } = await supabase.from("admissions_applications").update(p).eq("id", id);
    if (error) return false;
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...p } : r)));
    return true;
  }, []);

  const closeDrawer = useCallback(() => setSelectedId(null), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (yearFilter && r.year_group_applying !== yearFilter) return false;
      if (!q) return true;
      return [r.child_first_name, r.child_last_name, r.parent_name, r.parent_email, r.reference || ""].some((v) => v.toLowerCase().includes(q));
    });
  }, [rows, search, yearFilter]);

  const byStatus = (s: ApplicationStatus) => filtered.filter((r) => r.status === s);
  const sidelineCount = filtered.filter((r) => SIDELINE_STATUSES.includes(r.status)).length;
  const selected = rows.find((r) => r.id === selectedId) || null;
  const familySizes = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.family_id) m.set(r.family_id, (m.get(r.family_id) ?? 0) + 1);
    return m;
  }, [rows]);
  const selectedFamily = useMemo(
    () => (selected ? (selected.family_id ? rows.filter((r) => r.family_id === selected.family_id).sort((a, b) => (a.sibling_index ?? 0) - (b.sibling_index ?? 0)) : [selected]) : []),
    [rows, selected],
  );

  function handleDragStart(e: DragEvent<HTMLDivElement>, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDragId(id);
  }
  function handleDrop(e: DragEvent<HTMLDivElement>, status: ApplicationStatus) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setDragOver(null);
    setDragId(null);
    if (id) void moveTo(id, status);
  }

  function exportCsv() {
    const cols = [
      "reference", "status", "created_at", "parent_name", "parent_email", "parent_phone", "relationship", "address",
      "address_line1", "address_line2", "address_town", "address_postcode", "address_country",
      "local_authority", "lived_in_uk", "last_uk_postcode", "last_uk_address", "last_uk_local_authority", "british_national",
      "child_first_name", "child_last_name", "child_dob", "child_gender", "year_group_applying", "preferred_start",
      "current_school", "current_school_year", "previous_islamic_education", "send_or_medical_notes", "how_heard",
      "sibling_at_tarbiyyah", "sibling_details", "consent_contact", "consent_data", "declaration_name", "notes",
      "offer_made_at", "offer_deadline", "admin_fee_amount", "admin_fee_received", "deposit_amount", "deposit_received",
    ] as const;
    const lines = [cols.join(",")].concat(filtered.map((r) => cols.map((c) => csvCell(r[c])).join(",")));
    saveCsv(`applications-${ukToday()}.csv`, lines.join("\r\n"));
  }

  const cardProps = { onOpen: setSelectedId, onMove: moveTo, onDragStart: handleDragStart, onDragEnd: () => { setDragId(null); setDragOver(null); } };
  const newCount = rows.filter((r) => r.status === "new").length;

  return (
    <div className="space-y-6">
      {/* The public form's on/off switch and link, kept to one slim bar so the board is the first thing seen. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-gold-light/60 bg-white px-4 py-3">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" role="switch" checked={accepting === true} disabled={accepting === null || toggling} onChange={(e) => toggleAccepting(e.target.checked)} />
          <span className="font-medium">Accepting applications</span>
        </label>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${accepting === null ? "bg-cream text-ink/65" : accepting ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}>
          {accepting === null ? "Checking…" : accepting ? "Form open" : "Form closed to families"}
        </span>
        <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <code className="max-w-full break-all rounded-lg bg-cream px-2 py-1 text-xs text-ink/80">{FORM_URL}</code>
          <button type="button" onClick={copyLink} className={btn("secondary", "sm")}>
            {copied ? "Copied" : "Copy link"}
          </button>
          <a href={FORM_URL} target="_blank" rel="noopener noreferrer" className={btn("secondary", "sm")}>
            Preview
          </a>
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-ink">
          Search
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Child, parent, email or reference"
            className={`${ui.input} mt-1 !w-64 max-w-full`}
          />
        </label>
        <label className="text-xs font-medium text-ink">
          Year group
          <Select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className={`${ui.select} mt-1 !w-auto`}>
            <option value="">All year groups</option>
            {YEAR_GROUP_OPTIONS.map((y) => (
              <option key={y.value} value={y.value}>{y.value}</option>
            ))}
          </Select>
        </label>
        <p className="pb-2 text-sm text-ink/65">
          {newCount} new · {rows.length} total
        </p>
        {canExport && (
          <button type="button" onClick={exportCsv} disabled={filtered.length === 0} className={`${btn("secondary")} ml-auto`}>
            Export CSV
          </button>
        )}
      </div>

      {/* Sticky, so moving a card far down the board still shows what happened. */}
      {(actionError || notice) && (
        <div className="sticky top-2 z-10 space-y-2">
          {actionError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 shadow-sm">
              {actionError} <button type="button" onClick={() => setActionError(null)} className="underline">Dismiss</button>
            </p>
          )}
          {notice && (
            <p role={notice.ok ? "status" : "alert"} className={`rounded-lg border px-3 py-2 text-sm shadow-sm ${notice.ok ? "border-teal-200 bg-teal-50 text-teal-900" : "border-red-200 bg-red-50 text-red-800"}`}>
              {notice.text} <button type="button" onClick={() => setNotice(null)} className="underline">Dismiss</button>
            </p>
          )}
        </div>
      )}

      {load === "loading" && <p role="status" className="text-sm text-ink/65">Loading applications…</p>}
      {load === "error" && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Couldn&apos;t load applications.{" "}
          <button type="button" onClick={() => void fetchAll()} className="font-semibold underline">Try again</button>
        </div>
      )}
      {load === "ready" && rows.length === 0 && (
        <div className="rounded-2xl border border-gold-light/50 bg-white p-6 text-center text-sm text-ink/70">
          No applications yet. Share the form link above and they will appear here.
        </div>
      )}

      {load === "ready" && rows.length > 0 && (
        <>
          {filtered.length === 0 && <p className="text-sm text-ink/65">No applications match your search.</p>}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {PIPELINE_STATUSES.map((s) => (
              <Column key={s} status={s} apps={byStatus(s)} dragOver={dragOver} setDragOver={setDragOver} onDropOn={handleDrop} cardProps={cardProps} familySizes={familySizes} />
            ))}
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowSideline((v) => !v)}
              aria-expanded={showSideline}
              className="text-sm font-medium text-ink/70 hover:text-ink"
            >
              {showSideline ? "Hide" : "Show"} waitlisted / declined / withdrawn ({sidelineCount})
            </button>
            {showSideline && (
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {SIDELINE_STATUSES.map((s) => (
                  <Column key={s} status={s} apps={byStatus(s)} dragOver={dragOver} setDragOver={setDragOver} onDropOn={handleDrop} cardProps={cardProps} familySizes={familySizes} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {selected && <ApplicationDrawer key={selected.id} app={selected} staff={staff} onClose={closeDrawer} onMove={moveTo} onPatch={patch} family={selectedFamily} credentials={credentials} onOpenApplication={setSelectedId} onCreateAccounts={runAccounts} onDismissCredentials={(k) => setCredentials((c) => c.filter((x) => x.key !== k))} />}
    </div>
  );
}
