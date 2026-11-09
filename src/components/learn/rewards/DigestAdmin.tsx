"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DataTable, type Column } from "@/components/learn/DataTable";
import { Tabs } from "@/components/learn/Tabs";
import { EmptyState, Notice, StatusChip, Switch, ui } from "@/components/learn/ui";
import { DigestPreview } from "./DigestPreview";
import { STATUS_TEXT, digestHref, nextSendLabel, stampLabel, weekLabel, type DigestFamily, type DigestView } from "./digestData";

import { Select } from "@/components/ui/Dropdown";
// Headteacher/Admin tools for the Friday weekly digest (weekly-digest Edge
// Function), as separate views rather than one long page:
//   Overview, the schedule, last and next send, families, opt-outs and how
//               the last run went;
//   Families, search and filter every family; Preview opens in a side panel;
//   Preview, one family's email as the parent sees it (its own page);
//   History, sent / failed counts for past weeks (weekly_digest_log, 0073);
//   Settings, which sections the email includes (digest_settings, 0132).
// Previews and tests are never sent to the family and never logged.

type LogRow = { week_start: string; parent_user_id: string; status: "sending" | "sent" | "failed"; detail: string | null; sent_at: string | null };
type WeekStat = { week: string; sent: number; failed: number; sending: number; lastSent: string | null; failures: LogRow[] };

const VIEWS: DigestView[] = ["overview", "families", "history", "settings", "preview"];

