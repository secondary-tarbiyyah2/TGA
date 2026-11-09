"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { saveCsv, toCsv } from "@/lib/learn/csv";
import { APPLICATION_STATUSES, TEACHER_STATUS, labelFor, type ApplicationStatus } from "@/lib/careers";
import { Button, EmptyState, StatusChip, ui } from "@/components/learn/ui";
import { ApplicationDetail } from "./ApplicationDetail";
import { APPLICATION_COLUMNS, ukDate, type JobApplication } from "./types";

type Filter = "active" | "all" | ApplicationStatus;
const ACTIVE: ApplicationStatus[] = ["new", "reviewing", "shortlisted", "interview", "offered"];

export function ApplicationsPanel({ userId }: { userId: string | null }) {
  const supabase = getSupabaseClient();
  const [apps, setApps] = useState<JobApplication[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("active");
  const [role, setRole] = useState("");
  const [query, setQuery] = useState("");
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
      if (q && !`${a.first_name} ${a.last_name} ${a.email} ${a.reference} ${a.subjects.join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [apps, filter, role, query]);

  const open = apps?.find((a) => a.id === openId) || null;

  const close = () => {
    setOpenId(null);
    if (window.location.search.includes("app=")) window.history.replaceState(null, "", window.location.pathname);
  };

  function exportCsv() {
    const header = ["Reference", "Applied", "Role", "Status", "Rating", "First name", "Last name", "Email", "Phone", "Country", "Teacher status", "Subjects", "Interview"];
    const rows = shown.map((a) => [a.reference, ukDate(a.created_at), a.vacancy_title, labelFor(APPLICATION_STATUSES, a.status), a.rating ?? "", a.first_name, a.last_name, a.email, a.phone, a.country, labelFor(TEACHER_STATUS, a.teacher_status), a.subjects.join("; "), a.interview_at ? ukDate(a.interview_at) : ""]);
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

  if (apps === null) return <div className="h-40 animate-pulse rounded-2xl border border-gold-light bg-white" />;

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
        <select id="rec-role" value={role} onChange={(e) => setRole(e.target.value)} className={`${ui.select} max-w-xs`}>
          <option value="">All roles</option>
          {roles.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <Button icon="download" onClick={exportCsv} disabled={shown.length === 0}>Export list (CSV)</Button>
      </div>

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
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-gold-light/60 text-xs uppercase tracking-wide text-ink/65">
                <th className="px-4 py-3 font-medium">Candidate</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Teacher status</th>
                <th className="px-4 py-3 font-medium">Applied</th>
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
                    <td className="px-4 py-3 align-top text-gold-900" aria-label={a.rating ? `${a.rating} out of 5` : "Not rated"}>{a.rating ? "★".repeat(a.rating) : <span className="text-ink/40">–</span>}</td>
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
