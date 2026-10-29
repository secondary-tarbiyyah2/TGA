"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { requestSignatures } from "@/components/learn/documents/audience";
import { getSupabaseClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Tabs } from "@/components/learn/Tabs";
import { btn, ui } from "@/components/learn/ui";

type Severity = "critical" | "high" | "medium";
type Status = "open" | "acknowledged" | "resolved";
type Kind = "absence" | "escalation" | "flagged_message";
const KIND_LABEL: Record<Kind, string> = { absence: "Unexplained absence", escalation: "Safeguarding escalation", flagged_message: "Flagged message" };
type StatusRow = { alert_kind: Kind; alert_ref: string; status: Status; acknowledged_by: string | null; acknowledged_at: string | null; resolved_by: string | null; resolved_at: string | null; note: string | null };
type Alert = {
  key: string;
  kind: Kind;
  ref: string;
  severity: Severity;
  title: string;
  detail: string;
  when: string; // ISO of the latest event
  state?: StatusRow;
  body?: string;
};
type Outstanding = { user_id: string; full_name: string | null; email: string | null; title: string; document_id: string };
type DocInfo = { id: string; synced_at: string };
type Req = { document_id: string; user_id: string; requested_at: string };

const DAY = 86_400_000;
const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium"];
const SEVERITY_STYLE: Record<Severity, { label: string; box: string; badge: string }> = {
  critical: { label: "Critical", box: "border-red-300 bg-red-50", badge: "bg-red-600 text-white" },
  high: { label: "High", box: "border-amber-300 bg-amber-50", badge: "bg-amber-500 text-white" },
  medium: { label: "Routine", box: "border-gold-light/60 bg-white", badge: "bg-ink/10 text-ink/70" },
};
const CRITICAL_POLICY = /child protection|safeguarding/i;

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
  return `"${s.replace(/"/g, '""')}"`;
}
function downloadCsv(name: string, header: string[], rows: unknown[][]) {
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Compliance & safeguarding dashboard: summary strip, alerts grouped by
 * severity with an open -> acknowledged -> resolved workflow (stored in
 * compliance_alert_status, 0047), and outstanding signatures grouped per
 * person. RLS decides what each role actually receives.
 */
export function ComplianceDashboard({ isHeadTeacher, alertsExtra, topExtra, recordsTab }: { isHeadTeacher: boolean; alertsExtra?: ReactNode; topExtra?: ReactNode; recordsTab: ReactNode }) {
  const supabase = getSupabaseClient();
  const [tab, setTab] = useState<"alerts" | "signatures" | "records">("alerts");
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [outstanding, setOutstanding] = useState<Outstanding[] | null>(null);
  const [docs, setDocs] = useState<Record<string, string>>({});
  const [reqs, setReqs] = useState<Req[]>([]);
  const [staffNoDbs, setStaffNoDbs] = useState<string[] | null>(null);
  const [dbsDue, setDbsDue] = useState<string[]>([]);
  const [filter, setFilter] = useState<"active" | Status | "all">("active");
  const [kindFilter, setKindFilter] = useState<Kind | "all">("all");
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [openBody, setOpenBody] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setNow(Date.now());
    const since = new Date(Date.now() - 90 * DAY).toISOString();
    const [abs, esc, flg, st, out, dc, rq, staffRoles, vet] = await Promise.all([
      supabase.from("audit_log").select("id, target_id, changes, created_at").eq("action", "ABSENCE_ALERT_SENT").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
      supabase.from("audit_log").select("id, target_id, changes, created_at").eq("action", "SAFEGUARDING_ESCALATION").gte("created_at", since).order("created_at", { ascending: false }).limit(100),
      supabase.from("message_thread_messages").select("id, body, flagged_keywords, created_at, sender_id, profiles(full_name)").eq("flagged", true).order("created_at", { ascending: false }).limit(100),
      supabase.from("compliance_alert_status").select("*"),
      supabase.from("outstanding_signatures").select("user_id, full_name, email, title, document_id"),
      supabase.from("signable_documents").select("id, synced_at").eq("requires_signature", true),
      supabase.from("signature_requests").select("document_id, user_id, requested_at").order("requested_at", { ascending: true }).limit(2000),
      supabase.from("user_roles").select("user_id, profiles(full_name)").in("role", ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover"]),
      supabase.from("staff_vetting_records").select("user_id, dbs_check_date, dbs_renewal_due"),
    ]);

    // Child names (never show raw ids).
    type AuditRow = { id: number; target_id: string | null; changes: Record<string, unknown> | null; created_at: string };
    const absRows = (abs.data as AuditRow[]) || [];
    const escRows = (esc.data as AuditRow[]) || [];
    const childIds = [...new Set([...absRows.map((a) => String(a.changes?.child_id || "")), ...escRows.map((e) => String(e.target_id || ""))].filter(Boolean))];
    const nameMap: Record<string, string> = {};
    if (childIds.length) {
      const { data: kids } = await supabase.from("children").select("id, name").in("id", childIds);
      for (const k of (kids as { id: string; name: string }[]) || []) nameMap[k.id] = k.name;
    }
    const childName = (id: string) => nameMap[id] || `Unknown pupil (${id.slice(0, 8)})`;

    const statusRows = (st.data as StatusRow[]) || [];
    const statusMap = new Map(statusRows.map((s) => [`${s.alert_kind}:${s.alert_ref}`, s]));

    // De-duplicate absence alerts: one entry per pupil per day, however many lessons.
    const perChildCount = new Map<string, number>();
    const groups = new Map<string, { child: string; date: string; lessons: number; when: string }>();
    for (const a of absRows) {
      const child = String(a.changes?.child_id || "");
      if (!child) continue;
      const date = String(a.changes?.date || a.created_at.slice(0, 10));
      const k = `${child}:${date}`;
      const g = groups.get(k);
      if (g) g.lessons += 1;
      else {
        groups.set(k, { child, date, lessons: 1, when: a.created_at });
        perChildCount.set(child, (perChildCount.get(child) || 0) + 1);
      }
    }

    const list: Alert[] = [];
    for (const [ref, g] of groups) {
      const repeated = (perChildCount.get(g.child) || 0) >= 2;
      list.push({
        key: `absence:${ref}`, kind: "absence", ref, severity: repeated ? "high" : "medium",
        title: `${childName(g.child)}: unexplained absence`,
        detail: `${day(g.date)}${g.lessons > 1 ? `, ${g.lessons} lessons` : ""}${repeated ? `. ${perChildCount.get(g.child)} absence days in the last 90 days` : ""}`,
        when: g.when, state: statusMap.get(`absence:${ref}`),
      });
    }
    for (const e of escRows) {
      const ch = e.changes || {};
      const ref = String(e.id);
      list.push({
        key: `escalation:${ref}`, kind: "escalation", ref, severity: "critical",
        title: `${childName(String(e.target_id || ""))}: safeguarding escalation`,
        detail: `${String(ch.unexplained_count ?? "Several")} unexplained absences in ${String(ch.period_days ?? "recent")} days (threshold ${String(ch.threshold ?? "n/a")})`,
        when: e.created_at, state: statusMap.get(`escalation:${ref}`),
      });
    }
    type Flag = { id: string; body: string; flagged_keywords: string[] | null; created_at: string; profiles: { full_name: string } | null };
    for (const m of (flg.data as unknown as Flag[]) || []) {
      list.push({
        key: `flagged_message:${m.id}`, kind: "flagged_message", ref: m.id, severity: "high",
        title: `Flagged message from ${m.profiles?.full_name || "an unknown sender"}`,
        detail: `Keywords: ${(m.flagged_keywords || []).join(", ") || "none recorded"}`,
        when: m.created_at, state: statusMap.get(`flagged_message:${m.id}`), body: m.body,
      });
    }
    list.sort((a, b) => b.when.localeCompare(a.when));
    setAlerts(list);

    // Names of the people who acknowledged / resolved.
    const actorIds = [...new Set(statusRows.flatMap((s) => [s.acknowledged_by, s.resolved_by]).filter((x): x is string => !!x))];
    if (actorIds.length) {
      const { data: ps } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
      for (const p of (ps as { id: string; full_name: string }[]) || []) nameMap[p.id] = p.full_name;
    }
    setNames(nameMap);

    setOutstanding((out.data as Outstanding[]) || []);
    setDocs(Object.fromEntries(((dc.data as DocInfo[]) || []).map((d) => [d.id, d.synced_at])));
    setReqs((rq.data as Req[]) || []);

    // Staff checks (DBS). Training isn't tracked anywhere in the portal yet.
    const staff = new Map<string, string>();
    for (const r of (staffRoles.data as unknown as { user_id: string; profiles: { full_name: string } | null }[]) || []) staff.set(r.user_id, r.profiles?.full_name || "Unknown");
    const v = new Map(((vet.data as { user_id: string; dbs_check_date: string | null; dbs_renewal_due: string | null }[]) || []).map((x) => [x.user_id, x]));
    setStaffNoDbs([...staff].filter(([id]) => !v.get(id)?.dbs_check_date).map(([, n]) => n));
    setDbsDue([...staff].filter(([id]) => { const due = v.get(id)?.dbs_renewal_due; return !!due && new Date(due).getTime() < Date.now() + 60 * DAY; }).map(([, n]) => n));
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const stateOf = (a: Alert): Status => a.state?.status || "open";
  const overdue = (a: Alert) => {
    const s = stateOf(a);
    if (s === "resolved" || !now) return false;
    const limitDays = a.kind === "absence" ? 3 : 1;
    const since = s === "acknowledged" && a.state?.acknowledged_at ? a.state.acknowledged_at : a.when;
    return now - new Date(since).getTime() > limitDays * DAY * (s === "acknowledged" ? 3 : 1);
  };

  const shown = useMemo(
    () => (alerts || []).filter((a) => (kindFilter === "all" || a.kind === kindFilter) && (filter === "all" ? true : filter === "active" ? stateOf(a) !== "resolved" : stateOf(a) === filter)),
    [alerts, filter, kindFilter],
  );
  const openCount = (alerts || []).filter((a) => stateOf(a) === "open").length;
  const activeCount = (alerts || []).filter((a) => stateOf(a) !== "resolved").length;
  const openFlagged = (alerts || []).filter((a) => a.kind === "flagged_message" && stateOf(a) !== "resolved").length;

  async function setStatus(a: Alert, status: Status, text?: string) {
    if (!supabase) return;
    setBusy(a.key);
    setMessage(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const t = new Date().toISOString();
    const prev = a.state;
    const row: Record<string, unknown> = {
      alert_kind: a.kind, alert_ref: a.ref, status, updated_at: t,
      acknowledged_by: prev?.acknowledged_by ?? user?.id ?? null,
      acknowledged_at: prev?.acknowledged_at ?? t,
      note: text ?? prev?.note ?? null,
    };
    if (status === "resolved") { row.resolved_by = user?.id ?? null; row.resolved_at = t; }
    const { error } = await supabase.from("compliance_alert_status").upsert(row, { onConflict: "alert_kind,alert_ref" });
    setBusy(null);
    if (error) return setMessage("Couldn't update that alert. Only a Headteacher, Admin or Safeguarding Lead can.");
    setResolving(null);
    setNote("");
    await load();
  }

  // ── outstanding signatures, one entry per person, each policy once
  const people = useMemo(() => {
    const m = new Map<string, { user_id: string; name: string; email: string | null; docs: Map<string, { id: string; since: string; critical: boolean }> }>();
    const firstReq = new Map<string, string>();
    for (const r of reqs) { const k = `${r.document_id}:${r.user_id}`; if (!firstReq.has(k)) firstReq.set(k, r.requested_at); }
    for (const o of outstanding || []) {
      const p = m.get(o.user_id) || { user_id: o.user_id, name: o.full_name || o.email || "Unknown", email: o.email, docs: new Map() };
      if (!p.docs.has(o.title)) p.docs.set(o.title, { id: o.document_id, since: firstReq.get(`${o.document_id}:${o.user_id}`) || docs[o.document_id] || "", critical: CRITICAL_POLICY.test(o.title) });
      m.set(o.user_id, p);
    }
    return [...m.values()].sort((a, b) => Number([...b.docs.values()].some((d) => d.critical)) - Number([...a.docs.values()].some((d) => d.critical)) || b.docs.size - a.docs.size || a.name.localeCompare(b.name));
  }, [outstanding, docs, reqs]);
  const daysOverdue = (since: string) => (since && now ? Math.floor((now - new Date(since).getTime()) / DAY) - 7 : 0);
  const criticalUnsigned = people.filter((p) => [...p.docs.values()].some((d) => d.critical)).length;

  async function remindPerson(p: (typeof people)[number]) {
    setBusy(`p-${p.user_id}`);
    let sent = 0;
    for (const d of p.docs.values()) sent += (await requestSignatures(d.id, { userIds: [p.user_id], kind: "reminder" })).sent;
    setBusy(null);
    setMessage(sent > 0 ? `Reminder emailed to ${p.name}.` : `No email went to ${p.name} (reminded in the last 6 hours, or email isn't available). They can still sign in the portal.`);
    await load();
  }
  async function remindAll() {
    if (!confirm(`Email a reminder to all ${people.length} people with outstanding signatures?`)) return;
    setBusy("all");
    let sent = 0;
    for (const p of people) for (const d of p.docs.values()) sent += (await requestSignatures(d.id, { userIds: [p.user_id], kind: "reminder" })).sent;
    setBusy(null);
    setMessage(`${sent} reminder email${sent === 1 ? "" : "s"} sent.`);
    await load();
  }

  const tile = (label: string, value: number | string, tone: "bad" | "ok" | "warn", onClick?: () => void, sub?: string) => (
    <button type="button" onClick={onClick} className={`rounded-2xl border p-4 text-left ${tone === "bad" ? "border-red-300 bg-red-50" : tone === "warn" ? "border-amber-300 bg-amber-50" : "border-green-200 bg-green-50"} ${onClick ? "hover:brightness-95" : "cursor-default"}`}>
      <p className="text-2xl font-semibold text-ink">{value}</p>
      <p className="text-xs font-medium text-ink/70">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-ink/65">{sub}</p>}
    </button>
  );
  const loading = alerts === null || outstanding === null;
  return (
    <div className="space-y-5">
      {topExtra}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Safeguarding summary">
        {tile("Open alerts", loading ? "…" : activeCount, activeCount === 0 ? "ok" : openCount > 0 ? "bad" : "warn", () => { setTab("alerts"); setFilter("active"); setKindFilter("all"); }, loading ? undefined : `${openCount} not yet acknowledged`)}
        {tile("Flagged messages", loading ? "…" : openFlagged, openFlagged === 0 ? "ok" : "bad", () => { setTab("alerts"); setFilter("active"); setKindFilter("flagged_message"); })}
        {tile("Unsigned critical policies", loading ? "…" : criticalUnsigned, criticalUnsigned === 0 ? "ok" : "bad", () => setTab("signatures"), "people yet to sign child protection / safeguarding")}
        {tile("Staff without DBS on file", staffNoDbs === null ? "…" : staffNoDbs.length, staffNoDbs && staffNoDbs.length === 0 ? "ok" : "warn", () => setTab("records"), `${dbsDue.length} renewal${dbsDue.length === 1 ? "" : "s"} due within 60 days. Training isn't tracked yet.`)}
      </div>

      <Tabs
        items={[
          { key: "alerts", label: "Alerts", count: activeCount || undefined, countAlert: true },
          { key: "signatures", label: "Signatures", count: people.length || undefined },
          { key: "records", label: "Records and settings" },
        ]}
        value={tab}
        onChange={setTab}
        label="Safeguarding sections"
      />

      {message && <p role="status" className="rounded-lg bg-cream px-4 py-2 text-sm text-ink/80">{message}</p>}

      {tab === "alerts" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(["active", "open", "acknowledged", "resolved", "all"] as const).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={filter === f ? ui.chipOn : ui.chip}>
                  {f === "active" ? "Needs action" : f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
              <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as Kind | "all")} aria-label="Type of alert" className={`${ui.select} !w-auto`}>
                <option value="all">All types</option>
                <option value="flagged_message">Flagged messages</option>
                <option value="escalation">Safeguarding escalations</option>
                <option value="absence">Unexplained absences</option>
              </select>
            </div>
            {isHeadTeacher && (
              <button
                type="button"
                onClick={() =>
                  downloadCsv("safeguarding-alerts.csv", ["Severity", "Type", "Pupil or sender, and summary", "Detail", "Raised", "Status", "Acknowledged by", "Acknowledged at", "Resolved by", "Resolved at", "Note"],
                    (alerts || []).map((a) => [SEVERITY_STYLE[a.severity].label, KIND_LABEL[a.kind], a.title, a.detail, a.when, stateOf(a), names[a.state?.acknowledged_by || ""] || "", a.state?.acknowledged_at || "", names[a.state?.resolved_by || ""] || "", a.state?.resolved_at || "", a.state?.note || ""]))
                }
                className={btn("secondary", "sm")}
              >
                Export alerts (CSV)
              </button>
            )}
          </div>

          {alerts === null && <div className="h-32 animate-pulse rounded-2xl bg-cream" />}
          {alerts && shown.length === 0 && <p className="rounded-2xl border border-gold-light bg-white px-5 py-8 text-center text-sm text-ink/65">Nothing here. No alerts match this view.</p>}
          {SEVERITY_ORDER.map((sev) => {
            const group = shown.filter((a) => a.severity === sev);
            if (group.length === 0) return null;
            return (
              <section key={sev} aria-label={`${SEVERITY_STYLE[sev].label} alerts`}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs ${SEVERITY_STYLE[sev].badge}`}>{SEVERITY_STYLE[sev].label}</span>
                  {group.length}
                </h2>
                <ul className="space-y-2">
                  {group.map((a) => {
                    const s = stateOf(a);
                    const isOver = overdue(a);
                    return (
                      <li key={a.key} className={`rounded-xl border p-3 text-sm ${isOver ? "border-red-400 bg-red-50 ring-1 ring-red-300" : SEVERITY_STYLE[a.severity].box}`}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-ink">
                              {a.title}
                              {isOver && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">Overdue</span>}
                            </p>
                            <p className="text-xs text-ink/65">{a.detail}</p>
                            <p className="mt-0.5 text-xs text-ink/65">
                              Raised {fmt(a.when)}
                              {a.body && (
                                <button type="button" onClick={() => setOpenBody(openBody === a.key ? null : a.key)} className={`${ui.btnLink} ml-2 !text-xs`}>
                                  {openBody === a.key ? "Hide message" : "Show message"}
                                </button>
                              )}
                            </p>
                            {a.body && openBody === a.key && <p className="mt-1 whitespace-pre-wrap rounded-lg border border-red-200 bg-white p-2 text-sm text-ink/85">{a.body}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s === "open" ? "bg-red-100 text-red-800" : s === "acknowledged" ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-800"}`}>{s[0].toUpperCase() + s.slice(1)}</span>
                            {s === "open" && (
                              <button type="button" disabled={busy === a.key} onClick={() => setStatus(a, "acknowledged")} className={btn("secondary", "sm")}>Acknowledge</button>
                            )}
                            {s !== "resolved" && (
                              <button type="button" onClick={() => { setResolving(resolving === a.key ? null : a.key); setNote(""); }} className={btn("primary", "sm")}>Resolve</button>
                            )}
                          </div>
                        </div>
                        {(a.state?.acknowledged_at || a.state?.resolved_at) && (
                          <p className="mt-2 border-t border-black/5 pt-2 text-xs text-ink/65">
                            {a.state?.acknowledged_at && <>Acknowledged by {names[a.state.acknowledged_by || ""] || "a colleague"}, {fmt(a.state.acknowledged_at)}. </>}
                            {a.state?.resolved_at && <>Resolved by {names[a.state.resolved_by || ""] || "a colleague"}, {fmt(a.state.resolved_at)}. </>}
                            {a.state?.note && <span className="text-ink/80">Note: {a.state.note}</span>}
                          </p>
                        )}
                        {resolving === a.key && (
                          <div className="mt-2 space-y-2">
                            <label className="block text-xs font-medium text-ink/70">
                              What was done? (required)
                              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={`mt-1 ${ui.textarea}`} />
                            </label>
                            <button type="button" disabled={!note.trim() || busy === a.key} onClick={() => setStatus(a, "resolved", note.trim())} className={btn("primary", "sm")}>Mark resolved</button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {alertsExtra}
        </div>
      )}

      {tab === "signatures" && (
        <div className="rounded-2xl border border-gold-light bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-light px-5 py-3">
            <p className="text-sm text-ink/70">{outstanding === null ? "Loading…" : people.length === 0 ? "Everyone is up to date." : `${people.length} ${people.length === 1 ? "person has" : "people have"} documents to sign.`}</p>
            <div className="flex gap-2">
              {people.length > 0 && (
                <button type="button" disabled={busy === "all"} onClick={remindAll} className={btn("secondary", "sm")}>{busy === "all" ? "Sending…" : "Remind everyone"}</button>
              )}
              {isHeadTeacher && people.length > 0 && (
                <button
                  type="button"
                  onClick={() => downloadCsv("outstanding-signatures.csv", ["Person", "Email", "Document", "Days overdue"], people.flatMap((p) => [...p.docs].map(([title, d]) => [p.name, p.email, title, Math.max(0, daysOverdue(d.since))])))}
                  className={btn("secondary", "sm")}
                >
                  Export (CSV)
                </button>
              )}
            </div>
          </div>
          <ul className="divide-y divide-gold-light/70">
            {people.map((p) => {
              const list = [...p.docs];
              return (
                <li key={p.user_id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-medium text-ink">{p.name}</span>
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{list.length} to sign</span>
                    </span>
                    <button type="button" disabled={busy === `p-${p.user_id}`} onClick={() => remindPerson(p)} className={btn("secondary", "sm")}>{busy === `p-${p.user_id}` ? "Sending…" : "Remind"}</button>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {list.map(([title, d]) => {
                      const over = daysOverdue(d.since);
                      return (
                        <li key={d.id} className={over > 0 ? "text-red-800" : "text-ink/65"}>
                          {d.critical && <span className="mr-1.5 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-800 ring-1 ring-inset ring-red-600/20">Critical</span>}
                          {title}
                          {over > 0 && <span className="ml-2 text-xs font-semibold">overdue {over} day{over === 1 ? "" : "s"}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-gold-light px-5 py-3 text-xs text-ink/65">Overdue means more than a week since the person was first asked (or since the document was set up). People can sign in the portal or from the emailed link. To record a paper signature or change who must sign, use <Link href="/admin/documents?tab=outstanding" className="font-medium text-teal-700 underline">Policies and signatures</Link>.</p>
        </div>
      )}

      {tab === "records" && <div className="space-y-6">{recordsTab}</div>}
    </div>
  );
}