export function DigestAdmin() {
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get("view") as DigestView | null;
  const view: DigestView = raw && VIEWS.includes(raw) ? raw : "overview";
  const parent = params.get("parent") || "";

  const [families, setFamilies] = useState<DigestFamily[] | null>(null);
  const [weekStart, setWeekStart] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<WeekStat[] | null>(null);

  const loadFamilies = useCallback(async () => {
    const res = await callEdgeFunction("weekly-digest", { action: "families" });
    if (!res.ok) {
      setError(edgeErrorMessage(res));
      setFamilies([]);
      return;
    }
    setError(null);
    setFamilies((res.families as DigestFamily[] | undefined) || []);
    setWeekStart(typeof res.week_start === "string" ? res.week_start : "");
  }, []);

  const loadHistory = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const since = new Date(Date.now() - 16 * 7 * 86400000).toISOString().slice(0, 10);
    const rows: LogRow[] = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data } = await supabase.from("weekly_digest_log").select("week_start, parent_user_id, status, detail, sent_at").gte("week_start", since).order("week_start", { ascending: false }).range(from, from + 999);
      const page = (data as LogRow[] | null) || [];
      rows.push(...page);
      if (page.length < 1000) break;
    }
    const by = new Map<string, WeekStat>();
    for (const r of rows) {
      const w = by.get(r.week_start) || { week: r.week_start, sent: 0, failed: 0, sending: 0, lastSent: null, failures: [] };
      w[r.status]++;
      if (r.status === "failed") w.failures.push(r);
      if (r.sent_at && (!w.lastSent || r.sent_at > w.lastSent)) w.lastSent = r.sent_at;
      by.set(r.week_start, w);
    }
    setWeeks([...by.values()].sort((a, b) => b.week.localeCompare(a.week)));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      if (!alive) return;
      await Promise.all([loadFamilies(), loadHistory()]);
    })();
    return () => {
      alive = false;
    };
  }, [loadFamilies, loadHistory]);

  const go = (v: DigestView, p?: string) => router.push(digestHref({ view: v, parent: p }));
  const tabValue = view === "preview" ? "families" : view;
  const real = (families || []).filter((f) => !f.is_test);
  const failedThisWeek = (families || []).filter((f) => f.this_week === "failed").length;

  return (
    <div className="space-y-4">
      <Tabs
        variant="switch"
        label="Weekly digest sections"
        value={tabValue}
        onChange={(k) => go(k)}
        items={[
          { key: "overview", label: "Overview" },
          { key: "families", label: "Families", count: families ? real.length : undefined },
          { key: "history", label: "History", count: failedThisWeek || undefined, countAlert: true },
          { key: "settings", label: "Settings" },
        ]}
      />
      {error && <Notice tone="bad">{error}</Notice>}

      {view === "overview" && <Overview families={families} weeks={weeks} weekStart={weekStart} onGo={go} />}
      {view === "families" && <Families families={families} />}
      {view === "preview" &&
        (parent ? (
          <div className="space-y-3">
            <Link href={digestHref({ view: "families" })} className={`${ui.btnSecondary} ${ui.sm}`}>
              ‹ All families
            </Link>
            <DigestPreview parentId={parent} family={(families || []).find((f) => f.parent_user_id === parent) || null} />
          </div>
        ) : (
          <EmptyState title="Choose a family to preview" icon="inbox" action={<Link href={digestHref({ view: "families" })} className={ui.btnPrimary}>Families</Link>} />
        ))}
      {view === "history" && <History weeks={weeks} families={families} />}
      {view === "settings" && <Settings />}
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────
function Overview({ families, weeks, weekStart, onGo }: { families: DigestFamily[] | null; weeks: WeekStat[] | null; weekStart: string; onGo: (v: DigestView) => void }) {
  const real = (families || []).filter((f) => !f.is_test);
  const optedOut = real.filter((f) => f.opted_out).length;
  const last = (weeks || [])[0] || null;
  const lastTone = !last ? "neutral" : last.failed > 0 ? "bad" : last.sending > 0 ? "warn" : "good";
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Next send" value={nextSendLabel()} sub="Every Friday, about 3pm UK time" />
        <Tile label="Last sent" value={last?.lastSent ? stampLabel(last.lastSent) : weeks ? "Not sent yet" : "…"} sub={last ? `Week of ${weekLabel(last.week)}` : undefined} />
        <Tile label="Families" value={families ? String(real.length - optedOut) : "…"} sub={families ? `get it · ${optedOut} opted out` : undefined} />
        <Tile
          label="Last run"
          value={!weeks ? "…" : !last ? "–" : `${last.sent} sent`}
          sub={last ? [last.failed ? `${last.failed} failed` : "", last.sending ? `${last.sending} still sending` : "", !last.failed && !last.sending ? "All delivered" : ""].filter(Boolean).join(" · ") : undefined}
          tone={lastTone}
        />
      </dl>

      <section className={ui.card}>
        <h2 className="text-base font-semibold text-ink">What parents get</h2>
        <p className="mt-1 text-sm text-ink/75">
          One email per family each Friday afternoon, covering each child&apos;s week: attendance, homework handed in and still to do, merits, teacher comments, any Star of the Week and next week&apos;s lessons. It sends once per family per week, and parents can switch it off from their family dashboard.
        </p>
        {weekStart && <p className="mt-2 text-xs text-ink/65">This week began on {weekLabel(weekStart)}.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => onGo("families")} className={ui.btnPrimary}>
            Preview a family&apos;s email
          </button>
          <button type="button" onClick={() => onGo("settings")} className={ui.btnSecondary}>
            Choose sections
          </button>
          {last && last.failed > 0 && (
            <button type="button" onClick={() => onGo("history")} className={ui.btnSecondary}>
              See what failed
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const dot = tone === "good" ? "bg-green-600" : tone === "warn" ? "bg-amber-500" : tone === "bad" ? "bg-red-600" : "";
  return (
    <div className="rounded-2xl border border-gold-light bg-white p-4">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-ink/65">
        {dot && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold leading-snug text-ink">{value}</dd>
      {sub && <dd className="text-xs text-ink/65">{sub}</dd>}
    </div>
  );
}

// ── Families ────────────────────────────────────────────────────────────
type Show = "all" | "receiving" | "opted_out" | "failed" | "test";

function Families({ families }: { families: DigestFamily[] | null }) {
  const [year, setYear] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [open, setOpen] = useState<DigestFamily | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const years = useMemo(() => Array.from(new Set((families || []).flatMap((f) => (f.children_detail || []).map((c) => c.year_group || "")).filter(Boolean))).sort((a, b) => a.localeCompare(b, "en-GB", { numeric: true })), [families]);
  const rows = useMemo(
    () =>
      (families || []).filter((f) => {
        if (year && !(f.children_detail || []).some((c) => c.year_group === year)) return false;
        if (show === "receiving") return !f.opted_out && !f.is_test;
        if (show === "opted_out") return f.opted_out;
        if (show === "failed") return f.this_week === "failed";
        if (show === "test") return !!f.is_test;
        return true;
      }),
    [families, year, show]
  );

  const columns: Column<DigestFamily>[] = [
    {
      key: "parent",
      header: "Parent",
      sort: (f) => f.parent_name || f.parent_email,
      csv: (f) => f.parent_name,
      cell: (f) => (
        <span className="min-w-0">
          <span className="block font-medium text-ink">{f.parent_name || f.parent_email}</span>
          {f.parent_name && <span className="block truncate text-xs text-ink/60">{f.parent_email}</span>}
        </span>
      ),
    },
    {
      key: "children",
      header: "Children",
      sort: (f) => f.children.join(", "),
      csv: (f) => f.children.join("; "),
      cell: (f) => <span className="text-ink/80">{(f.children_detail || f.children.map((n) => ({ name: n, year_group: null }))).map((c) => (c.year_group ? `${c.name} (${c.year_group})` : c.name)).join(", ")}</span>,
    },
    {
      key: "status",
      header: "This week",
      sort: (f) => (f.opted_out ? "z" : f.this_week || "y"),
      csv: (f) => (f.opted_out ? "Opted out" : f.this_week ? STATUS_TEXT[f.this_week] : "Not sent yet"),
      cell: (f) =>
        f.opted_out ? (
          <StatusChip>Opted out</StatusChip>
        ) : f.this_week === "sent" ? (
          <StatusChip tone="good">Sent</StatusChip>
        ) : f.this_week === "failed" ? (
          <span title={f.this_week_detail || undefined}>
            <StatusChip tone="bad">Failed</StatusChip>
          </span>
        ) : f.this_week === "sending" ? (
          <StatusChip tone="warn">Sending</StatusChip>
        ) : (
          <span className="text-xs text-ink/60">{f.is_test ? "Test family" : "Not sent yet"}</span>
        ),
    },
    {
      key: "preview",
      header: "",
      align: "right",
      cell: (f) => (
        <button type="button" onClick={() => setOpen(f)} className={`${ui.btnSecondary} ${ui.sm}`}>
          Preview
        </button>
      ),
    },
  ];

  return (
    <>
      <DataTable
        caption="Families who get the weekly digest"
        rows={families === null ? null : rows}
        rowKey={(f) => f.parent_user_id}
        columns={columns}
        search={{ text: (f) => `${f.parent_name} ${f.parent_email} ${f.children.join(" ")}`, placeholder: "Search parent or child" }}
        filters={
          <>
            <Select allowEmpty value={show} onChange={(e) => setShow(e.target.value as Show)} aria-label="Show" className={`${ui.input} !w-auto`}>
              <option value="all">All families</option>
              <option value="receiving">Receiving it</option>
              <option value="opted_out">Opted out</option>
              <option value="failed">Failed this week</option>
              <option value="test">Test families</option>
            </Select>
            {years.length > 0 && (
              <Select allowEmpty value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year group" className={`${ui.input} !w-auto`}>
                <option value="">All year groups</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            )}
          </>
        }
        initialSort={{ key: "parent", dir: "asc" }}
        csvName="digest-families"
        empty="No families with an email address yet."
        emptyFiltered="No families match."
      />
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" role="dialog" aria-modal="true" aria-label={`Digest preview: ${open.parent_name || open.parent_email}`}>
          <button type="button" aria-label="Close" className="flex-1 cursor-default" onClick={() => setOpen(null)} />
          <div className="flex h-full w-full max-w-2xl flex-col bg-cream shadow-2xl">
            <div className="flex items-center gap-2 border-b border-gold-light bg-white px-4 py-3">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">Preview: {open.parent_name || open.parent_email}</p>
              <button type="button" autoFocus onClick={() => setOpen(null)} className={`${ui.btnSecondary} ${ui.sm}`}>
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <DigestPreview parentId={open.parent_user_id} family={open} compact />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── History ─────────────────────────────────────────────────────────────
function History({ weeks, families }: { weeks: WeekStat[] | null; families: DigestFamily[] | null }) {
  const nameOf = (id: string) => {
    const f = (families || []).find((x) => x.parent_user_id === id);
    return f ? f.parent_name || f.parent_email : "A family no longer on roll";
  };
  if (weeks === null) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  if (weeks.length === 0)
    return (
      <EmptyState title="Nothing has been sent yet" icon="inbox">
        Each Friday&apos;s run appears here with how many emails went and any that failed.
      </EmptyState>
    );
  return (
    <section className="rounded-2xl border border-gold-light bg-white">
      <ul className="divide-y divide-gold-light/60">
        {weeks.map((w) => (
          <li key={w.week} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="min-w-[9rem] font-medium text-ink">Week of {weekLabel(w.week)}</span>
              <span className="text-ink/75">{w.sent} sent</span>
              {w.failed > 0 && <StatusChip tone="bad">{w.failed} failed</StatusChip>}
              {w.sending > 0 && <StatusChip tone="warn">{w.sending} sending</StatusChip>}
              {w.failed === 0 && w.sending === 0 && <StatusChip tone="good">All delivered</StatusChip>}
              <span className="ml-auto text-xs text-ink/60">{w.lastSent ? `Last sent ${stampLabel(w.lastSent)}` : ""}</span>
            </div>
            {w.failures.length > 0 && (
              <details className="mt-1.5">
                <summary className="cursor-pointer text-xs font-medium text-teal-700">Which families failed</summary>
                <ul className="mt-1 space-y-0.5 text-xs text-ink/70">
                  {w.failures.slice(0, 50).map((f) => (
                    <li key={f.parent_user_id}>
                      {nameOf(f.parent_user_id)}
                      {f.detail ? ` · ${f.detail}` : ""}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] text-ink/60">Failed emails are retried automatically on the next scheduled run that week.</p>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Settings ────────────────────────────────────────────────────────────
type Cfg = { include_attendance: boolean; include_homework: boolean; include_merits: boolean; include_comments: boolean; include_star: boolean; include_next_week: boolean; intro: string | null };
const DEFAULTS: Cfg = { include_attendance: true, include_homework: true, include_merits: true, include_comments: true, include_star: true, include_next_week: true, intro: null };
const SECTIONS: { key: keyof Omit<Cfg, "intro">; label: string; hint: string }[] = [
  { key: "include_attendance", label: "Attendance", hint: "Lessons attended this week, and a gentle line about any missed." },
  { key: "include_homework", label: "Homework", hint: "Handed in, still to hand in, and due next week." },
  { key: "include_merits", label: "Merits", hint: "Merit points earned this week. Demerits are never included." },
  { key: "include_comments", label: "Teacher comments", hint: "Notes written with merits, and released homework feedback." },
  { key: "include_star", label: "Star of the Week", hint: "A celebratory line when the child was a star." },
  { key: "include_next_week", label: "Next week's lessons", hint: "From the published timetable, with any closures." },
];

function Settings() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    supabase
      .from("digest_settings")
      .select("include_attendance, include_homework, include_merits, include_comments, include_star, include_next_week, intro")
      .eq("id", true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setMissing(true);
        setCfg({ ...DEFAULTS, ...((data as Partial<Cfg> | null) || {}) });
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !cfg) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("digest_settings").upsert({ id: true, ...cfg, intro: cfg.intro?.trim() || null }, { onConflict: "id" });
    setBusy(false);
    setMsg(error ? { tone: "bad", text: `Couldn't save. Please try again.` } : { tone: "good", text: "Saved. Friday's digest will use these settings; previews use them straight away." });
  };

  if (!cfg) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  return (
    <section className={`${ui.card} space-y-4`}>
      {missing && <Notice tone="warn">Settings aren&apos;t switched on on the server yet; every section is included. They will work after the next update.</Notice>}
      <div>
        <h2 className="text-base font-semibold text-ink">Sections in the email</h2>
        <p className={ui.hint}>Switch off anything you don&apos;t want parents to get. Each child&apos;s section follows the same order.</p>
        <div className="mt-2 divide-y divide-gold-light/50">
          {SECTIONS.map((s) => (
            <Switch key={s.key} checked={cfg[s.key]} onChange={(v) => setCfg((c) => (c ? { ...c, [s.key]: v } : c))} label={s.label} hint={s.hint} />
          ))}
        </div>
      </div>
      <label className={ui.label}>
        Opening line (optional)
        <textarea rows={2} maxLength={600} value={cfg.intro || ""} onChange={(e) => setCfg((c) => (c ? { ...c, intro: e.target.value } : c))} className={`mt-1 ${ui.input}`} placeholder="Here is a summary of the week and what is coming up." />
        <span className={ui.hint}>Shown under the greeting. Leave blank for the standard line.</span>
      </label>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <button type="button" disabled={busy || missing} onClick={save} className={ui.btnPrimary}>
        {busy ? "Saving…" : "Save settings"}
      </button>
    </section>
  );
}
