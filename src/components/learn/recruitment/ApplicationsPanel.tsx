"use client";

import { Icon } from "@/components/learn/Icon";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { saveCsv, toCsv } from "@/lib/learn/csv";
import { AI_RECOMMENDATIONS, APPLICATION_STATUSES, SUBJECTS, TEACHER_STATUS, labelFor, type ApplicationStatus } from "@/lib/careers";
import { Button, EmptyState, StatusChip, ui } from "@/components/learn/ui";
import { ApplicationDetail } from "./ApplicationDetail";
import { APPLICATION_COLUMNS, ukDate, type JobApplication } from "./types";
import { Select } from "@/components/learn/Select";

type Filter = "active" | "all" | ApplicationStatus;
type AiFilter = "" | "strong" | "possible" | "unlikely" | "unscreened";
type Sort = "newest" | "ai" | "rating";
const ACTIVE: ApplicationStatus[] = ["new", "reviewing", "shortlisted", "interview", "offered"];

export function ApplicationsPanel({ userId }: { userId: string | null }) {
  const supabase = getSupabaseClient();
  const [apps, setApps] = useState<JobApplication[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("active");
  const [role, setRole] = useState("");
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [aiFilter, setAiFilter] = useState<AiFilter>("");
  const [sort, setSort] = useState<Sort>("newest");
  const [screening, setScreening] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [staffNames, setStaffNames] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("job_applications").select(APPLICATION_COLUMNS).order("created_at", { ascending: false });
    if (error) setFailed(true);
    setApps((data as JobApplication[] | null) || []);
    const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", [userId || ""]);
    setStaffNames((m) => {
      const next = new Map(m);
      for (const p of (people as { id: string; full_name: string | null }[] | null) || []) next.set(p.id, p.full_name || "Staff");
      return next;
    });
    // Opened from the email link: /admin/recruitment/?app=<id>
    const wanted = new URLSearchParams(window.location.search).get("app");
    if (wanted) setOpenId(wanted);
  }, [supabase, userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load]);

  // Names for whoever wrote notes (loaded when an application is opened).
  useEffect(() => {
    if (!supabase || !openId) return;
    let cancelled = false;
    void supabase
      .from("job_application_events")
      .select("created_by")
      .eq("application_id", openId)
      .not("created_by", "is", null)
      .then(async ({ data }) => {
        const ids = [...new Set(((data as { created_by: string }[] | null) || []).map((r) => r.created_by))].filter((id) => !staffNames.has(id));
        if (ids.length === 0 || cancelled) return;
        const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        if (cancelled) return;
        setStaffNames((m) => {
          const next = new Map(m);
          for (const p of (people as { id: string; full_name: string | null }[] | null) || []) next.set(p.id, p.full_name || "Staff");
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, openId, staffNames]);

  const roles = useMemo(() => [...new Set((apps || []).map((a) => a.vacancy_title))].sort(), [apps]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of apps || []) if (!role || a.vacancy_title === role) m.set(a.status, (m.get(a.status) || 0) + 1);
    return m;
  }, [apps, role]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (apps || []).filter((a) => {
      if (role && a.vacancy_title !== role) return false;
      if (filter === "active" && !ACTIVE.includes(a.status)) return false;
      if (filter !== "active" && filter !== "all" && a.status !== filter) return false;
      if (subject && !a.subjects.includes(subject)) return false;
      if (aiFilter === "unscreened" && a.ai_score !== null) return false;
      if (aiFilter && aiFilter !== "unscreened" && a.ai_recommendation !== aiFilter) return false;
      if (q && !`${a.first_name} ${a.last_name} ${a.email} ${a.reference} ${a.subjects.join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((x, y) =>
      sort === "ai" ? (y.ai_score ?? -1) - (x.ai_score ?? -1) : sort === "rating" ? (y.rating ?? 0) - (x.rating ?? 0) : y.created_at.localeCompare(x.created_at),
    );
  }, [apps, filter, role, query, subject, aiFilter, sort]);

  const unscreened = useMemo(() => shown.filter((a) => a.ai_score === null), [shown]);

  /** Screens the unscreened applications in this view, five at a time. */
  async function screenAll() {
    if (!supabase || unscreened.length === 0) return;
    if (!confirm(`Ask the AI for a first read of ${unscreened.length} application${unscreened.length === 1 ? "" : "s"}? It is advisory only and doesn't change any status.`)) return;
    const ids = unscreened.map((a) => a.id);
    setNotice(null);
    setScreening({ done: 0, total: ids.length });
    let failed = 0;
    for (let i = 0; i < ids.length; i += 5) {
      const batch = ids.slice(i, i + 5);
      const res = await callEdgeFunction("recruitment-screen", { action: "screen", ids: batch });
      if (!res.ok) {
        setScreening(null);
        return setNotice({ text: res.error === "ai_not_configured" ? "AI isn't set up yet: add an ANTHROPIC_API_KEY to the Supabase secrets." : edgeErrorMessage(res), error: true });
      }
      const results = (res.results as Record<string, { ok: boolean }>) || {};
      failed += batch.filter((id) => results[id] && !results[id].ok).length;
      setScreening({ done: Math.min(i + batch.length, ids.length), total: ids.length });
      if (res.stopped) {
        setNotice({ text: "Today's AI limit was reached, so some applications weren't screened. Try again tomorrow.", error: true });
        break;
      }
    }
    setScreening(null);
    await load();
    if (failed) setNotice({ text: `${failed} application${failed === 1 ? "" : "s"} couldn't be screened. Open one to try again.`, error: true });
    else setNotice((n) => n || { text: "Screening finished. Sort by AI score to see the strongest first." });
  }

  const open = apps?.find((a) => a.id === openId) || null;

  const close = () => {
    setOpenId(null);
    if (window.location.search.includes("app=")) window.history.replaceState(null, "", window.location.pathname);
  };

  function exportCsv() {
    const header = ["Reference", "Applied", "Role", "Status", "Rating", "AI score", "AI view", "First name", "Last name", "Email", "Phone", "Country", "Teacher status", "Subjects", "Interview"];
    const rows = shown.map((a) => [a.reference, ukDate(a.created_at), a.vacancy_title, labelFor(APPLICATION_STATUSES, a.status), a.rating ?? "", a.ai_score ?? "", labelFor(AI_RECOMMENDATIONS, a.ai_recommendation), a.first_name, a.last_name, a.email, a.phone, a.country, labelFor(TEACHER_STATUS, a.teacher_status), a.subjects.join("; "), a.interview_at ? ukDate(a.interview_at) : ""]);
    saveCsv(`job-applications-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(header, rows));
  }

  if (open) {
    return (
      <ApplicationDetail
        key={open.id}
        app={open}
        onBack={close}
        userId={userId}
        staffNames={staffNames}
        onChanged={(patch) => setApps((list) => (list || []).map((a) => (a.id === open.id ? { ...a, ...patch, ...(patch.status ? { status_changed_at: new Date().toISOString() } : {}) } : a)))}
      />
    );
  }

  if (apps === null) return <div className="h-40 motion-safe:animate-pulse rounded-2xl border border-gold-light bg-white" />;

  const activeCount = ACTIVE.reduce((n, s) => n + (counts.get(s) || 0), 0);
  const filters: { key: Filter; label: string; count?: number }[] = [
    { key: "active", label: "In progress", count: activeCount },
    ...APPLICATION_STATUSES.map((s) => ({ key: s.value as Filter, label: s.label, count: counts.get(s.value) || 0 })),
    { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-4">
      {failed && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">Couldn&apos;t load the applications. Only the Headteacher and Admin can see them.</p>}

      <div className={ui.toolbar}>
        <label className="sr-only" htmlFor="rec-search">Search applications</label>
        <input id="rec-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, reference or subject" className={`${ui.input} max-w-xs`} />
        <label className="sr-only" htmlFor="rec-role">Role</label>
        <Select id="rec-role" value={role} onChange={(e) => setRole(e.target.value)} className={`${ui.select} max-w-xs`}>
          <option value="">All roles</option>
          {roles.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="rec-subject">Subject</label>
        <Select id="rec-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={`${ui.select} max-w-xs`}>
          <option value="">All subjects</option>
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="rec-ai">AI view</label>
        <Select id="rec-ai" value={aiFilter} onChange={(e) => setAiFilter(e.target.value as AiFilter)} className={`${ui.select} max-w-[12rem]`}>
          <option value="">Any AI view</option>
          <option value="strong">AI: strong match</option>
          <option value="possible">AI: possible</option>
          <option value="unlikely">AI: unlikely</option>
          <option value="unscreened">Not screened yet</option>
        </Select>
        <label className="sr-only" htmlFor="rec-sort">Sort</label>
        <Select id="rec-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${ui.select} max-w-[12rem]`}>
          <option value="newest">Newest first</option>
          <option value="ai">Highest AI score</option>
          <option value="rating">Highest panel rating</option>
        </Select>
        <Button icon="download" onClick={exportCsv} disabled={shown.length === 0}>Export list (CSV)</Button>
        <Button variant="primary" onClick={screenAll} disabled={!!screening || unscreened.length === 0}>
          {screening ? `Screening ${screening.done} of ${screening.total}…` : `Screen with AI (${unscreened.length})`}
        </Button>
      </div>
      {notice && <p role={notice.error ? "alert" : "status"} className={`rounded-lg border px-4 py-2 text-sm ${notice.error ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-900"}`}>{notice.text}</p>}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {filters.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={filter === f.key ? ui.chipOn : ui.chip}>
            {f.label}
            {f.count !== undefined && <span className="ml-1.5 tabular-nums opacity-80">{f.count}</span>}
          </button>
        ))}
      </div>

      {apps.length === 0 ? (
        <EmptyState title="No applications yet" icon="briefcase">
          Applications from the Careers page appear here, and the recruitment inbox is emailed about each one. Open a role in Vacancies to start receiving them.
        </EmptyState>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-gold-light bg-white p-5 text-sm text-ink/65">No applications match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gold-light bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-gold-light/60 text-xs uppercase tracking-wide text-ink/65">
                <th className="px-4 py-3 font-medium">Candidate</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Teacher status</th>
                <th className="px-4 py-3 font-medium">Applied</th>
                <th className="px-4 py-3 font-medium">AI</th>
                <th className="px-4 py-3 font-medium">Rating</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold-light/40">
              {shown.map((a) => {
                const s = APPLICATION_STATUSES.find((x) => x.value === a.status);
                return (
                  <tr key={a.id} className="hover:bg-cream/60">
                    <td className="px-4 py-3 align-top">
                      <button type="button" onClick={() => setOpenId(a.id)} className="text-left font-semibold text-ink underline-offset-2 hover:underline">
                        {a.first_name} {a.last_name}
                      </button>
                      <span className="block text-xs text-ink/65">{a.reference} · {a.country}</span>
                    </td>
                    <td className="px-4 py-3 align-top text-ink/85">{a.vacancy_title}</td>
                    <td className="px-4 py-3 align-top text-ink/85">{labelFor(TEACHER_STATUS, a.teacher_status)}</td>
                    <td className="px-4 py-3 align-top text-ink/85">{ukDate(a.created_at)}</td>
                    <td className="px-4 py-3 align-top">
                      {a.ai_score === null ? (
                        <span className="text-xs text-ink/50">Not screened</span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <span className="font-semibold tabular-nums text-ink">{a.ai_score}</span>
                          <StatusChip tone={AI_RECOMMENDATIONS.find((r) => r.value === a.ai_recommendation)?.tone || "neutral"}>{labelFor(AI_RECOMMENDATIONS, a.ai_recommendation)}</StatusChip>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-gold-900" aria-label={a.rating ? `${a.rating} out of 5` : "Not rated"}>{a.rating ? <span className="inline-flex gap-0.5">{Array.from({ length: a.rating }, (_, j) => <Icon key={j} name="star" size="sm" />)}</span> : <span className="text-ink/40">–</span>}</td>
                    <td className="px-4 py-3 align-top"><StatusChip tone={s?.tone || "neutral"}>{s?.label || a.status}</StatusChip></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink/65">
        Applications hold candidates&apos; personal data. Unsuccessful and withdrawn applications are deleted automatically, with their files, 6 months after the decision.
      </p>
    </div>
  );
}
